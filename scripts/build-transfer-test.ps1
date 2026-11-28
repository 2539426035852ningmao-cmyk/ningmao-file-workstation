param(
    [Parameter(Mandatory)][string]$PreviewDirectory,
    [Parameter(Mandatory)][string]$OutputDirectory
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$repo = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'verify-preview-package.ps1')
$preview = [IO.Path]::GetFullPath($PreviewDirectory)
$output = [IO.Path]::GetFullPath($OutputDirectory)
$null = Test-PreviewPackage $preview
if (Test-Path -LiteralPath $output) { throw 'Transfer test output already exists.' }

Push-Location (Join-Path $repo 'apps/web')
try {
    npm run build
    if ($LASTEXITCODE) { throw 'Web build failed.' }
} finally {
    Pop-Location
}

foreach ($subdir in @('app', 'web', 'web/src', '合成测试文件', '桌面收件', '网页收件')) {
    $null = New-Item -ItemType Directory -Path (Join-Path $output $subdir)
}
Copy-Item -LiteralPath (Join-Path $preview 'Ningmao-Preview-0.1.0-x64.exe') -Destination (Join-Path $output 'app')
foreach ($file in @('LICENSE.txt', 'THIRD_PARTY_NOTICES.txt', 'license-manifest.json', 'build-manifest.json')) {
    Copy-Item -LiteralPath (Join-Path $preview $file) -Destination $output
}
foreach ($name in @('selfhost', 'dist')) {
    Copy-Item -LiteralPath (Join-Path $repo "apps/web/$name") -Destination (Join-Path $output 'web') -Recurse
}
foreach ($name in @('file-preparation.mjs', 'file-utils.mjs', 'animal-avatars.mjs')) {
    Copy-Item -LiteralPath (Join-Path $repo "apps/web/src/$name") -Destination (Join-Path $output 'web/src')
}
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'transfer-test/start-test.mjs') -Destination $output
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'transfer-test/Start-Transfer-Test.vbs') -Destination (Join-Path $output '启动互传测试.vbs')
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'transfer-test/Start-Transfer-Test.vbs') -Destination (Join-Path $output 'Start-Room-Host.vbs')
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'transfer-test/Start-Transfer-Test.vbs') -Destination (Join-Path $output 'Start-Account-Station.vbs')
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'transfer-test/使用说明.md') -Destination $output
Set-Content -LiteralPath (Join-Path $output '合成测试文件/软件发出.txt') -Value '柠猫合成测试文件。方向为软件端发送，网页端接收。' -Encoding UTF8
Set-Content -LiteralPath (Join-Path $output '合成测试文件/网页发出.txt') -Value '柠猫合成测试文件。方向为网页端发送，软件端接收。' -Encoding UTF8
Get-ChildItem -LiteralPath $output -File -Recurse | Sort-Object FullName | ForEach-Object {
    '{0}  {1}' -f (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant(), [IO.Path]::GetRelativePath($output, $_.FullName)
} | Set-Content -LiteralPath (Join-Path $output 'SHA256SUMS.txt') -Encoding utf8
Write-Output $output
