$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'portable/Workspace.ps1')
$fixture=Join-Path ([IO.Path]::GetTempPath()) ('ningmao-workspace-'+[guid]::NewGuid().ToString('N'))
$null=New-Item -ItemType Directory -Path $fixture
try {
    $old=Join-Path $fixture '旧工作区'; $fresh=Join-Path $fixture '新测试包'
    foreach($root in @($old,$fresh)) { $null=New-Item -ItemType Directory -Path (Join-Path $root 'app'),(Join-Path $root 'data'),(Join-Path $root 'webview') }
    [IO.File]::WriteAllText((Join-Path $old 'data/workstation.sqlite3'),'synthetic existing database')
    [IO.File]::WriteAllText((Join-Path $old 'data/desktop-layout-v4.json'),'synthetic saved geometry')
    [IO.File]::WriteAllText((Join-Path $old 'webview/theme.txt'),'synthetic saved theme')
    [IO.File]::WriteAllText((Join-Path $old 'app/Ningmao-Preview-0.1.0-x64.exe'),'old synthetic application')
    [IO.File]::WriteAllText((Join-Path $fresh 'app/Ningmao-Preview-0.1.0-x64.exe'),'new synthetic application')
    $hash=(Get-FileHash -LiteralPath (Join-Path $fresh 'app/Ningmao-Preview-0.1.0-x64.exe')).Hash.ToLowerInvariant()
    [IO.File]::WriteAllText((Join-Path $fresh 'SHA256SUMS.txt'),$hash+'  app/Ningmao-Preview-0.1.0-x64.exe')
    Set-NingmaoWorkspace -PackageRoot $fresh -WorkspaceRoot $old
    if((Get-NingmaoWorkspace $fresh) -ne $old) { throw 'New package must reconnect the selected old workspace' }
    $before=(Get-FileHash -LiteralPath (Join-Path $old 'data/workstation.sqlite3')).Hash
    $backup=Update-NingmaoPackage -SourceRoot $fresh -TargetRoot $old
    if((Get-FileHash -LiteralPath (Join-Path $old 'data/workstation.sqlite3')).Hash -ne $before) { throw 'Update changed existing records' }
    if((Get-Content -Raw (Join-Path $old 'webview/theme.txt')) -ne 'synthetic saved theme') { throw 'Update lost view settings' }
    if((Get-Content -Raw (Join-Path $old 'app/Ningmao-Preview-0.1.0-x64.exe')) -ne 'new synthetic application') { throw 'Application was not updated' }
    if(-not(Test-Path -LiteralPath (Join-Path $backup 'data/workstation.sqlite3'))) { throw 'Pre-update backup is missing' }
    $lock=[IO.File]::Open((Join-Path $old 'data/instance.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
    try {
        $rejected=$false;try { Update-NingmaoPackage -SourceRoot $fresh -TargetRoot $old | Out-Null } catch {$rejected=$true}
        if(-not $rejected) { throw 'Running workspace must block update' }
    } finally { $lock.Dispose() }
    [IO.File]::WriteAllText((Join-Path $fresh 'workspace.json'),'{"version":999,"root":"invalid"}')
    $rejected=$false;try { Get-NingmaoWorkspace $fresh | Out-Null } catch {$rejected=$true}
    if(-not $rejected) { throw 'Invalid workspace must not silently create an empty profile' }
    Write-Output 'PASS: old workspace reconnect; application update; byte-identical records and view settings; backup; running-instance rejection; incompatible configuration rejection'
} finally {
    $absolute=[IO.Path]::GetFullPath($fixture)
    $temp=[IO.Path]::GetFullPath([IO.Path]::GetTempPath())
    if(-not $absolute.StartsWith($temp,[StringComparison]::OrdinalIgnoreCase) -or (Split-Path -Leaf $absolute) -notmatch '^ningmao-workspace-[a-f0-9]{32}$') { throw 'Unsafe cleanup path' }
    Remove-Item -LiteralPath $absolute -Recurse -Force
}
