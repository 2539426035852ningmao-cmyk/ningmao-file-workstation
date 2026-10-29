param(
    [Parameter(Mandatory)][string]$UpstreamRoot,
    [Parameter(Mandatory)][string]$ProbeExe,
    [Parameter(Mandatory)][string]$BuildRoot
)
$ErrorActionPreference = 'Stop'
$revision = git -C $UpstreamRoot rev-parse HEAD
if ($LASTEXITCODE -ne 0 -or $revision -ne 'cfd699125f2aa4c69f48fd274cf4bb1876a5e08d') {
    throw 'Use the documented fixed LocalSend revision.'
}
if (Test-Path -LiteralPath $BuildRoot) { throw 'Use a new build directory.' }
$probe = (Resolve-Path -LiteralPath $ProbeExe).Path
$core = (Resolve-Path -LiteralPath (Join-Path $UpstreamRoot 'packages/core')).Path.Replace('\', '/')
New-Item -ItemType Directory -Path (Join-Path $BuildRoot 'src') | Out-Null
$manifest = (Get-Content -Raw (Join-Path $PSScriptRoot 'Cargo.toml.in')).Replace('__LOCALSEND_CORE__', $core)
[IO.File]::WriteAllText((Join-Path $BuildRoot 'Cargo.toml'), $manifest)
Copy-Item (Join-Path $PSScriptRoot 'Cargo.lock') $BuildRoot
Copy-Item (Join-Path $PSScriptRoot 'src/main.rs') (Join-Path $BuildRoot 'src/main.rs')
cargo run --locked --manifest-path (Join-Path $BuildRoot 'Cargo.toml') -- $probe
if ($LASTEXITCODE -ne 0) { throw 'Official client acceptance failed.' }