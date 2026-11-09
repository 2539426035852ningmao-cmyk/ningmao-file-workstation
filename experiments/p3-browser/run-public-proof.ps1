param(
    [Parameter(Mandatory)][string]$ComponentsDirectory,
    [Parameter(Mandatory)][string]$Cloudflared,
    [Parameter(Mandatory)][string]$SyntheticDirectory,
    [switch]$EnablePublicTunnel
)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
if (!$EnablePublicTunnel) { throw 'Explicit approval for a temporary public synthetic-file test is required.' }
if (Test-Path -LiteralPath $SyntheticDirectory) { throw 'Choose a new synthetic directory; preserve prior evidence.' }
$manifest=Get-Content (Join-Path $ComponentsDirectory 'components.json') -Raw | ConvertFrom-Json
foreach($name in @('relay.exe','web.exe','share.exe')) {
    $record=$manifest.components.$name
    if ((Get-FileHash (Join-Path $ComponentsDirectory $record.path) -Algorithm SHA256).Hash.ToLowerInvariant() -ne $record.sha256) { throw "Component hash mismatch: $name" }
}
if ((Get-FileHash $Cloudflared -Algorithm SHA256).Hash.ToLowerInvariant() -ne '2493dbc168923bb3e59e5e7716f71deced92992eea9acd6e9d74f84ac7751343') { throw 'Expected official cloudflared 2026.10.7 Windows amd64' }
$ports=53318..53323
if (@(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object LocalPort -in $ports).Count) { throw 'Test ports are occupied; do not stop unrelated services.' }
$null=New-Item -ItemType Directory -Path $SyntheticDirectory
$source=Join-Path $SyntheticDirectory 'Ningmao-Android-Check.txt'
[IO.File]::WriteAllText($source,"Ningmao public browser synthetic transfer`n"+[guid]::NewGuid().ToString())
$password=[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLowerInvariant()
$code=[guid]::NewGuid().ToString()
$children=[Collections.Generic.List[Diagnostics.Process]]::new()
$started=[DateTime]::UtcNow
$phase='not_started'
function Start-Component([string]$File,[string[]]$Arguments) {
    $info=[Diagnostics.ProcessStartInfo]::new($File)
    $info.UseShellExecute=$false;$info.CreateNoWindow=$true
    $info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
    foreach($arg in $Arguments){$info.ArgumentList.Add($arg)}
    $p=[Diagnostics.Process]::Start($info);$children.Add($p)
    return $p
}
try {
    $relay=Start-Component (Join-Path $ComponentsDirectory 'components/relay.exe') @('--pass',$password,'relay','--host','127.0.0.1','--ports','53318,53319,53320,53321,53322')
    $web=Start-Component (Join-Path $ComponentsDirectory 'components/web.exe') @('--pass',$password,'--relays','127.0.0.1','--ports','53318,53319,53320,53321,53322','127.0.0.1:53323')
    # Drain component logs without persisting relay credentials or invitations.
    $null=$relay.StandardOutput.ReadToEndAsync();$null=$relay.StandardError.ReadToEndAsync()
    $null=$web.StandardOutput.ReadToEndAsync();$null=$web.StandardError.ReadToEndAsync()
    $ready=[Diagnostics.Stopwatch]::StartNew()
    while($ready.Elapsed.TotalSeconds -lt 10) {
        try { $null=Invoke-WebRequest http://127.0.0.1:53323/healthz -NoProxy -TimeoutSec 1;break } catch { Start-Sleep -Milliseconds 200 }
    }
    if ($ready.Elapsed.TotalSeconds -ge 10) { throw 'Web gateway did not become ready' }
    $config=(Invoke-WebRequest http://127.0.0.1:53323/config.js -NoProxy).Content
    if ($config -notmatch '"enabled":false') { throw 'Store must remain disabled before exposing the gateway' }
    $tunnel=Start-Component $Cloudflared @('tunnel','--url','http://127.0.0.1:53323','--no-autoupdate','--protocol','http2')
    $null=$tunnel.StandardOutput.ReadToEndAsync()
    $deadline=[DateTime]::UtcNow.AddSeconds(60)
    $read=$tunnel.StandardError.ReadLineAsync();$origin=$null
    while([DateTime]::UtcNow -lt $deadline -and !$tunnel.HasExited) {
        if (!$read.IsCompleted) { Start-Sleep -Milliseconds 100;continue }
        $line=$read.GetAwaiter().GetResult()
        if ($line -match 'https://[a-z0-9-]+\.trycloudflare\.com') { $origin=$Matches[0];break }
        $read=$tunnel.StandardError.ReadLineAsync()
    }
    if (!$origin) { throw 'Quick Tunnel did not return an HTTPS endpoint; nothing was sent' }
    $null=$tunnel.StandardError.ReadToEndAsync()
    $online=[Diagnostics.Stopwatch]::StartNew()
    while($online.Elapsed.TotalSeconds -lt 20) {
        try { $null=Invoke-WebRequest ($origin+'/healthz') -TimeoutSec 5;break } catch { Start-Sleep -Milliseconds 500 }
    }
    if ($online.Elapsed.TotalSeconds -ge 20) { throw 'Public HTTPS health check failed; no file invitation was started' }
    Write-Output ('HTTPS gateway: '+$origin)
    Write-Output ('Synthetic source SHA256: '+(Get-FileHash $source -Algorithm SHA256).Hash.ToLowerInvariant())
    $sender=Start-Component (Join-Path $ComponentsDirectory 'components/share.exe') @()
    $request=@{relay='127.0.0.1:53318';password=$password;code=$code;paths=@($source)} | ConvertTo-Json -Compress
    $sender.StandardInput.WriteLine($request);$sender.StandardInput.Flush()
    $result=$sender.StandardOutput.ReadToEndAsync();$null=$sender.StandardError.ReadToEndAsync()
    Write-Output ('Receive before '+[DateTime]::UtcNow.AddMinutes(10).ToString('o')+': '+$origin+'/#receive?code='+$code)
    if (!$sender.WaitForExit(605000)) { throw 'Sender deadline exceeded' }
    $events=$result.GetAwaiter().GetResult().Trim().Split("`n") | Where-Object {$_} | ForEach-Object {$_|ConvertFrom-Json}
    $phase=$events[-1].phase
    Write-Output ('Sender terminal: '+$phase)
    if ($sender.ExitCode -ne 0 -or $phase -ne 'verified') { throw 'Receiver verification did not complete; not a successful transfer' }
} finally {
    foreach($p in $children) { if (!$p.HasExited) {$p.Kill()};$p.WaitForExit();$p.Dispose() }
    [ordered]@{startedUtc=$started.ToString('o');stoppedUtc=[DateTime]::UtcNow.ToString('o');phase=$phase;sourceSha256=(Get-FileHash $source -Algorithm SHA256).Hash.ToLowerInvariant()} | ConvertTo-Json | Set-Content (Join-Path $SyntheticDirectory 'result.json')
    $password=$null;$code=$null;$request=$null
    Write-Output 'Temporary gateway, relay and sender stopped; synthetic source retained.'
}
