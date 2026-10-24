param([string]$Path, [string]$OutputPath)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Assert-PreviewMsi($Tables, [string]$Template) {
    $properties = @{}
    foreach ($row in $Tables.Property) { $properties[$row.Property] = $row.Value }
    if ($properties.ProductName -ne 'Ningmao File Workstation Preview' -or $properties.ProductVersion -ne '0.1.0') { throw 'Unexpected preview identity/version' }
    if ($properties.UpgradeCode -ne '{49745F80-2F01-42DF-B527-1EE339187A71}') { throw 'Unexpected preview upgrade identity' }
    if ($Template -notmatch '^x64;') { throw 'Expected x64 package' }
    $expected = @('ningmao-file-workstation.exe','LICENSE.txt','THIRD_PARTY_NOTICES.txt','manifest.json')
    $names = @($Tables.File | ForEach-Object { ($_.FileName -split '\|')[-1] })
    if ($names.Count -ne $expected.Count -or @(Compare-Object $names $expected).Count) { throw 'Unexpected/missing payload files' }
    # No arbitrary user-data cleanup. Only empty install/menu/desktop directories may be removed.
    foreach ($row in $Tables.RemoveFile) {
        if ($row.FileName -or $row.DirProperty -notin @('INSTALLDIR','ApplicationProgramsFolder','DesktopFolder')) { throw 'Unsafe RemoveFile user-data cleanup' }
    }
    if (@($Tables.Environment).Count) { throw 'Unexpected environment modification' }
    foreach ($row in $Tables.Registry) {
        if ($row.Key -match '(?i)(\\Run(Once)?$|\\Services\\|\\TaskCache\\|\\shell\\)') { throw 'Unexpected auto-start/system integration' }
    }
    foreach ($row in $Tables.CustomAction) {
        if ($row.Action -match '(?i)(webview|bootstrapper|elevated|scheduled|task)' -or $row.Target -match '(?i)(mshta|powershell|cmd\.exe|schtasks|rundll32)') { throw 'Unexpected executable custom action' }
    }
    foreach ($row in $Tables.InstallExecuteSequence) {
        if ($row.Action -eq 'LaunchApplication' -and $row.Condition -ne 'AUTOLAUNCHAPP AND NOT Installed') { throw 'Unexpected automatic launch condition' }
    }
}
function Read-PreviewMsi([string]$File) {
    if (-not $IsWindows) { throw 'MSI database inspection requires Windows' }
    $installer = New-Object -ComObject WindowsInstaller.Installer
    $database = $null
    function Invoke-Com($Object, [string]$Member, [object[]]$Arguments) {
        $Object.GetType().InvokeMember($Member, 'InvokeMethod', $null, $Object, $Arguments)
    }
    try {
        # 0 = msiOpenDatabaseModeReadOnly. Never InstallProduct, Commit or msiexec.
        $database = Invoke-Com $installer 'OpenDatabase' @((Resolve-Path -LiteralPath $File).Path, 0)
        $schema = [ordered]@{
            Property = @('Property','Value')
            File = @('File','FileName','FileSize','Version')
            Directory = @('Directory','Directory_Parent','DefaultDir')
            RemoveFile = @('FileKey','FileName','DirProperty','InstallMode')
            CustomAction = @('Action','Type','Source','Target')
            InstallExecuteSequence = @('Action','Condition','Sequence')
            Environment = @('Environment','Name','Value')
            Registry = @('Registry','Root','Key','Name','Value')
        }
        $tables = [ordered]@{}
        $tableView = Invoke-Com $database 'OpenView' @('SELECT `Name` FROM `_Tables`')
        $existing = [Collections.Generic.List[string]]::new()
        try {
            $null = Invoke-Com $tableView 'Execute' @()
            while ($record = Invoke-Com $tableView 'Fetch' @()) {
                try { $existing.Add($record.GetType().InvokeMember('StringData', 'GetProperty', $null, $record, @(1))) }
                finally { $null = [Runtime.InteropServices.Marshal]::FinalReleaseComObject($record) }
            }
        } finally { $null = [Runtime.InteropServices.Marshal]::FinalReleaseComObject($tableView) }
        foreach ($name in $schema.Keys) {
            if ($name -notin $existing) {
                if ($name -notin @('RemoveFile','Environment','Registry')) { throw "Required MSI table missing: $name" }
                $tables[$name] = @()
                continue
            }
            $view = $null
            $rows = [Collections.Generic.List[object]]::new()
            try {
                $selected = ($schema[$name] | ForEach-Object { [string][char]96 + $_ + [char]96 }) -join ','
                $view = Invoke-Com $database 'OpenView' @("SELECT $selected FROM $([char]96)$name$([char]96)")
                $null = Invoke-Com $view 'Execute' @()
                while ($record = Invoke-Com $view 'Fetch' @()) {
                    try {
                        $data = [ordered]@{}
                        for ($index = 1; $index -le $schema[$name].Count; $index++) {
                            $data[$schema[$name][$index - 1]] = $record.GetType().InvokeMember('StringData', 'GetProperty', $null, $record, @($index))
                        }
                        $rows.Add([pscustomobject]$data)
                    } finally { $null = [Runtime.InteropServices.Marshal]::FinalReleaseComObject($record) }
                }
            } finally {
                if ($view) { $null = [Runtime.InteropServices.Marshal]::FinalReleaseComObject($view) }
            }
            $tables[$name] = $rows.ToArray()
        }
        $summary = $database.GetType().InvokeMember('SummaryInformation', 'GetProperty', $null, $database, @(0))
        try { $template = $summary.GetType().InvokeMember('Property', 'GetProperty', $null, $summary, @(7)) }
        finally { $null = [Runtime.InteropServices.Marshal]::FinalReleaseComObject($summary) }
        Assert-PreviewMsi $tables $template
        return [ordered]@{ schema=1; inspection='Read-only database inspection; no installation, launch, upgrade or uninstall performed'; template=$template; tables=$tables }
    } finally {
        if ($database) { $null = [Runtime.InteropServices.Marshal]::FinalReleaseComObject($database) }
        $null = [Runtime.InteropServices.Marshal]::FinalReleaseComObject($installer)
    }
}
if ($Path) {
    if (-not $OutputPath) { throw 'OutputPath is required' }
    $result = Read-PreviewMsi $Path
    $result | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $OutputPath -Encoding utf8
    Write-Output 'MSI read-only inspection passed; package was not installed or launched.'
}
