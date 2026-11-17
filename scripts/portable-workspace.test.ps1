$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'portable/Workspace.ps1')
$fixture=Join-Path ([IO.Path]::GetTempPath()) ('ningmao-workspace-'+[guid]::NewGuid().ToString('N'))
$null=New-Item -ItemType Directory -Path $fixture
try {
    $previousRegistry=$env:NINGMAO_WORKSPACE_REGISTRY
    $env:NINGMAO_WORKSPACE_REGISTRY=Join-Path $fixture 'registry/workspace.json'
    $old=Join-Path $fixture '旧工作区'; $fresh=Join-Path $fixture '新测试包'
    foreach($root in @($old,$fresh)) { $null=New-Item -ItemType Directory -Path (Join-Path $root 'app'),(Join-Path $root 'data'),(Join-Path $root 'webview') }
    [IO.File]::WriteAllText((Join-Path $old 'data/workstation.sqlite3'),'synthetic existing database')
    [IO.File]::WriteAllText((Join-Path $old 'data/desktop-layout-v4.json'),'synthetic saved geometry')
    [IO.File]::WriteAllText((Join-Path $old 'webview/theme.txt'),'synthetic saved theme')
    [IO.File]::WriteAllText((Join-Path $old 'app/Ningmao-Preview-0.1.0-x64.exe'),'old synthetic application')
    [IO.File]::WriteAllText((Join-Path $fresh 'app/Ningmao-Preview-0.1.0-x64.exe'),'new synthetic application')
    $hash=(Get-FileHash -LiteralPath (Join-Path $fresh 'app/Ningmao-Preview-0.1.0-x64.exe')).Hash.ToLowerInvariant()
    [IO.File]::WriteAllText((Join-Path $fresh 'SHA256SUMS.txt'),$hash+'  app/Ningmao-Preview-0.1.0-x64.exe')
    if((Resolve-NingmaoWorkspace $fresh -Candidates @($old)) -ne $old) { throw 'Single legacy workspace must connect without a picker' }
    $older=Join-Path $fixture '更早的旧包'
    $null=New-Item -ItemType Directory -Path (Join-Path $older 'data')
    [IO.File]::WriteAllText((Join-Path $older 'data/workstation.sqlite3'),'older synthetic database')
    foreach($root in @($old,$older)) { [IO.File]::WriteAllText((Join-Path $root 'data/.window-state.json'),'{}') }
    (Get-Item -LiteralPath (Join-Path $older 'data/.window-state.json')).LastWriteTimeUtc=[datetime]'2026-11-15T00:00:00Z'
    (Get-Item -LiteralPath (Join-Path $old 'data/.window-state.json')).LastWriteTimeUtc=[datetime]'2026-11-16T00:00:00Z'
    # Copying or extracting an older package must not overrule saved application use.
    (Get-Item -LiteralPath $older).LastWriteTimeUtc=[datetime]'2026-11-17T00:00:00Z'
    if((Resolve-NingmaoWorkspace $fresh -Candidates @($older,$old)) -ne $old) { throw 'Multiple legacy packages must automatically resume the last saved window workspace' }
    $linked=Join-Path $fixture '仅带连接的新包'
    $null=New-Item -ItemType Directory -Path $linked
    Set-NingmaoWorkspace $linked $old
    if((Resolve-NingmaoWorkspace $fresh -Candidates @($older,$linked)) -ne $old) { throw 'Legacy discovery must follow package connections even without a local database' }
    $null=New-Item -ItemType Directory -Path (Split-Path -Parent $env:NINGMAO_WORKSPACE_REGISTRY)
    [IO.File]::WriteAllText($env:NINGMAO_WORKSPACE_REGISTRY,(@{version=1;root=$old;package=$old}|ConvertTo-Json))
    if((Resolve-NingmaoWorkspace $fresh -Candidates @()) -ne $old) { throw 'Every new package must reuse the remembered workspace' }
    $moved=Join-Path $fixture '移动后'
    Move-Item -LiteralPath $old -Destination $moved
    $beforePointer=Get-Content -LiteralPath $env:NINGMAO_WORKSPACE_REGISTRY -Raw
    $rejected=$false;try { Resolve-NingmaoWorkspace $fresh -Candidates @() | Out-Null } catch { $rejected=$_.Exception.Message.Contains('暂不可用') }
    if(-not $rejected -or (Get-Content -LiteralPath $env:NINGMAO_WORKSPACE_REGISTRY -Raw) -ne $beforePointer) { throw 'Missing remembered workspace must stop without replacing the connection' }
    Move-Item -LiteralPath $moved -Destination $old
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
    Write-Output 'PASS: automatic multiple-package migration by saved window use; linked-package discovery; remembered/offline workspace; application update; byte-identical records and settings; backup; running-instance and incompatible configuration rejection'
} finally {
    $env:NINGMAO_WORKSPACE_REGISTRY=$previousRegistry
    $absolute=[IO.Path]::GetFullPath($fixture)
    $temp=[IO.Path]::GetFullPath([IO.Path]::GetTempPath())
    if(-not $absolute.StartsWith($temp,[StringComparison]::OrdinalIgnoreCase) -or (Split-Path -Leaf $absolute) -notmatch '^ningmao-workspace-[a-f0-9]{32}$') { throw 'Unsafe cleanup path' }
    Remove-Item -LiteralPath $absolute -Recurse -Force
}
