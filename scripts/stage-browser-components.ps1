param(
    [Parameter(Mandatory)][string]$UpstreamDirectory,
    [Parameter(Mandatory)][string]$GoBinDirectory,
    [Parameter(Mandatory)][string]$GoPathDirectory,
    [Parameter(Mandatory)][string]$BuildCacheDirectory,
    [Parameter(Mandatory)][string]$OutputDirectory
)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$repo=Split-Path -Parent $PSScriptRoot
$out=[IO.Path]::GetFullPath($OutputDirectory)
if (Test-Path -LiteralPath $out) { throw 'Preserve existing component staging; choose a new directory.' }
& "$repo/experiments/p3-browser/run-sender-proof.ps1" -UpstreamDirectory $UpstreamDirectory -GoBinDirectory $GoBinDirectory -GoPathDirectory $GoPathDirectory -BuildCacheDirectory $BuildCacheDirectory -PrepareOnly
$saved=@{}
foreach($name in @('PATH','GOPATH','GOCACHE','GOFLAGS')) { $saved[$name]=[Environment]::GetEnvironmentVariable($name,'Process') }
try {
    $env:PATH="$GoBinDirectory;$env:PATH"
    $env:GOPATH=[IO.Path]::GetFullPath($GoPathDirectory)
    $env:GOCACHE=[IO.Path]::GetFullPath($BuildCacheDirectory)
    $env:GOFLAGS='-p=1'
    & node "$PSScriptRoot/collect-browser-licenses.mjs" $UpstreamDirectory (Join-Path $out 'licenses')
    if($LASTEXITCODE) { throw 'Browser license inventory failed' }
    $null=New-Item -ItemType Directory -Path (Join-Path $out 'components')
    $files=@{'relay.exe'='warm-cli.exe';'web.exe'='warm-web.exe';'share.exe'='ningmao-share-proof.exe'}
    $components=@{}
    foreach($name in $files.Keys) {
        $dest=Join-Path $out "components/$name"
        Copy-Item -LiteralPath (Join-Path $UpstreamDirectory "web/.e2e/$($files[$name])") -Destination $dest
        $components[$name]=@{path="components/$name";sha256=(Get-FileHash -LiteralPath $dest -Algorithm SHA256).Hash.ToLowerInvariant();bytes=(Get-Item -LiteralPath $dest).Length}
    }
    [ordered]@{schema=1;upstream='4fc5ac0c8463a3de2b0396205c69a38109863583';scope='local-loopback-development-only';distributionApproved=$false;components=$components} |
        ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $out 'components.json') -Encoding utf8
    Write-Output 'Components built, inventoried and staged. Public distribution and SSH/Store surface review remain pending.'
} finally {
    foreach($name in $saved.Keys) { [Environment]::SetEnvironmentVariable($name,$saved[$name],'Process') }
}
