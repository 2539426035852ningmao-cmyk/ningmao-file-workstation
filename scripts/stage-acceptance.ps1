param(
    [Parameter(Mandatory)][string]$Root,
    [ValidateSet('Prepare','Verify','Launch')][string]$Mode = 'Prepare',
    [string]$CandidateDirectory
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$rootPath = [IO.Path]::GetFullPath($Root)
if ($rootPath -eq [IO.Path]::GetPathRoot($rootPath)) { throw 'Use a new, explicitly named fixture directory' }
$rootPath=$rootPath.TrimEnd([char[]]'\/')
if ((Test-Path -LiteralPath $rootPath) -and ((Get-Item -LiteralPath $rootPath -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Fixture links are not allowed' }
$files = @('source/English.txt','source/中文 空格.txt','source/合成图片.png','source/合成文件夹/说明.txt','bound-target/English.txt')
function PlainPath([string]$Relative) {
    if ($Relative -notin $files) { throw 'Unexpected fixture path' }
    $file = Join-Path $rootPath $Relative
    $part = $file
    while ($part.Length -ge $rootPath.Length) {
        if ((Test-Path -LiteralPath $part) -and ((Get-Item -LiteralPath $part -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Fixture links are not allowed' }
        if ($part -eq $rootPath) { break }
        $part = Split-Path -Parent $part
    }
    return $file
}
if ($Mode -eq 'Prepare') {
    if (Test-Path -LiteralPath $rootPath) { throw 'Refuse to overwrite an existing fixture directory' }
    foreach ($folder in @('source/合成文件夹','bound-target','drag-out','data','webview')) { [IO.Directory]::CreateDirectory((Join-Path $rootPath $folder)) | Out-Null }
    [IO.File]::WriteAllText((PlainPath 'source/English.txt'),"Ningmao synthetic source. Keep original bytes.`n")
    [IO.File]::WriteAllText((PlainPath 'source/中文 空格.txt'),"柠猫合成测试；来源应保留。`n")
    [IO.File]::WriteAllText((PlainPath 'source/合成文件夹/说明.txt'),"合成文件夹内容；不含私人素材。`n")
    [IO.File]::WriteAllText((PlainPath 'bound-target/English.txt'),"Existing synthetic target. Never overwrite.`n")
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot '../apps/desktop/src-tauri/icons/128x128.png') -Destination (PlainPath 'source/合成图片.png')
    $rows = @($files | ForEach-Object { [ordered]@{file=$_;sha256=(Get-FileHash -LiteralPath (PlainPath $_) -Algorithm SHA256).Hash.ToLowerInvariant()} })
    [ordered]@{schema=1;syntheticOnly=$true;protected=$rows} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $rootPath 'fixture-manifest.json') -Encoding utf8
    Write-Output 'Synthetic fixtures prepared. No application or Explorer was started.'
    return
}
$manifestFile=Join-Path $rootPath 'fixture-manifest.json'
if ((Get-Item -LiteralPath $manifestFile -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Fixture links are not allowed' }
$manifest = Get-Content -LiteralPath $manifestFile -Raw | ConvertFrom-Json
if ($manifest.schema -ne 1 -or -not $manifest.syntheticOnly -or @($manifest.protected).Count -ne $files.Count -or @(Compare-Object @($manifest.protected.file) $files).Count) { throw 'Unexpected fixture manifest' }
foreach ($row in $manifest.protected) {
    if ((Get-FileHash -LiteralPath (PlainPath $row.file) -Algorithm SHA256).Hash.ToLowerInvariant() -ne $row.sha256) { throw 'Protected synthetic source or existing target changed' }
}
if ($Mode -eq 'Verify') { Write-Output 'All five protected synthetic files are unchanged. This does not prove native interactions occurred.'; return }
if (-not $IsWindows -or -not $CandidateDirectory) { throw 'Launch requires Windows and an explicit candidate directory' }
foreach ($folder in @('data','webview')) { if ((Get-Item -LiteralPath (Join-Path $rootPath $folder) -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Fixture links are not allowed' } }
# Launch is an explicit operator action after desktop approval
. (Join-Path $PSScriptRoot 'verify-preview-package.ps1')
$candidate = [IO.Path]::GetFullPath($CandidateDirectory)
$identity = Test-PreviewPackage $candidate
$inspectionFile=Join-Path $rootPath 'candidate-inspection.json'
if ((Test-Path -LiteralPath $inspectionFile) -and ((Get-Item -LiteralPath $inspectionFile -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Fixture links are not allowed' }
$identity | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $inspectionFile -Encoding utf8
$start = [Diagnostics.ProcessStartInfo]::new((Join-Path $candidate 'Ningmao-Preview-0.1.0-x64.exe'))
$start.UseShellExecute = $false
$start.WorkingDirectory = $candidate
$start.Environment['NINGMAO_DATA_DIR'] = Join-Path $rootPath 'data'
$start.Environment['WEBVIEW2_USER_DATA_FOLDER'] = Join-Path $rootPath 'webview'
$process = [Diagnostics.Process]::Start($start)
Write-Output ('Explicitly started the inspected candidate, process ' + $process.Id)
