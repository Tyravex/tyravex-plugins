[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$sourcePlugin = Join-Path $repoRoot 'languages/german'
$sourceBuilder = Join-Path $repoRoot 'scripts/build-language-plugin.ps1'

$sourceManifest = Join-Path $sourcePlugin 'manifest.json'

if (-not (Test-Path -LiteralPath $sourceBuilder -PathType Leaf)) {
    throw "Build script not found: $sourceBuilder"
}

if (-not (Test-Path -LiteralPath $sourceManifest -PathType Leaf)) {
    throw "Manifest not found: $sourceManifest"
}

$tempRoot = Join-Path ([IO.Path]::GetTempPath()) (
    'tyravex-archive-tests-' + [guid]::NewGuid().ToString('N')
)

$passed = 0
$failed = 0

function Get-ArchiveEntryBytes {
    param(
        [Parameter(Mandatory)]
        [System.IO.Compression.ZipArchiveEntry]$Entry
    )

    $stream = $Entry.Open()

    try {
        $memory = New-Object System.IO.MemoryStream

        try {
            $stream.CopyTo($memory)
            return , $memory.ToArray()
        }
        finally {
            $memory.Dispose()
        }
    }
    finally {
        $stream.Dispose()
    }
}

function Get-ArchiveEntryText {
    param(
        [Parameter(Mandatory)]
        [System.IO.Compression.ZipArchiveEntry]$Entry
    )

    $bytes = Get-ArchiveEntryBytes -Entry $Entry
    $utf8 = New-Object System.Text.UTF8Encoding($false, $true)

    return $utf8.GetString($bytes)
}

function Test-PluginArchive {
    param(
        [Parameter(Mandatory)]
        [string]$ArchivePath,

        [Parameter(Mandatory)]
        [string]$PluginRoot
    )

    $manifestPath = Join-Path $PluginRoot 'manifest.json'

    $manifest = Get-Content -LiteralPath $manifestPath `
        -Raw -Encoding UTF8 |
    ConvertFrom-Json -ErrorAction Stop

    $declaredFiles = @($manifest.translations.files)

    if ($declaredFiles.Count -eq 0) {
        throw 'Manifest does not declare translation files.'
    }

    $expectedEntries = @('manifest.json')

    foreach ($relativeFile in $declaredFiles) {
        if ($relativeFile -cnotmatch '^\./locales/[A-Za-z0-9._-]+\.json$') {
            throw "Invalid manifest translation path: $relativeFile"
        }

        $expectedEntries += $relativeFile.Substring(2)
    }

    if (@($expectedEntries | Select-Object -Unique).Count -ne
        $expectedEntries.Count) {
        throw 'Manifest contains duplicate archive entries.'
    }

    $archive = [IO.Compression.ZipFile]::OpenRead($ArchivePath)

    try {
        $actualEntries = @(
            $archive.Entries |
            ForEach-Object { $_.FullName }
        )

        if (@($actualEntries | Select-Object -Unique).Count -ne
            $actualEntries.Count) {
            throw 'ZIP contains duplicate entries.'
        }

        if ($actualEntries.Count -ne $expectedEntries.Count) {
            throw "ZIP entry count mismatch: expected $($expectedEntries.Count), found $($actualEntries.Count)."
        }

        foreach ($entryName in $expectedEntries) {
            if ($entryName -cnotin $actualEntries) {
                throw "Missing ZIP entry: $entryName"
            }
        }

        foreach ($entryName in $actualEntries) {
            if ($entryName -cnotin $expectedEntries) {
                throw "Unexpected ZIP entry: $entryName"
            }
        }

        foreach ($entryName in $expectedEntries) {
            $entry = $archive.GetEntry($entryName)

            if ($null -eq $entry) {
                throw "Cannot open ZIP entry: $entryName"
            }

            $archiveBytes = Get-ArchiveEntryBytes -Entry $entry

            $sourcePath = Join-Path $PluginRoot (
                $entryName.Replace(
                    '/',
                    [IO.Path]::DirectorySeparatorChar
                )
            )

            if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
                throw "Source file missing: $entryName"
            }

            $sourceBytes = [IO.File]::ReadAllBytes($sourcePath)

            $sourceHash = [BitConverter]::ToString(
                [Security.Cryptography.SHA256]::Create().ComputeHash(
                    $sourceBytes
                )
            ).Replace('-', '')

            $archiveHash = [BitConverter]::ToString(
                [Security.Cryptography.SHA256]::Create().ComputeHash(
                    $archiveBytes
                )
            ).Replace('-', '')

            if ($sourceHash -cne $archiveHash) {
                throw "ZIP content mismatch: $entryName"
            }

            if ($entryName -like '*.json') {
                $text = Get-ArchiveEntryText -Entry $entry

                try {
                    $null = ConvertFrom-Json `
                        -InputObject $text `
                        -ErrorAction Stop
                }
                catch {
                    throw "Invalid JSON in ZIP entry: $entryName"
                }
            }
        }

        return $true
    }
    finally {
        $archive.Dispose()
    }
}

function New-TestArchive {
    param(
        [Parameter(Mandatory)]
        [string]$SourceArchive,

        [Parameter(Mandatory)]
        [string]$DestinationArchive,

        [Parameter(Mandatory)]
        [string]$Mode
    )

    $inputArchive = [IO.Compression.ZipFile]::OpenRead(
        $SourceArchive
    )

    try {
        $outputStream = [IO.File]::Open(
            $DestinationArchive,
            [IO.FileMode]::CreateNew
        )

        try {
            $outputArchive = [IO.Compression.ZipArchive]::new(
                $outputStream,
                [IO.Compression.ZipArchiveMode]::Create,
                $true
            )

            try {
                foreach ($entry in $inputArchive.Entries) {
                    if ($Mode -eq 'missing' -and
                        $entry.FullName -ceq 'locales/sidebar.json') {
                        continue
                    }

                    $entryBytes = Get-ArchiveEntryBytes -Entry $entry

                    if ($Mode -eq 'modified' -and
                        $entry.FullName -ceq 'locales/sidebar.json') {
                        $entryBytes = [Text.Encoding]::UTF8.GetBytes(
                            '{"modified":"true"}'
                        )
                    }

                    $newEntry = $outputArchive.CreateEntry(
                        $entry.FullName,
                        [IO.Compression.CompressionLevel]::Optimal
                    )

                    $entryStream = $newEntry.Open()

                    try {
                        $entryStream.Write(
                            $entryBytes,
                            0,
                            $entryBytes.Length
                        )
                    }
                    finally {
                        $entryStream.Dispose()
                    }
                }

                if ($Mode -eq 'extra') {
                    $extraEntry = $outputArchive.CreateEntry(
                        'unexpected.txt'
                    )

                    $extraStream = $extraEntry.Open()

                    try {
                        $bytes = [Text.Encoding]::UTF8.GetBytes(
                            'Unexpected archive entry'
                        )

                        $extraStream.Write(
                            $bytes,
                            0,
                            $bytes.Length
                        )
                    }
                    finally {
                        $extraStream.Dispose()
                    }
                }

                if ($Mode -eq 'duplicate') {
                    $duplicateEntry = $outputArchive.CreateEntry(
                        'locales/sidebar.json'
                    )

                    $duplicateStream = $duplicateEntry.Open()

                    try {
                        $bytes = [Text.Encoding]::UTF8.GetBytes('{}')

                        $duplicateStream.Write(
                            $bytes,
                            0,
                            $bytes.Length
                        )
                    }
                    finally {
                        $duplicateStream.Dispose()
                    }
                }

                if ($Mode -eq 'invalid-json') {
                    # This case is created by replacing a valid JSON
                    # entry with malformed JSON.
                    # It is handled in the entry-copy loop below.
                }
            }
            finally {
                $outputArchive.Dispose()
            }
        }
        finally {
            $outputStream.Dispose()
        }
    }
    finally {
        $inputArchive.Dispose()
    }
}

function Invoke-ArchiveTest {
    param(
        [Parameter(Mandatory)]
        [string]$Name,

        [Parameter(Mandatory)]
        [string]$ArchivePath,

        [Parameter(Mandatory)]
        [bool]$ShouldSucceed,

        [Parameter(Mandatory)]
        [string]$PluginRoot
    )

    $succeeded = $false
    $errorMessage = $null

    try {
        $null = Test-PluginArchive `
            -ArchivePath $ArchivePath `
            -PluginRoot $PluginRoot

        $succeeded = $true
    }
    catch {
        $errorMessage = $_.Exception.Message
    }

    if ($succeeded -eq $ShouldSucceed) {
        $script:passed++
        Write-Host "PASS: $Name" -ForegroundColor Green
    }
    else {
        $script:failed++
        Write-Host "FAIL: $Name" -ForegroundColor Red

        if ($succeeded) {
            Write-Host '  Invalid ZIP was unexpectedly accepted.'
        }
        else {
            Write-Host "  Verification error: $errorMessage"
        }
    }
}

try {
    New-Item -ItemType Directory -Force `
        -Path $tempRoot | Out-Null

    $caseLanguages = Join-Path $tempRoot 'languages'
    $casePlugin = Join-Path $caseLanguages 'german'
    $caseScripts = Join-Path $tempRoot 'scripts'

    New-Item -ItemType Directory -Force `
        -Path $caseLanguages | Out-Null

    New-Item -ItemType Directory -Force `
        -Path $caseScripts | Out-Null

    Copy-Item -LiteralPath $sourcePlugin `
        -Destination $casePlugin `
        -Recurse -Force

    Copy-Item -LiteralPath $sourceBuilder `
        -Destination (Join-Path $caseScripts 'build-language-plugin.ps1') `
        -Force

    Write-Host 'Building temporary plugin archive...'

    & (Join-Path $caseScripts 'build-language-plugin.ps1') `
        -Language german *> $null

    $manifest = Get-Content -LiteralPath (
        Join-Path $casePlugin 'manifest.json'
    ) -Raw -Encoding UTF8 | ConvertFrom-Json

    $archiveName = "$($manifest.id)-$($manifest.version).zip"
    $validArchive = Join-Path (
        Join-Path $tempRoot 'dist'
    ) $archiveName

    if (-not (Test-Path -LiteralPath $validArchive -PathType Leaf)) {
        throw "Temporary build did not produce ZIP: $validArchive"
    }

    Write-Host ''
    Write-Host 'Tyravex Plugin Archive Tests'
    Write-Host '============================'
    Write-Host ''

    Invoke-ArchiveTest `
        -Name 'Valid archive' `
        -ArchivePath $validArchive `
        -ShouldSucceed $true `
        -PluginRoot $casePlugin

    $missingArchive = Join-Path $tempRoot 'missing.zip'

    New-TestArchive `
        -SourceArchive $validArchive `
        -DestinationArchive $missingArchive `
        -Mode 'missing'

    Invoke-ArchiveTest `
        -Name 'Missing translation entry' `
        -ArchivePath $missingArchive `
        -ShouldSucceed $false `
        -PluginRoot $casePlugin

    $extraArchive = Join-Path $tempRoot 'extra.zip'

    New-TestArchive `
        -SourceArchive $validArchive `
        -DestinationArchive $extraArchive `
        -Mode 'extra'

    Invoke-ArchiveTest `
        -Name 'Unexpected archive entry' `
        -ArchivePath $extraArchive `
        -ShouldSucceed $false `
        -PluginRoot $casePlugin

    $modifiedArchive = Join-Path $tempRoot 'modified.zip'

    New-TestArchive `
        -SourceArchive $validArchive `
        -DestinationArchive $modifiedArchive `
        -Mode 'modified'

    Invoke-ArchiveTest `
        -Name 'Modified translation content' `
        -ArchivePath $modifiedArchive `
        -ShouldSucceed $false `
        -PluginRoot $casePlugin

    $duplicateArchive = Join-Path $tempRoot 'duplicate.zip'

    New-TestArchive `
        -SourceArchive $validArchive `
        -DestinationArchive $duplicateArchive `
        -Mode 'duplicate'

    Invoke-ArchiveTest `
        -Name 'Duplicate archive entry' `
        -ArchivePath $duplicateArchive `
        -ShouldSucceed $false `
        -PluginRoot $casePlugin

    Write-Host ''
    Write-Host '============================'
    Write-Host "Passed: $passed"
    Write-Host "Failed: $failed"

    if ($failed -gt 0) {
        throw "Archive test suite failed: $failed test(s)."
    }

    Write-Host 'Archive test suite passed.' `
        -ForegroundColor Green
}
finally {
    if (Test-Path -LiteralPath $tempRoot) {
        Remove-Item -LiteralPath $tempRoot `
            -Recurse -Force
    }
}