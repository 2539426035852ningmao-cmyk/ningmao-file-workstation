param([ValidateSet('P0','P1','P2','P3','P4','All')][string]$Group='P0')
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$repo=Split-Path -Parent $PSScriptRoot
Push-Location $repo
try {
    & "$PSScriptRoot/check-repository.ps1"
    if($Group -eq 'P0'){
        Write-Output 'Repository preflight only; P0 data safety/native/package gates still require their existing checks and evidence.'
        return
    }
    $groups=@{
        P1=@('file-shelf','multiselection','metadata-sorting','shelf-filters','shelf-view-memory','clipboard')
        P2=@('orb','desktop-loop','detached-shelves','management-center','p2-shortcut','window-chrome','workspace-panels','workspace-theme','capsule-workspace')
        P3=@('transfer','transfer-guidance','browser-share')
        P4=@('local-search','duplicates','chat')
    }
    Push-Location apps/desktop
    try {
        & npm run build:test
        if($LASTEXITCODE){throw 'Test build failed'}
        $files=if($Group -eq 'All'){@()}else{@($groups[$Group]|ForEach-Object{"tests/browser/$_.spec.ts"})}
        & npx playwright test @files
        if($LASTEXITCODE){throw 'Browser acceptance failed'}
    } finally { Pop-Location }
    Write-Output 'Browser-renderer checks complete. This is not Windows native, LAN, live AI or release approval.'
} finally { Pop-Location }
