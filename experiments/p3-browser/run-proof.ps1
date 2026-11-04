param(
    [Parameter(Mandatory)][string]$UpstreamDirectory,
    [Parameter(Mandatory)][string]$GoBinDirectory,
    [Parameter(Mandatory)][string]$GoPathDirectory,
    [Parameter(Mandatory)][string]$BuildCacheDirectory
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$upstream = (Resolve-Path -LiteralPath $UpstreamDirectory).Path
$pin = '4fc5ac0c8463a3de2b0396205c69a38109863583'
$actual = & git -C $upstream rev-parse HEAD
if ($LASTEXITCODE -ne 0 -or $actual -ne $pin) { throw 'Expected pinned croc checkout' }
$patchPath = Join-Path $PSScriptRoot 'windows-e2e.patch'
$diff = (& git -C $upstream diff --binary --unified=0) -join "`n"
if ($diff.TrimEnd() -eq '') {
    & git -C $upstream apply --unidiff-zero $patchPath
    if ($LASTEXITCODE -ne 0) { throw 'Windows E2E patch did not apply' }
} elseif ($diff.TrimEnd() -ne [IO.File]::ReadAllText($patchPath).TrimEnd()) {
    throw 'Upstream modifications differ from the recorded compatibility patch'
}
$saved = @{}
foreach ($name in @('PATH','GOPATH','GOCACHE','GOMAXPROCS','GOFLAGS','NO_PROXY','CROC_E2E_BINARY_NAME')) {
    $saved[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}
function Run([string]$Program, [string[]]$Arguments) {
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Program exited $LASTEXITCODE" }
}
try {
    $env:PATH = "$GoBinDirectory;$env:PATH"
    $env:GOPATH = [IO.Path]::GetFullPath($GoPathDirectory)
    $env:GOCACHE = [IO.Path]::GetFullPath($BuildCacheDirectory)
    $env:GOMAXPROCS = '2'
    $env:GOFLAGS = '-p=1'
    $env:NO_PROXY = '127.0.0.1,localhost'
    $env:CROC_E2E_BINARY_NAME = 'ningmao-browser-proof.exe'
    Push-Location $upstream
    try {
        Run go @('version')
        $artifacts = Join-Path $upstream 'web/.e2e'
        $null = New-Item -ItemType Directory -Path $artifacts -Force
        # Cold compilation must finish before Playwright starts its 120-second readiness deadline.
        Push-Location web
        try {
            Run npx @('vitest','run','src/codephrase.test.ts')
            Run npm @('run','embed')
        } finally { Pop-Location }
        Run go @('build','-o',(Join-Path $artifacts 'warm-cli.exe'),'.')
        Run go @('build','-o',(Join-Path $artifacts 'warm-web.exe'),'./cmd/croc-web')
        Push-Location web
        try {
            Run npx @('playwright','test','e2e/transfers.spec.ts','--project=chromium','--grep',
                'small-file bundles CLI|Web → CLI transfers|Web → Web transfers|wrong password|cancels a pending|small-file bundles cancel')
        } finally { Pop-Location }
    } finally { Pop-Location }
} finally {
    foreach ($name in $saved.Keys) {
        [Environment]::SetEnvironmentVariable($name, $saved[$name], 'Process')
    }
}
