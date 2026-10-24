$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$root = Join-Path ([IO.Path]::GetTempPath()) ('ningmao-stage-check-' + [Guid]::NewGuid().ToString('N'))
& (Join-Path $PSScriptRoot 'stage-acceptance.ps1') -Root $root
& (Join-Path $PSScriptRoot 'stage-acceptance.ps1') -Root $root -Mode Verify
$refused = $false
try { & (Join-Path $PSScriptRoot 'stage-acceptance.ps1') -Root $root } catch { $refused=$true }
if (-not $refused) { throw 'Existing fixture root was overwritten' }
[IO.File]::WriteAllText((Join-Path $root 'source/English.txt'),'synthetic tampering')
$refused = $false
try { & (Join-Path $PSScriptRoot 'stage-acceptance.ps1') -Root $root -Mode Verify } catch { $refused=$true }
if (-not $refused) { throw 'Changed source was accepted' }
Write-Output 'Fixture preparation, non-overwrite and changed-source rejection passed. No application started.'
