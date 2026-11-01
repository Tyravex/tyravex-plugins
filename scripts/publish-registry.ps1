param(
    [string]$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
    [string]$ReleaseBaseUrl = 'https://github.com/Tyravex/tyravex-plugins/releases/download'
)

$ErrorActionPreference = 'Stop'
$manifestPath = Join-Path $RepositoryRoot 'languages/german/manifest.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($manifest.id -ne 'tyravex.language.german' -or $manifest.type -ne 'language') {
    throw 'Unexpected German plugin manifest.'
}
if ($manifest.translations.files.Count -ne 19) {
    throw 'German plugin must contain 19 translation files.'
}
foreach ($relative in $manifest.translations.files) {
    if ($relative -notmatch '^\./locales/[A-Za-z0-9_-]+\.json$') { throw "Invalid translation path: $relative" }
    $path = Join-Path $RepositoryRoot ('languages/german/' + $relative.Substring(2))
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Missing translation file: $path" }
}
$zipName = '{0}-{1}.zip' -f $manifest.id, $manifest.version
$zipPath = Join-Path $RepositoryRoot ('dist/' + $zipName)
if (-not (Test-Path -LiteralPath $zipPath -PathType Leaf)) {
    throw "ZIP not found: $zipPath. First run .\scripts\build-language-plugin.ps1 -Language german"
}
$hash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
$tag = '{0}-v{1}' -f $manifest.id, $manifest.version
$url = '{0}/{1}/{2}' -f $ReleaseBaseUrl.TrimEnd('/'), $tag, $zipName
$registry = [ordered]@{
    schemaVersion = 1
    plugins       = @(
        [ordered]@{
            id          = $manifest.id
            name        = 'German Language Pack'
            description = 'German (Deutsch) translations for Tyravex.'
            type        = $manifest.type
            version     = $manifest.version
            downloadUrl = $url
            sha256      = $hash
            category    = 'languages'
            source      = 'official'
        }
    )
}
$json = $registry | ConvertTo-Json -Depth 8
$target = Join-Path $RepositoryRoot 'registry.json'
[System.IO.File]::WriteAllText($target, $json + [Environment]::NewLine, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "Registry written: $target"
Write-Host "SHA-256: $hash"
Write-Host "Release asset URL: $url"
Write-Warning 'The URL is only valid after the GitHub Release and ZIP asset have been published.'
