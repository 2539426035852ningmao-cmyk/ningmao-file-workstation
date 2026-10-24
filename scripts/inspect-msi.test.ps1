$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'inspect-msi.ps1')
$tables = @{
    Property = @(
        @{Property='ProductName';Value='Ningmao File Workstation Preview'},
        @{Property='ProductVersion';Value='0.1.0'},
        @{Property='UpgradeCode';Value='{49745F80-2F01-42DF-B527-1EE339187A71}'}
    )
    File = @('ningmao-file-workstation.exe','LICENSE.txt','THIRD_PARTY_NOTICES.txt','manifest.json') | ForEach-Object { @{FileName=$_} }
    RemoveFile = @(@{FileName='';DirProperty='INSTALLDIR'})
    Environment = @(); Registry = @(); CustomAction = @(); InstallExecuteSequence = @()
}
Assert-PreviewMsi $tables 'x64;2052'
$tables.RemoveFile = @(@{FileName='*';DirProperty='AppDataFolder'})
$rejected = $false
try { Assert-PreviewMsi $tables 'x64;2052' } catch { $rejected = $_.Exception.Message -match 'Unsafe RemoveFile' }
if (-not $rejected) { throw 'User-data removal fixture must be rejected' }
$tables.RemoveFile = @()
$tables.File += @{FileName='private.sqlite'}
$rejected = $false
try { Assert-PreviewMsi $tables 'x64;2052' } catch { $rejected = $_.Exception.Message -match 'payload' }
if (-not $rejected) { throw 'Unexpected payload fixture must be rejected' }
Write-Output 'MSI inspection fixtures passed: valid preview; reject user-data deletion and extra payload.'
