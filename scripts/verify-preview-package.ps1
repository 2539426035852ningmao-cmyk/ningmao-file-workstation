param([string]$Directory, [string]$ReportPath)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'inspect-msi.ps1')

function Assert-PreviewChecksums([string]$Folder) {
    $expected = @('build-manifest.json','license-manifest.json','LICENSE.txt','msi-inspection.json',
        'Ningmao-Preview-0.1.0-x64.exe','Ningmao-Preview-0.1.0-x64.msi','README.md','THIRD_PARTY_NOTICES.txt')
    $entries = @(Get-ChildItem -LiteralPath $Folder -Force)
    if ($entries.Count -ne 9 -or @(Compare-Object @($entries.Name) @($expected + 'SHA256SUMS.txt')).Count) { throw 'Unexpected package payload' }
    foreach ($entry in @((Get-Item -LiteralPath $Folder)) + $entries) {
        if ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Package links are not allowed' }
    }
    if (@($entries | Where-Object PSIsContainer).Count) { throw 'Unexpected payload directory' }
    $seen = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    $rows = [Collections.Generic.List[object]]::new()
    foreach ($line in Get-Content -LiteralPath (Join-Path $Folder 'SHA256SUMS.txt')) {
        if ($line -notmatch '^([a-fA-F0-9]{64})  ([^/\\]+)$') { throw 'Invalid checksum entry' }
        $hash = $Matches[1].ToLowerInvariant()
        $name = $Matches[2]
        if ($name -notin $expected -or -not $seen.Add($name)) { throw 'Unexpected or duplicate checksum entry' }
        $file = Get-Item -LiteralPath (Join-Path $Folder $name)
        if ((Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant() -ne $hash) { throw "SHA256 mismatch: $name" }
        $rows.Add([pscustomobject]@{name=$name;bytes=$file.Length;sha256=$hash})
    }
    if ($seen.Count -ne $expected.Count) { throw 'Incomplete checksum coverage' }
    return $rows.ToArray()
}

function Test-PreviewPackage([string]$Folder) {
    if (-not $IsWindows) { throw 'Read-only preview verification requires Windows' }
    $verified = @(Assert-PreviewChecksums $Folder)
    $msi = Join-Path $Folder 'Ningmao-Preview-0.1.0-x64.msi'
    $inspection = Read-PreviewMsi $msi
    $saved = Get-Content -LiteralPath (Join-Path $Folder 'msi-inspection.json') -Raw | ConvertFrom-Json
    if (($inspection | ConvertTo-Json -Depth 12 -Compress) -cne ($saved | ConvertTo-Json -Depth 12 -Compress)) { throw 'Saved MSI inspection does not match actual package' }
    $mapping = @{
        'ningmao-file-workstation.exe'='Ningmao-Preview-0.1.0-x64.exe'
        'LICENSE.txt'='LICENSE.txt'
        'THIRD_PARTY_NOTICES.txt'='THIRD_PARTY_NOTICES.txt'
        'manifest.json'='license-manifest.json'
    }
    foreach ($file in $inspection.tables.File) {
        $name = ($file.FileName -split '\|')[-1]
        if ([long]$file.FileSize -ne (Get-Item -LiteralPath (Join-Path $Folder $mapping[$name])).Length) { throw 'Embedded payload size mismatch' }
    }
    $exe = Join-Path $Folder 'Ningmao-Preview-0.1.0-x64.exe'
    $stream = [IO.File]::OpenRead($exe)
    $reader = [IO.BinaryReader]::new($stream)
    try {
        if ($reader.ReadUInt16() -ne 0x5A4D) { throw 'Missing executable MZ header' }
        $stream.Position = 0x3c
        $offset = $reader.ReadInt32()
        if ($offset -lt 64 -or $offset -gt $stream.Length - 26) { throw 'Invalid PE offset' }
        $stream.Position = $offset
        if ($reader.ReadUInt32() -ne 0x4550 -or $reader.ReadUInt16() -ne 0x8664) { throw 'Expected PE x64 executable' }
        $stream.Position = $offset + 24
        if ($reader.ReadUInt16() -ne 0x20b) { throw 'Expected PE32+ executable' }
    } finally { $reader.Dispose(); $stream.Dispose() }
    $version = (Get-Item -LiteralPath $exe).VersionInfo
    if ($version.ProductVersion -ne '0.1.0' -or $version.ProductName -ne 'Ningmao File Workstation Preview') { throw 'Unexpected preview executable identity' }
    foreach ($file in @($exe, $msi)) {
        if ((Get-AuthenticodeSignature -LiteralPath $file).Status.ToString() -ne 'NotSigned') { throw 'Expected unsigned preview; review signing policy before changing this check' }
    }
    $build = Get-Content -LiteralPath (Join-Path $Folder 'build-manifest.json') -Raw | ConvertFrom-Json
    if ($build.sourceCommit -notmatch '^[a-f0-9]{40}$' -or $build.version -ne '0.1.0' -or $build.architecture -ne 'x64' -or
        $build.identifier -ne 'app.ningmao.fileworkstation.preview' -or $build.profile -ne 'debug' -or
        $build.signed -ne $false -or $build.installedOrLaunched -ne $false) { throw 'Unexpected build manifest identity' }
    $licenses = Get-Content -LiteralPath (Join-Path $Folder 'license-manifest.json') -Raw | ConvertFrom-Json
    if ($licenses.schema -ne 1 -or @($licenses.missing).Count) { throw 'Missing license text records' }
    # Recheck every covered byte after database/PE inspection, not only the MSI.
    $null = Assert-PreviewChecksums $Folder
    return [ordered]@{
        schema=1; architecture='PE32+ x64'; productName=$version.ProductName; version=$version.ProductVersion
        signature='NotSigned'; sourceCommit=$build.sourceCommit; files=$verified
        embeddedPayloadSizesMatch=$true; savedInspectionMatches=$true; filesUnchangedAfterInspection=$true
        licenseRecords=@($licenses.packages).Count; licenseWarnings=@($licenses.warnings).Count
        boundary='Read-only checks; embedded file bytes not extracted. No installation, launch, upgrade or uninstall performed; license collection is not complete release clearance.'
    }
}
if ($Directory) {
    $result = Test-PreviewPackage $Directory
    $json = $result | ConvertTo-Json -Depth 8
    if ($ReportPath) { $json | Set-Content -LiteralPath $ReportPath -Encoding utf8 }
    Write-Output $json
}
