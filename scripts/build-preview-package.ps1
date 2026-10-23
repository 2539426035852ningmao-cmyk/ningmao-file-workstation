$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if (-not $IsWindows) { throw 'Windows packaging requires Windows' }
$repo = Split-Path -Parent $PSScriptRoot
function Run([string]$Program, [string[]]$Arguments) {
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Program failed: $LASTEXITCODE" }
}
Push-Location $repo
try {
    Run node @('--test','scripts/collect-licenses.test.mjs')
    & ./scripts/inspect-msi.test.ps1
    Run node @('scripts/collect-licenses.mjs')
    Push-Location apps/desktop
    try {
        Run npm @('run','tauri','--','build','--debug','--ci','--bundles','msi','--config','src-tauri/tauri.preview.conf.json','--','--locked')
    } finally { Pop-Location }
    $target = if ($env:CARGO_TARGET_DIR) { [IO.Path]::GetFullPath($env:CARGO_TARGET_DIR) } else { Join-Path $repo 'apps/desktop/src-tauri/target' }
    $msi = @(Get-ChildItem -LiteralPath (Join-Path $target 'debug/bundle/msi') -Filter '*.msi' -File)
    if ($msi.Count -ne 1) { throw 'Expected exactly one MSI in clean build directory' }
    $exe = Join-Path $target 'debug/ningmao-file-workstation.exe'
    if ((Get-Item -LiteralPath $exe).VersionInfo.ProductVersion -notmatch '^0\.1\.0($|\+)') { throw 'Unexpected executable version' }
    $out = Join-Path $repo 'apps/desktop/preview-package'
    if ((Test-Path -LiteralPath $out) -and @(Get-ChildItem -LiteralPath $out -Force).Count) { throw 'Output directory must be empty; use a clean checkout' }
    $null = New-Item -ItemType Directory -Path $out -Force
    Copy-Item -LiteralPath $msi[0].FullName -Destination (Join-Path $out 'Ningmao-Preview-0.1.0-x64.msi')
    Copy-Item -LiteralPath $exe -Destination (Join-Path $out 'Ningmao-Preview-0.1.0-x64.exe')
    Copy-Item -LiteralPath 'LICENSE' -Destination (Join-Path $out 'LICENSE.txt')
    Copy-Item -LiteralPath 'apps/desktop/.license-bundle/THIRD_PARTY_NOTICES.txt' -Destination $out
    Copy-Item -LiteralPath 'apps/desktop/.license-bundle/manifest.json' -Destination (Join-Path $out 'license-manifest.json')
    & ./scripts/inspect-msi.ps1 -Path (Join-Path $out 'Ningmao-Preview-0.1.0-x64.msi') -OutputPath (Join-Path $out 'msi-inspection.json')
    $commit = & git rev-parse HEAD
    if ($LASTEXITCODE) { throw 'Cannot read source commit' }
    [ordered]@{
        schema=1; sourceCommit=$commit.Trim(); version='0.1.0'; architecture='x64'; profile='debug'
        identifier='app.ningmao.fileworkstation.preview'; signed=$false; installedOrLaunched=$false
        webview2='Existing runtime required; bootstrapper not bundled'
        review='Preview only. Read license-manifest warnings. Native experience, installation, upgrade and uninstall remain unverified.'
    } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $out 'build-manifest.json') -Encoding utf8
    Copy-Item -LiteralPath 'docs/preview-package.md' -Destination (Join-Path $out 'README.md')
    $hashes = Get-ChildItem -LiteralPath $out -File | Sort-Object Name | ForEach-Object {
        '{0}  {1}' -f (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant(), $_.Name
    }
    $hashes | Set-Content -LiteralPath (Join-Path $out 'SHA256SUMS.txt') -Encoding utf8
    Write-Output 'Preview package created and inspected; no installation or application launch performed.'
} finally { Pop-Location }
