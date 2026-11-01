param(
    [string]$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'

$registryPath = Join-Path $RepositoryRoot 'registry.json'

if (-not (Test-Path -LiteralPath $registryPath -PathType Leaf)) {
    throw "Missing registry: $registryPath. Run publish-registry.ps1 first."
}

$registry = Get-Content -LiteralPath $registryPath -Raw -Encoding UTF8 |
    ConvertFrom-Json

if (
    $registry.schemaVersion -ne 1 -or
    -not $registry.plugins -or
    $registry.plugins.Count -lt 1
) {
    throw 'Registry schemaVersion must be 1 and plugins must be a non-empty array.'
}

$seen = @{}

foreach ($plugin in $registry.plugins) {
    if (
        [string]::IsNullOrWhiteSpace($plugin.id) -or
        [string]::IsNullOrWhiteSpace($plugin.version)
    ) {
        throw 'Plugin id and version are required.'
    }

    if ($seen.ContainsKey($plugin.id)) {
        throw "Duplicate plugin ID: $($plugin.id)"
    }

    $seen[$plugin.id] = $true

    if ($plugin.sha256 -notmatch '^[a-fA-F0-9]{64}$') {
        throw "Invalid SHA-256: $($plugin.id)"
    }

    $zipName = '{0}-{1}.zip' -f $plugin.id, $plugin.version
    $zipPath = Join-Path $RepositoryRoot ('dist/' + $zipName)

    if (-not (Test-Path -LiteralPath $zipPath -PathType Leaf)) {
        throw "Missing ZIP: $zipPath"
    }

    $actualHash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash

    if ($actualHash -ine $plugin.sha256) {
        throw "SHA-256 mismatch for $($plugin.id)"
    }

    $uri = $null

    if (
        -not [Uri]::TryCreate(
            $plugin.downloadUrl,
            [UriKind]::Absolute,
            [ref]$uri
        ) -or
        $uri.Scheme -ne 'https'
    ) {
        throw "Invalid HTTPS download URL: $($plugin.id)"
    }

    if (
        $uri.Host -ne 'github.com' -or
        $uri.AbsolutePath -notlike '/Tyravex/tyravex-plugins/releases/download/*'
    ) {
        throw "Unexpected official release URL: $($plugin.id)"
    }

    Write-Host "OK: $($plugin.id) v$($plugin.version), ZIP SHA-256 verified" `
        -ForegroundColor Green
}

Write-Host 'Registry verification completed.' -ForegroundColor Green
Write-Warning 'This does not verify that GitHub Release assets are published.'
