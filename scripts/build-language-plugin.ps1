[CmdletBinding()]
param(
    [Parameter()]
    [string]$Language = 'german'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$pluginRoot = Join-Path $repoRoot "languages\$Language"
$manifestPath = Join-Path $pluginRoot 'manifest.json'
$distPath = Join-Path $repoRoot 'dist'

if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
    throw "Manifest not found: $manifestPath"
}

Write-Host "Building language plugin: $Language"

$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 |
ConvertFrom-Json

if ($manifest.schemaVersion -ne 1) {
    throw 'Unsupported manifest schemaVersion.'
}

if ($manifest.type -ne 'language') {
    throw 'Plugin type must be language.'
}

if ([string]::IsNullOrWhiteSpace($manifest.id)) {
    throw 'Plugin ID is missing.'
}

if ($manifest.id -cnotmatch '^tyravex\.language\.[a-z0-9.-]+$') {
    throw "Invalid language plugin ID: $($manifest.id)"
}

if ($manifest.version -notmatch '^\d+\.\d+\.\d+$') {
    throw "Invalid plugin version: $($manifest.version)"
}

if ([string]::IsNullOrWhiteSpace($manifest.language.code)) {
    throw 'Language code is missing.'
}

if ([string]::IsNullOrWhiteSpace($manifest.language.name)) {
    throw 'Language name is missing.'
}

if ([string]::IsNullOrWhiteSpace($manifest.language.nativeName)) {
    throw 'Language nativeName is missing.'
}

if ($manifest.translations.namespace -ne 'translation') {
    throw 'Expected translations namespace: translation.'
}

$translationFiles = @($manifest.translations.files)

if ($translationFiles.Count -eq 0) {
    throw 'Manifest does not declare translation files.'
}

$duplicateFiles = @(
    $translationFiles |
    Group-Object -CaseSensitive |
    Where-Object { $_.Count -gt 1 }
)

if ($duplicateFiles.Count -gt 0) {
    throw 'Manifest contains duplicate translation files.'
}

$expectedEntries = @('manifest.json')

foreach ($relativeFile in $translationFiles) {
    if ($relativeFile -cnotmatch '^\./locales/[A-Za-z0-9._-]+\.json$') {
        throw "Invalid translation file path: $relativeFile"
    }

    $entryName = $relativeFile.Substring(2)
    $fullPath = Join-Path $pluginRoot (
        $entryName.Replace('/', [IO.Path]::DirectorySeparatorChar)
    )

    if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
        throw "Translation file missing: $relativeFile"
    }

    try {
        $null = Get-Content -LiteralPath $fullPath -Raw -Encoding UTF8 |
        ConvertFrom-Json -ErrorAction Stop
    }
    catch {
        throw "Invalid JSON in $relativeFile : $_"
    }

    $expectedEntries += $entryName
    Write-Host "OK: $entryName"
}

$actualLocaleFiles = @(
    Get-ChildItem -LiteralPath (Join-Path $pluginRoot 'locales') `
        -File -Filter '*.json' |
    ForEach-Object { "locales/$($_.Name)" }
)

$unexpectedFiles = @(
    $actualLocaleFiles |
    Where-Object { $_ -cnotin $expectedEntries }
)

if ($unexpectedFiles.Count -gt 0) {
    throw "Unlisted locale files: $($unexpectedFiles -join ', ')"
}

New-Item -ItemType Directory -Force -Path $distPath |
Out-Null

$archiveName = "$($manifest.id)-$($manifest.version).zip"
$archivePath = Join-Path $distPath $archiveName

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$tempArchivePath = Join-Path $distPath (
    "$archiveName.$([guid]::NewGuid().ToString('N')).tmp"
)

try {
    $fileStream = [IO.File]::Open(
        $tempArchivePath,
        [IO.FileMode]::CreateNew
    )

    try {
        $archive = [IO.Compression.ZipArchive]::new(
            $fileStream,
            [IO.Compression.ZipArchiveMode]::Create,
            $true
        )

        try {
            foreach ($entryName in $expectedEntries) {
                $sourcePath = Join-Path $pluginRoot (
                    $entryName.Replace(
                        '/',
                        [IO.Path]::DirectorySeparatorChar
                    )
                )

                [IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
                    $archive,
                    $sourcePath,
                    $entryName,
                    [IO.Compression.CompressionLevel]::Optimal
                ) | Out-Null
            }
        }
        finally {
            $archive.Dispose()
        }
    }
    finally {
        $fileStream.Dispose()
    }

    $verifyArchive = [IO.Compression.ZipFile]::OpenRead(
        $tempArchivePath
    )

    try {
        $actualEntries = @(
            $verifyArchive.Entries |
            ForEach-Object { $_.FullName }
        )

        $missingEntries = @(
            $expectedEntries |
            Where-Object { $_ -cnotin $actualEntries }
        )

        $extraEntries = @(
            $actualEntries |
            Where-Object { $_ -cnotin $expectedEntries }
        )

        if ($missingEntries.Count -gt 0 -or $extraEntries.Count -gt 0) {
            throw 'Archive contents do not match the manifest.'
        }

        if ($actualEntries.Count -ne $expectedEntries.Count) {
            throw 'Archive entry count mismatch.'
        }
    }
    finally {
        $verifyArchive.Dispose()
    }

    Move-Item -LiteralPath $tempArchivePath `
        -Destination $archivePath -Force
}
finally {
    if (Test-Path -LiteralPath $tempArchivePath) {
        Remove-Item -LiteralPath $tempArchivePath -Force
    }
}

Write-Host ''
Write-Host 'BUILD SUCCESSFUL' -ForegroundColor Green
Write-Host "Plugin: $($manifest.id)"
Write-Host "Version: $($manifest.version)"
Write-Host "Language: $($manifest.language.code)"
Write-Host "Translation files: $($translationFiles.Count)"
Write-Host "Archive: $archivePath"