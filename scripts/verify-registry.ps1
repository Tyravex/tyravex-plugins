[CmdletBinding()]
param(
    [string]$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$registryPath = Join-Path $RepositoryRoot 'registry.json'
if (-not (Test-Path -LiteralPath $registryPath -PathType Leaf)) {
    throw "Missing registry: $registryPath. Run publish-registry.ps1 first."
}

try {
    $registry = Get-Content -LiteralPath $registryPath -Raw -Encoding UTF8 |
        ConvertFrom-Json -ErrorAction Stop
}
catch {
    throw "Invalid registry JSON: $($_.Exception.Message)"
}

if ($null -eq $registry -or $registry -isnot [pscustomobject]) {
    throw 'Registry must be a JSON object.'
}
if ($registry.schemaVersion -isnot [ValueType] -or $registry.schemaVersion -ne 1) {
    throw 'Registry schemaVersion must be the integer 1.'
}
if ($null -eq $registry.plugins -or $registry.plugins -isnot [array] -or
    $registry.plugins.Count -lt 1) {
    throw 'Registry plugins must be a non-empty array.'
}

$seen = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::Ordinal)

foreach ($plugin in $registry.plugins) {
    if ($null -eq $plugin -or $plugin -isnot [pscustomobject]) {
        throw 'Each registry plugin must be a JSON object.'
    }

    foreach ($field in @('id', 'name', 'description', 'type', 'version',
                        'downloadUrl', 'sha256', 'category', 'source')) {
        $property = $plugin.PSObject.Properties[$field]
        if ($null -eq $property -or $property.Value -isnot [string] -or
            [string]::IsNullOrWhiteSpace($property.Value)) {
            throw "Missing or invalid plugin field: $field"
        }
    }

    if ($plugin.id -cnotmatch '^tyravex\.language\.[a-z0-9.-]+$') {
        throw "Invalid plugin ID: $($plugin.id)"
    }
    if (-not $seen.Add($plugin.id)) {
        throw "Duplicate plugin ID: $($plugin.id)"
    }
    if ($plugin.type -cne 'language' -or $plugin.category -cne 'languages' -or
        $plugin.source -cne 'official') {
        throw "Invalid type, category or source: $($plugin.id)"
    }
    if ($plugin.version -cnotmatch '^\d+\.\d+\.\d+$') {
        throw "Invalid plugin version: $($plugin.id)"
    }
    if ($plugin.sha256 -cnotmatch '^[a-fA-F0-9]{64}$') {
        throw "Invalid SHA-256: $($plugin.id)"
    }

    # The current official registry publishes language plugins from
    # languages/<language>/manifest.json. Never derive filesystem paths
    # directly from an unchecked registry ID.
    $language = $plugin.id.Substring('tyravex.language.'.Length)
    if ($language -cnotmatch '^[a-z0-9]+(?:-[a-z0-9]+)*$') {
        throw "Unsupported language directory name: $language"
    }
    $manifestPath = Join-Path $RepositoryRoot (
        'languages/' + $language + '/manifest.json'
    )
    if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
        throw "Missing plugin manifest: $manifestPath"
    }
    try {
        $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 |
            ConvertFrom-Json -ErrorAction Stop
    }
    catch {
        throw "Invalid plugin manifest JSON: $($_.Exception.Message)"
    }
    if ($null -eq $manifest -or $manifest -isnot [pscustomobject] -or
        $manifest.schemaVersion -ne 1 -or
        $manifest.id -cne $plugin.id -or
        $manifest.type -cne $plugin.type -or
        $manifest.version -cne $plugin.version) {
        throw "Registry/manifest mismatch: $($plugin.id)"
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

    $tag = '{0}-v{1}' -f $plugin.id, $plugin.version
    $expectedUrl = 'https://github.com/Tyravex/tyravex-plugins/releases/download/{0}/{1}' -f $tag, $zipName
    if ($plugin.downloadUrl -cne $expectedUrl) {
        throw "Invalid official release URL for $($plugin.id). Expected: $expectedUrl"
    }

    Write-Host "OK: $($plugin.id) v$($plugin.version), manifest and ZIP SHA-256 verified" `
        -ForegroundColor Green
}

Write-Host 'Registry verification completed.' -ForegroundColor Green
Write-Warning 'This does not verify that GitHub Release assets are published.'
