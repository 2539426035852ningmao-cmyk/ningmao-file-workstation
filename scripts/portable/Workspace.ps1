param([ValidateSet('','Launch','Connect','Update','Restore')][string]$Action='', [string]$TargetRoot='', [string]$BackupPath='')
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest

function Get-NingmaoWorkspace([string]$PackageRoot) {
    $package=[IO.Path]::GetFullPath($PackageRoot)
    $config=Join-Path $package 'workspace.json'
    if(-not(Test-Path -LiteralPath $config)) { return $package }
    if((Get-Item -LiteralPath $config).Length -gt 4096) { throw '工作区设置无法读取 请重新接续旧工作区' }
    $saved=Get-Content -LiteralPath $config -Raw -Encoding UTF8 | ConvertFrom-Json
    if($saved.version -ne 1 -or -not [IO.Path]::IsPathRooted($saved.root)) { throw '工作区设置版本不兼容 原设置已保留' }
    $root=[IO.Path]::GetFullPath($saved.root)
    if(-not(Test-Path -LiteralPath (Join-Path $root 'data/workstation.sqlite3') -PathType Leaf)) { throw '原工作区暂不可用 请检查磁盘或重新接续 禁止使用空数据替代' }
    return $root
}

function Set-NingmaoWorkspace([string]$PackageRoot,[string]$WorkspaceRoot) {
    $root=Get-NingmaoWorkspace $WorkspaceRoot
    if(-not(Test-Path -LiteralPath (Join-Path $root 'data/workstation.sqlite3') -PathType Leaf)) { throw '请选择原测试包所在文件夹 其中应包含 data 和 webview' }
    $config=Join-Path ([IO.Path]::GetFullPath($PackageRoot)) 'workspace.json'
    $temporary=$config+'.'+[guid]::NewGuid().ToString('N')+'.tmp'
    [IO.File]::WriteAllText($temporary,(@{version=1;root=$root}|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
    if(Test-Path -LiteralPath $config) { [IO.File]::Replace($temporary,$config,$config+'.before-'+[guid]::NewGuid().ToString('N')) }
    else { [IO.File]::Move($temporary,$config) }
}

function Update-NingmaoPackage([string]$SourceRoot,[string]$TargetRoot) {
    $source=[IO.Path]::GetFullPath($SourceRoot).TrimEnd('\','/')
    $target=[IO.Path]::GetFullPath($TargetRoot).TrimEnd('\','/')
    if($source -eq $target -or $source.StartsWith($target+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase) -or $target.StartsWith($source+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw '请从新包更新另一个独立的旧程序目录' }
    $exe='app/Ningmao-Preview-0.1.0-x64.exe'
    if(-not(Test-Path -LiteralPath (Join-Path $target $exe) -PathType Leaf)) { throw '目标不是柠猫便携程序目录' }
    $manifest=Get-Content -LiteralPath (Join-Path $source 'SHA256SUMS.txt') -Encoding UTF8
    $expected=@($manifest | Where-Object {$_ -match '^[a-fA-F0-9]{64}  app[/\\]Ningmao-Preview-0\.1\.0-x64\.exe$'})
    if($expected.Count -ne 1 -or (Get-FileHash -LiteralPath (Join-Path $source $exe)).Hash -ne $expected[0].Substring(0,64)) { throw '新程序校验失败 原程序与数据保留' }
    foreach($relative in @('app','backups','Workspace.ps1','Start-Ningmao.cmd','Start-Ningmao.vbs','Connect-Workspace.cmd','Connect-Workspace.vbs','Update-Ningmao.cmd','Update-Ningmao.vbs','Recover-Ningmao.cmd','README.md','使用说明.md','LICENSE.txt','THIRD_PARTY_NOTICES.txt','license-manifest.json','build-manifest.json','SHA256SUMS.txt',$exe)) {
        $candidate=Join-Path $target $relative
        if((Test-Path -LiteralPath $candidate) -and ((Get-Item -LiteralPath $candidate -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw '更新目标包含重定向链接 请选择原程序目录' }
    }
    $workspace=Get-NingmaoWorkspace $target
    $data=Join-Path $workspace 'data'
    if(-not(Test-Path -LiteralPath (Join-Path $data 'workstation.sqlite3'))) { throw '旧工作区不存在 请先接续原工作区' }
    $lock=$null
    try { $lock=[IO.File]::Open((Join-Path $data 'instance.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None) }
    catch { throw '请先从菜单完整退出正在使用此工作区的柠猫 再更新' }
    try {
        $backup=Join-Path $target ('backups/before-update-'+[DateTime]::Now.ToString('yyyyMMdd-HHmmss')+'-'+[guid]::NewGuid().ToString('N').Substring(0,8))
        $null=New-Item -ItemType Directory -Path $backup
        # The selected workspace is explicit. Do not follow redirected folders during backup.
        if((Get-Item -LiteralPath $data).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw '工作区数据目录是重定向链接 请先手动备份后更新' }
        $entries=@(Get-ChildItem -LiteralPath $data -Recurse -Force)
        if(@($entries | Where-Object {$_.Attributes -band [IO.FileAttributes]::ReparsePoint}).Count) { throw '工作区包含重定向链接 请先手动备份后更新' }
        $null=New-Item -ItemType Directory -Path (Join-Path $backup 'data')
        foreach($entry in $entries) {
            $relative=$entry.FullName.Substring($data.TrimEnd('\','/').Length+1)
            $destination=Join-Path (Join-Path $backup 'data') $relative
            if($entry.PSIsContainer) { $null=New-Item -ItemType Directory -Force -Path $destination }
            elseif($relative -ne 'instance.lock') { Copy-Item -LiteralPath $entry.FullName -Destination $destination }
        }
        $files=@('Workspace.ps1','Start-Ningmao.cmd','Start-Ningmao.vbs','Connect-Workspace.vbs','Connect-Workspace.cmd','Update-Ningmao.vbs','Update-Ningmao.cmd','Recover-Ningmao.cmd','README.md','使用说明.md','LICENSE.txt','THIRD_PARTY_NOTICES.txt','license-manifest.json','build-manifest.json','SHA256SUMS.txt',$exe)
        $written=@()
        try {
            foreach($relative in $files) {
                $incoming=Join-Path $source $relative
                if(-not(Test-Path -LiteralPath $incoming -PathType Leaf)) { continue }
                $destination=Join-Path $target $relative
                $previous=Join-Path (Join-Path $backup 'program') $relative
                $null=New-Item -ItemType Directory -Force -Path (Split-Path -Parent $previous)
                if(Test-Path -LiteralPath $destination) { Copy-Item -LiteralPath $destination -Destination $previous }
                Copy-Item -LiteralPath $incoming -Destination $destination -Force
                $written+=,$relative
            }
        } catch {
            foreach($relative in $written) {
                $previous=Join-Path (Join-Path $backup 'program') $relative
                $destination=Join-Path $target $relative
                if(Test-Path -LiteralPath $previous) { Copy-Item -LiteralPath $previous -Destination $destination -Force }
                else { Remove-Item -LiteralPath $destination -Force }
            }
            throw
        }
        return $backup
    } finally { $lock.Dispose() }
}

if($Action) {
    Add-Type -AssemblyName System.Windows.Forms
    try {
        if($Action -in @('Launch','Restore')) {
            $workspace=Get-NingmaoWorkspace $PSScriptRoot
            $env:NINGMAO_DATA_DIR=Join-Path $workspace 'data'
            $env:WEBVIEW2_USER_DATA_FOLDER=Join-Path $workspace 'webview'
            $env:NINGMAO_RECYCLE_TEST_ROOT=''
            $arguments=@()
            if($Action -eq 'Restore') {
                if(-not(Test-Path -LiteralPath $BackupPath -PathType Leaf)) { throw '请选择有效的备份文件' }
                $arguments=@('--restore-backup',('"'+[IO.Path]::GetFullPath($BackupPath)+'"'))
            }
            $start=@{FilePath=(Join-Path $PSScriptRoot 'app/Ningmao-Preview-0.1.0-x64.exe');WorkingDirectory=(Join-Path $PSScriptRoot 'app')}
            if($arguments.Count) { $start.ArgumentList=$arguments }
            Start-Process @start
        } else {
            if(-not $TargetRoot) {
                $picker=New-Object System.Windows.Forms.FolderBrowserDialog
                $picker.Description=if($Action -eq 'Connect') {'选择原测试包所在文件夹 接续原文件架与设置'} else {'选择要更新的旧程序文件夹 原工作区保留并先备份'}
                try { if($picker.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { exit 0 };$TargetRoot=$picker.SelectedPath } finally { $picker.Dispose() }
            }
            if($Action -eq 'Connect') { Set-NingmaoWorkspace $PSScriptRoot $TargetRoot; $message='原工作区已接续 下次启动即可继续使用' }
            else { $backup=Update-NingmaoPackage $PSScriptRoot $TargetRoot;$message="程序已更新 数据与设置保留`n请从原目录启动`n备份位于 $backup" }
            [System.Windows.Forms.MessageBox]::Show($message,'柠猫文件工作站') | Out-Null
        }
    } catch { [System.Windows.Forms.MessageBox]::Show($_.Exception.Message,'柠猫文件工作站') | Out-Null;exit 1 }
}
