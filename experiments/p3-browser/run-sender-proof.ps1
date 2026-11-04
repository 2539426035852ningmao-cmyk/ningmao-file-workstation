param(
    [Parameter(Mandatory)][string]$UpstreamDirectory,
    [Parameter(Mandatory)][string]$GoBinDirectory,
    [Parameter(Mandatory)][string]$GoPathDirectory,
    [Parameter(Mandatory)][string]$BuildCacheDirectory
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
& "$PSScriptRoot/run-proof.ps1" @PSBoundParameters -PrepareOnly
$saved = @{}
foreach ($name in @('PATH','GOPATH','GOCACHE','GOFLAGS','GOMAXPROCS','NO_PROXY','CROC_E2E_BINARY_NAME','NINGMAO_SENDER_BINARY','NINGMAO_EVENT_PROOF','NINGMAO_CANCEL_PROOF')) {
    $saved[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}
function Run([string]$Program,[string[]]$Arguments) {
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Program exited $LASTEXITCODE" }
}
try {
    $upstream = (Resolve-Path -LiteralPath $UpstreamDirectory).Path
    $destination = Join-Path $upstream 'cmd/ningmao-share-proof'
    $null = New-Item -ItemType Directory -Path $destination -Force
    Copy-Item -LiteralPath "$PSScriptRoot/sender/main.go","$PSScriptRoot/sender/main_test.go" -Destination $destination
    Copy-Item -LiteralPath "$PSScriptRoot/sender/extension/status.go" -Destination (Join-Path $upstream 'src/croc/ningmao_status.go')
    Copy-Item -LiteralPath "$PSScriptRoot/sender/sender.spec.ts" -Destination (Join-Path $upstream 'web/e2e/ningmao-sender.spec.ts')
    $env:PATH = "$GoBinDirectory;$env:PATH"
    $env:GOPATH = [IO.Path]::GetFullPath($GoPathDirectory)
    $env:GOCACHE = [IO.Path]::GetFullPath($BuildCacheDirectory)
    $env:GOFLAGS = '-p=1'; $env:GOMAXPROCS = '2'
    $env:NO_PROXY = '127.0.0.1,localhost'
    $env:CROC_E2E_BINARY_NAME = 'ningmao-browser-proof.exe'
    $env:NINGMAO_SENDER_BINARY = Join-Path $upstream 'web/.e2e/ningmao-share-proof.exe'
    $env:NINGMAO_EVENT_PROOF = Join-Path $upstream 'sender-events.jsonl'
    $env:NINGMAO_CANCEL_PROOF = Join-Path $upstream 'sender-cancel-events.jsonl'
    Push-Location $upstream
    try {
        Run go @('test','./cmd/ningmao-share-proof')
        Run go @('build','-o',$env:NINGMAO_SENDER_BINARY,'./cmd/ningmao-share-proof')
        Push-Location web
        try { Run npx @('playwright','test','e2e/ningmao-sender.spec.ts','--project=chromium') } finally { Pop-Location }
    } finally { Pop-Location }
} finally {
    foreach ($name in $saved.Keys) { [Environment]::SetEnvironmentVariable($name,$saved[$name],'Process') }
}
