param([switch]$Browser, [switch]$Native)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
function Run([string]$Program, [string[]]$Arguments) {
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Program 执行失败，退出码 $LASTEXITCODE" }
}
Push-Location (Join-Path $repo 'experiments/m1-03/ui-comparison')
try {
    Run npm @('ci', '--registry=https://registry.npmjs.org', '--ignore-scripts', '--no-audit', '--no-fund')
    Run npm @('test')
    Run npm @('run', 'build')
    if ($Browser) {
        Run npx @('playwright', 'install', '--with-deps', 'chromium')
        Run npm @('run', 'test:ui')
    }
    if ($Native) {
        if (-not $IsWindows) { throw '原生样机仅在 Windows 构建。' }
        Run cargo @('fmt', '--manifest-path', 'src-tauri/Cargo.toml', '--', '--check')
        Run cargo @('test', '--locked', '--manifest-path', 'src-tauri/Cargo.toml', '--lib')
        Run cargo @('clippy', '--locked', '--manifest-path', 'src-tauri/Cargo.toml', '--all-targets', '--', '-D', 'warnings')
        Run npm @('run', 'tauri', '--', 'build', '--debug', '--no-bundle', '--ci', '--', '--locked')
    }
} finally { Pop-Location }
