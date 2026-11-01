[CmdletBinding()]
param(
    [string]$PanelRoot = (
        Join-Path $PSScriptRoot '..\..\panel'
    )
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (
        Join-Path $PSScriptRoot '..'
    )).Path

$pluginRoot = Join-Path $repoRoot 'languages/german'
$manifestPath = Join-Path $pluginRoot 'manifest.json'

$englishRoot = Join-Path $PanelRoot `
    'apps/frontend/src/shared/i18n/locales/en'

if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
    throw "Manifest not found: $manifestPath"
}

if (-not (Test-Path -LiteralPath $englishRoot -PathType Container)) {
    throw "English locale directory not found: $englishRoot"
}

function Get-TranslationEntries {
    param(
        [AllowNull()]
        [object]$Value,
        [string]$Prefix = ''
    )

    $result = @{}

    if ($Value -is [pscustomobject]) {
        foreach ($property in $Value.PSObject.Properties) {
            $key = if ($Prefix) {
                "$Prefix.$($property.Name)"
            }
            else {
                $property.Name
            }

            $nested = Get-TranslationEntries `
                -Value $property.Value `
                -Prefix $key

            foreach ($nestedKey in $nested.Keys) {
                $result[$nestedKey] = $nested[$nestedKey]
            }
        }

        return , $result
    }

    $result[$Prefix] = $Value
    return , $result
}

function Get-Placeholders {
    param(
        [AllowNull()]
        [object]$Value
    )

    if ($Value -isnot [string]) {
        return @()
    }

    return @(
        [regex]::Matches(
            $Value,
            '\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}'
        ) |
        ForEach-Object { $_.Groups[1].Value } |
        Sort-Object -Unique
    )
}

$manifest = Get-Content -LiteralPath $manifestPath `
    -Raw -Encoding UTF8 | ConvertFrom-Json

$files = @($manifest.translations.files)
$issues = [System.Collections.Generic.List[string]]::new()

if ($files.Count -eq 0) {
    throw 'Manifest declares no translation files.'
}

Write-Host "Checking $($files.Count) translation files..."
Write-Host ''

foreach ($relativeFile in $files) {
    if ($relativeFile -cnotmatch '^\./locales/[A-Za-z0-9._-]+\.json$') {
        $issues.Add("Invalid manifest path: $relativeFile")
        continue
    }

    $fileName = Split-Path $relativeFile -Leaf
    $germanPath = Join-Path $pluginRoot `
        $relativeFile.Substring(2)
    $englishPath = Join-Path $englishRoot $fileName

    if (-not (Test-Path -LiteralPath $germanPath -PathType Leaf)) {
        $issues.Add("Missing German file: $fileName")
        continue
    }

    if (-not (Test-Path -LiteralPath $englishPath -PathType Leaf)) {
        $issues.Add("Missing English reference file: $fileName")
        continue
    }

    try {
        $germanJson = Get-Content -LiteralPath $germanPath `
            -Raw -Encoding UTF8 | ConvertFrom-Json -ErrorAction Stop

        $englishJson = Get-Content -LiteralPath $englishPath `
            -Raw -Encoding UTF8 | ConvertFrom-Json -ErrorAction Stop
    }
    catch {
        $issues.Add("Invalid JSON in $fileName : $_")
        continue
    }

    $germanEntries = Get-TranslationEntries -Value $germanJson
    $englishEntries = Get-TranslationEntries -Value $englishJson

    foreach ($key in $englishEntries.Keys) {
        if (-not $germanEntries.ContainsKey($key)) {
            $issues.Add("[$fileName] Missing German key: $key")
            continue
        }

        $englishValue = $englishEntries[$key]
        $germanValue = $germanEntries[$key]

        if ($englishValue -is [string] -and
            $germanValue -isnot [string]) {
            $issues.Add("[$fileName] Invalid value type: $key")
            continue
        }

        if ($germanValue -is [string] -and
            [string]::IsNullOrWhiteSpace($germanValue)) {
            $issues.Add("[$fileName] Empty German translation: $key")
        }

        $englishPlaceholders = @(
            Get-Placeholders -Value $englishValue
        )

        $germanPlaceholders = @(
            Get-Placeholders -Value $germanValue
        )

        $difference = @(
            Compare-Object `
                -ReferenceObject $englishPlaceholders `
                -DifferenceObject $germanPlaceholders
        )

        if ($difference.Count -gt 0) {
            $issues.Add("[$fileName] Placeholder mismatch: $key")
        }
    }

    foreach ($key in $germanEntries.Keys) {
        if (-not $englishEntries.ContainsKey($key)) {
            $issues.Add("[$fileName] Extra German key: $key")
        }
    }

    Write-Host "Checked: $fileName" -ForegroundColor Cyan
}

Write-Host ''

if ($issues.Count -gt 0) {
    foreach ($issue in $issues) {
        Write-Host "FAIL: $issue" -ForegroundColor Red
    }

    throw "Translation verification failed: $($issues.Count) issue(s)."
}

Write-Host "Translation verification passed: $($files.Count) files." `
    -ForegroundColor Green