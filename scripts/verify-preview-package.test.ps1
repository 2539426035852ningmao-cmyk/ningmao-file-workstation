$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'verify-preview-package.ps1')
$temporaryRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$fixture = Join-Path $temporaryRoot ('ningmao-package-check-' + [guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory -Path $fixture
try {
    $files = @('build-manifest.json','license-manifest.json','LICENSE.txt','msi-inspection.json',
        'Ningmao-Preview-0.1.0-x64.exe','Ningmao-Preview-0.1.0-x64.msi','README.md','THIRD_PARTY_NOTICES.txt')
    foreach ($name in $files) { [IO.File]::WriteAllText((Join-Path $fixture $name), 'synthetic fixture') }
    $lines = @($files | ForEach-Object { '{0}  {1}' -f (Get-FileHash -LiteralPath (Join-Path $fixture $_) -Algorithm SHA256).Hash.ToLowerInvariant(), $_ })
    $checksums = Join-Path $fixture 'SHA256SUMS.txt'
    $lines | Set-Content -LiteralPath $checksums -Encoding utf8
    $null = Assert-PreviewChecksums $fixture
    [IO.File]::WriteAllText((Join-Path $fixture 'README.md'), 'tampered')
    $rejected = $false
    try { $null = Assert-PreviewChecksums $fixture } catch { $rejected = $_.Exception.Message -match 'SHA256 mismatch' }
    if (-not $rejected) { throw 'Changed file must be rejected' }
    [IO.File]::WriteAllText((Join-Path $fixture 'README.md'), 'synthetic fixture')
    $cases = @(
        @{name='omission';lines=@($lines | Select-Object -Skip 1)},
        @{name='duplicate';lines=@($lines) + @($lines[0])},
        @{name='traversal';lines=@($lines) + @('0' * 64 + '  ../private.txt')}
    )
    foreach ($case in $cases) {
        $case.lines | Set-Content -LiteralPath $checksums -Encoding utf8
        $rejected = $false
        try { $null = Assert-PreviewChecksums $fixture } catch { $rejected = $true }
        if (-not $rejected) { throw "Invalid checksum list must be rejected: $($case.name)" }
    }
    $lines | Set-Content -LiteralPath $checksums -Encoding utf8
    [IO.File]::WriteAllText((Join-Path $fixture 'private.sqlite'), 'synthetic forbidden payload')
    $rejected = $false
    try { $null = Assert-PreviewChecksums $fixture } catch { $rejected = $_.Exception.Message -match 'payload' }
    if (-not $rejected) { throw 'Extra private payload must be rejected' }
    Write-Output 'Package checks passed: intact; reject tamper, omission, duplicates, traversal and extra payload.'
} finally {
    $absolute = [IO.Path]::GetFullPath($fixture)
    if (-not $absolute.StartsWith($temporaryRoot, [StringComparison]::OrdinalIgnoreCase) -or (Split-Path -Leaf $absolute) -notmatch '^ningmao-package-check-[a-f0-9]{32}$') { throw 'Unsafe fixture cleanup path' }
    [IO.Directory]::Delete($absolute, $true)
}
