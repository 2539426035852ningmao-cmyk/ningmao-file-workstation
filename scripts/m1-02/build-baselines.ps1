param([ValidateSet('A', 'B', 'Both')][string]$Baseline = 'Both')
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if (-not $IsWindows) { throw 'M1-02 原生构建脚本仅支持 Windows。' }
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$scratch = Join-Path $repo '.m1-02-work'
New-Item -ItemType Directory -Path $scratch -Force | Out-Null

function Run([string]$Program, [string[]]$Arguments) {
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Program 执行失败，退出码 $LASTEXITCODE" }
}

if ($Baseline -in @('A', 'Both')) {
    $revision = '35644fe0f1c4eeda4c9bd4deb02bb7b8b4b6b734'
    $upstream = Join-Path $scratch 'holdem'
    if (-not (Test-Path -LiteralPath $upstream)) {
        Run git @('init', $upstream)
        Run git @('-C', $upstream, 'remote', 'add', 'origin', 'https://github.com/iamzubin/holdem.git')
        Run git @('-C', $upstream, 'fetch', '--depth=1', 'origin', $revision)
        Run git @('-C', $upstream, 'checkout', '--detach', 'FETCH_HEAD')
    }
    $head = & git -C $upstream rev-parse HEAD
    if ($LASTEXITCODE -ne 0 -or $head -ne $revision) { throw 'A 源码版本不符；不会覆盖现有目录。' }
    # Tauri rewrites Cargo.toml line endings. Compare Git-normalized content,
    # while still refusing actual staged/unstaged edits and untracked sources.
    Run git @('-C', $upstream, 'diff', '--quiet', 'HEAD', '--')
    $untracked = & git -C $upstream ls-files --others --exclude-standard
    if ($LASTEXITCODE -ne 0 -or $untracked) { throw 'A 源码目录含额外文件；不会覆盖现有工作。' }
    $config = Join-Path $scratch 'holdem-probe-config.json'
    @{
        identifier = 'app.ningmao.m102holdem'
        productName = 'M1-02 Holdem probe'
        bundle = @{ createUpdaterArtifacts = $false }
        plugins = @{ updater = @{ endpoints = @() } }
    } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $config -Encoding utf8NoBOM
    Push-Location (Join-Path $upstream 'app')
    try {
        Run npm @('ci', '--registry=https://registry.npmjs.org', '--ignore-scripts', '--no-audit', '--no-fund')
        Run npm @('run', 'tauri', '--', 'build', '--debug', '--no-bundle', '--ci', '--config', $config, '--', '--locked')
    } finally { Pop-Location }
}

if ($Baseline -in @('B', 'Both')) {
    Push-Location (Join-Path $repo 'experiments/m1-02/tauri-baseline')
    try {
        Run npm @('ci', '--registry=https://registry.npmjs.org', '--ignore-scripts', '--no-audit', '--no-fund')
        Run cargo @('fmt', '--manifest-path', 'src-tauri/Cargo.toml', '--', '--check')
        # Tauri's context macro reads the built frontend during Rust checks.
        Run npm @('run', 'build')
        Run cargo @('test', '--locked', '--manifest-path', 'src-tauri/Cargo.toml', '--lib')
        Run cargo @('clippy', '--locked', '--manifest-path', 'src-tauri/Cargo.toml', '--all-targets', '--', '-D', 'warnings')
        Run npm @('run', 'tauri', '--', 'build', '--debug', '--no-bundle', '--ci', '--', '--locked')
    } finally { Pop-Location }
}
