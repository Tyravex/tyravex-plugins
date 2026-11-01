[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$sourcePlugin = Join-Path $repoRoot 'languages/german'
$sourceBuilder = Join-Path $repoRoot 'scripts/build-language-plugin.ps1'

if (-not (Test-Path -LiteralPath $sourceBuilder -PathType Leaf)) {
    throw "Build script not found: $sourceBuilder"
}

if (-not (Test-Path -LiteralPath $sourcePlugin -PathType Container)) {
    throw "Plugin directory not found: $sourcePlugin"
}

$tempRoot = Join-Path ([IO.Path]::GetTempPath()) (
    'tyravex-manifest-tests-' + [guid]::NewGuid().ToString('N')
)

$passed = 0
$failed = 0

function Update-Manifest {
    param(
        [Parameter(Mandatory)]
        [string]$Path,

        [Parameter(Mandatory)]
        [scriptblock]$Change
    )

    $manifest = Get-Content -LiteralPath $Path `
        -Raw -Encoding UTF8 |
    ConvertFrom-Json -ErrorAction Stop

    & $Change $manifest

    $json = $manifest | ConvertTo-Json -Depth 20

    [IO.File]::WriteAllText(
        $Path,
        $json,
        (New-Object System.Text.UTF8Encoding($false))
    )
}

function Invoke-TestCase {
    param(
        [Parameter(Mandatory)]
        [string]$Name,

        [Parameter(Mandatory)]
        [bool]$ShouldSucceed,

        [Parameter()]
        [scriptblock]$Modify
    )

    $caseRoot = Join-Path $tempRoot (
        'case-' + [guid]::NewGuid().ToString('N')
    )

    $caseLanguages = Join-Path $caseRoot 'languages'
    $casePlugin = Join-Path $caseLanguages 'german'
    $caseScripts = Join-Path $caseRoot 'scripts'
    $caseManifest = Join-Path $casePlugin 'manifest.json'
    $caseBuilder = Join-Path $caseScripts 'build-language-plugin.ps1'

    try {
        # Create only parent directories.
        # Copy-Item will create the german directory itself.
        New-Item -ItemType Directory -Force `
            -Path $caseLanguages | Out-Null

        New-Item -ItemType Directory -Force `
            -Path $caseScripts | Out-Null

        Copy-Item -LiteralPath $sourcePlugin `
            -Destination $casePlugin `
            -Recurse -Force

        Copy-Item -LiteralPath $sourceBuilder `
            -Destination $caseBuilder `
            -Force

        if (-not (Test-Path -LiteralPath $caseManifest -PathType Leaf)) {
            throw "Test manifest copy not found: $caseManifest"
        }

        # Modify only the temporary plugin copy.
        if ($null -ne $Modify) {
            & $Modify $caseManifest $casePlugin
        }

        $buildSucceeded = $false
        $buildError = $null

        try {
            # The existing builder uses terminating errors (throw).
            # Suppress its output while preserving exceptions.
            & $caseBuilder -Language german *> $null

            # A successful build must also produce the expected ZIP.
            $manifest = Get-Content -LiteralPath $caseManifest `
                -Raw -Encoding UTF8 |
            ConvertFrom-Json -ErrorAction Stop

            $archiveName = "$($manifest.id)-$($manifest.version).zip"
            $archivePath = Join-Path $caseRoot (
                Join-Path 'dist' $archiveName
            )

            if (-not (Test-Path -LiteralPath $archivePath -PathType Leaf)) {
                throw "Build returned without creating ZIP: $archivePath"
            }

            $buildSucceeded = $true
        }
        catch {
            $buildError = $_.Exception.Message
        }

        if ($buildSucceeded -eq $ShouldSucceed) {
            $script:passed++
            Write-Host "PASS: $Name" -ForegroundColor Green
        }
        else {
            $script:failed++
            Write-Host "FAIL: $Name" -ForegroundColor Red

            if ($buildSucceeded) {
                Write-Host '  Invalid input was unexpectedly accepted.'
            }
            else {
                Write-Host "  Expected success, but build failed: $buildError"
            }
        }
    }
    catch {
        $script:failed++
        Write-Host "FAIL: $Name" -ForegroundColor Red
        Write-Host "  Test setup or execution error: $($_.Exception.Message)"
    }
    finally {
        if (Test-Path -LiteralPath $caseRoot) {
            Remove-Item -LiteralPath $caseRoot `
                -Recurse -Force
        }
    }
}

try {
    New-Item -ItemType Directory -Force `
        -Path $tempRoot | Out-Null

    Write-Host 'Tyravex Plugin Manifest Tests'
    Write-Host '============================='
    Write-Host ''

    # 1. Valid manifest and complete plugin.
    Invoke-TestCase `
        -Name 'Valid manifest' `
        -ShouldSucceed $true

    # 2. Unsupported schema version.
    Invoke-TestCase `
        -Name 'Unsupported schemaVersion' `
        -ShouldSucceed $false `
        -Modify {
        param($manifestPath, $pluginRoot)

        Update-Manifest -Path $manifestPath -Change {
            param($manifest)
            $manifest.schemaVersion = 999
        }
    }

    # 3. Invalid plugin identifier.
    Invoke-TestCase `
        -Name 'Invalid plugin ID' `
        -ShouldSucceed $false `
        -Modify {
        param($manifestPath, $pluginRoot)

        Update-Manifest -Path $manifestPath -Change {
            param($manifest)
            $manifest.id = 'invalid-plugin-id'
        }
    }

    # 4. Invalid SemVer version.
    Invoke-TestCase `
        -Name 'Invalid plugin version' `
        -ShouldSucceed $false `
        -Modify {
        param($manifestPath, $pluginRoot)

        Update-Manifest -Path $manifestPath -Change {
            param($manifest)
            $manifest.version = 'invalid-version'
        }
    }

    # 5. Missing declared translation file.
    Invoke-TestCase `
        -Name 'Missing translation file' `
        -ShouldSucceed $false `
        -Modify {
        param($manifestPath, $pluginRoot)

        $filePath = Join-Path $pluginRoot 'locales/sidebar.json'

        Remove-Item -LiteralPath $filePath -Force
    }

    # 6. Duplicate file in the manifest.
    Invoke-TestCase `
        -Name 'Duplicate translation file' `
        -ShouldSucceed $false `
        -Modify {
        param($manifestPath, $pluginRoot)

        Update-Manifest -Path $manifestPath -Change {
            param($manifest)

            $files = @($manifest.translations.files)

            $manifest.translations.files = @(
                $files + $files[0]
            )
        }
    }

    # 7. Malformed JSON in a declared translation.
    Invoke-TestCase `
        -Name 'Invalid translation JSON' `
        -ShouldSucceed $false `
        -Modify {
        param($manifestPath, $pluginRoot)

        $filePath = Join-Path $pluginRoot 'locales/sidebar.json'

        [IO.File]::WriteAllText(
            $filePath,
            '{ invalid json',
            (New-Object System.Text.UTF8Encoding($false))
        )
    }

    Write-Host ''
    Write-Host '============================='
    Write-Host "Passed: $passed"
    Write-Host "Failed: $failed"

    if ($failed -gt 0) {
        throw "Manifest test suite failed: $failed test(s)."
    }

    Write-Host 'Manifest test suite passed.' `
        -ForegroundColor Green
}
finally {
    if (Test-Path -LiteralPath $tempRoot) {
        Remove-Item -LiteralPath $tempRoot `
            -Recurse -Force
    }
}