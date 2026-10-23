$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Push-Location (Split-Path -Parent $PSScriptRoot)
try {
    $required = @(
        'LICENSE', 'README.md', 'AGENTS.md', 'CONTRIBUTING.md', 'SECURITY.md',
        'CODE_OF_CONDUCT.md', '.gitignore', '.gitattributes', '.editorconfig',
        '.github/workflows/repository-checks.yml', '.github/dependabot.yml',
        '.github/ISSUE_TEMPLATE/bug_report.yml', '.github/ISSUE_TEMPLATE/feature_request.yml',
        '.github/ISSUE_TEMPLATE/config.yml', '.github/pull_request_template.md',
        'docs/README.md', 'docs/product-decisions.md', 'docs/m1-execution-baseline.md',
        'docs/milestones/M1.md', 'docs/tasks/M1-01.md', 'docs/third-party.md'
    )
    foreach ($path in $required) {
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "缺少必需文件：$path" }
        if ((Get-Item -LiteralPath $path).Length -eq 0) { throw "文件为空：$path" }
    }
    $tracked = @(git -c core.quotepath=false ls-files)
    if ($LASTEXITCODE -ne 0) { throw '无法读取 Git 文件清单' }
    $utf8 = [Text.UTF8Encoding]::new($false, $true)
    foreach ($path in $tracked) {
        if ($path -match '(^|/)(node_modules|target|dist|private|\.git)(/|$)' -or
            $path -match '(^|/)\.env($|\.)' -or
            $path -match '\.(pem|key|pfx|p12|sqlite3?|db|exe|msi|zip)$') {
            throw "禁止跟踪本地数据、凭据或构建产物：$path"
        }
        $text = $utf8.GetString([IO.File]::ReadAllBytes((Join-Path (Get-Location) $path)))
        if ($text -match '(?<![A-Za-z0-9])(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})' -or
            $text -match '-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----') {
            throw "检测到疑似凭据：$path（内容已隐藏）"
        }
    }
    git diff --check
    if ($LASTEXITCODE -ne 0) { throw '工作区空白检查失败' }
    git diff --cached --check
    if ($LASTEXITCODE -ne 0) { throw '暂存区空白检查失败' }
    git show --format= --check HEAD
    if ($LASTEXITCODE -ne 0) { throw '提交空白检查失败' }
    Write-Output "仓库基础检查通过：$($required.Count) 个必需文件；$($tracked.Count) 个跟踪文件。"
} finally {
    Pop-Location
}
