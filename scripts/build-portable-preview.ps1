param([Parameter(Mandatory)][string]$PackageDirectory, [Parameter(Mandatory)][string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'verify-preview-package.ps1')
$package = [IO.Path]::GetFullPath($PackageDirectory)
$output = [IO.Path]::GetFullPath($OutputDirectory)
$null = Test-PreviewPackage $package
if (Test-Path -LiteralPath $output) { throw 'Portable output already exists; refusing to overwrite it.' }
$null = New-Item -ItemType Directory -Path $output
foreach ($name in @('app','data','webview')) { $null = New-Item -ItemType Directory -Path (Join-Path $output $name) }
Copy-Item -LiteralPath (Join-Path $package 'Ningmao-Preview-0.1.0-x64.exe') -Destination (Join-Path $output 'app')
foreach ($name in @('LICENSE.txt','THIRD_PARTY_NOTICES.txt','license-manifest.json','build-manifest.json')) { Copy-Item -LiteralPath (Join-Path $package $name) -Destination $output }
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'portable/Start-Ningmao.cmd') -Destination $output
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'portable/README.md') -Destination $output
if ((Get-FileHash (Join-Path $package 'Ningmao-Preview-0.1.0-x64.exe')).Hash -ne (Get-FileHash (Join-Path $output 'app/Ningmao-Preview-0.1.0-x64.exe')).Hash) { throw 'Portable executable hash mismatch' }
Get-ChildItem -LiteralPath $output -File -Recurse | Sort-Object FullName | ForEach-Object { '{0}  {1}' -f (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant(), [IO.Path]::GetRelativePath($output,$_.FullName) } | Set-Content -LiteralPath (Join-Path $output 'SHA256SUMS.txt') -Encoding utf8
Write-Output 'Portable preview prepared; no installation or launch performed.'
