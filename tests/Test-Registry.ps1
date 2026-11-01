[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$sourcePlugin = Join-Path $repoRoot 'languages/german'
$sourceBuilder = Join-Path $repoRoot 'scripts/build-language-plugin.ps1'
$sourcePublisher = Join-Path $repoRoot 'scripts/publish-registry.ps1'
$sourceVerifier = Join-Path $repoRoot 'scripts/verify-registry.ps1'

foreach ($path in @($sourcePlugin, $sourceBuilder, $sourcePublisher, $sourceVerifier)) {
    if (-not (Test-Path -LiteralPath $path)) {
        throw "Required source not found: $path"
    }
}

$tempRoot = Join-Path ([IO.Path]::GetTempPath()) (
    'tyravex-registry-tests-' + [guid]::NewGuid().ToString('N')
)
$fixtureRoot = Join-Path $tempRoot 'fixture'
$passed = 0
$failed = 0

function Write-JsonFile {
    param([string]$Path, [object]$Value)
    $json = $Value | ConvertTo-Json -Depth 30
    [IO.File]::WriteAllText($Path, $json + [Environment]::NewLine,
        (New-Object System.Text.UTF8Encoding($false)))
}

function Update-Registry {
    param([string]$Root, [scriptblock]$Change)
    $path = Join-Path $Root 'registry.json'
    $registry = Get-Content -LiteralPath $path -Raw -Encoding UTF8 |
        ConvertFrom-Json -ErrorAction Stop
    & $Change $registry
    Write-JsonFile -Path $path -Value $registry
}

function New-RegistryFixture {
    param([string]$Destination)
    $languagesRoot = Join-Path $Destination 'languages'
    $scriptsRoot = Join-Path $Destination 'scripts'
    New-Item -ItemType Directory -Force -Path $languagesRoot | Out-Null
    New-Item -ItemType Directory -Force -Path $scriptsRoot | Out-Null
    Copy-Item -LiteralPath $sourcePlugin -Destination (
        Join-Path $languagesRoot 'german') -Recurse -Force
    Copy-Item -LiteralPath $sourceBuilder -Destination (
        Join-Path $scriptsRoot 'build-language-plugin.ps1') -Force
    Copy-Item -LiteralPath $sourcePublisher -Destination (
        Join-Path $scriptsRoot 'publish-registry.ps1') -Force
    Copy-Item -LiteralPath $sourceVerifier -Destination (
        Join-Path $scriptsRoot 'verify-registry.ps1') -Force

    & (Join-Path $scriptsRoot 'build-language-plugin.ps1') -Language german *> $null
    & (Join-Path $scriptsRoot 'publish-registry.ps1') -RepositoryRoot $Destination *> $null

    $registryPath = Join-Path $Destination 'registry.json'
    if (-not (Test-Path -LiteralPath $registryPath -PathType Leaf)) {
        throw 'Fixture registry was not generated.'
    }
    $registry = Get-Content -LiteralPath $registryPath -Raw -Encoding UTF8 |
        ConvertFrom-Json -ErrorAction Stop
    $plugin = @($registry.plugins)[0]
    $zipPath = Join-Path $Destination (
        'dist/{0}-{1}.zip' -f $plugin.id, $plugin.version)
    if (-not (Test-Path -LiteralPath $zipPath -PathType Leaf)) {
        throw "Fixture ZIP not found: $zipPath"
    }
}

function Invoke-RegistryTest {
    param(
        [string]$Name,
        [bool]$ShouldSucceed,
        [scriptblock]$Modify
    )
    $caseRoot = Join-Path $tempRoot (
        'case-' + [guid]::NewGuid().ToString('N')
    )
    try {
        Copy-Item -LiteralPath $fixtureRoot -Destination $caseRoot -Recurse -Force
        if ($null -ne $Modify) {
            & $Modify $caseRoot
        }
        $succeeded = $false
        $failure = $null
        try {
            & (Join-Path $caseRoot 'scripts/verify-registry.ps1') `
                -RepositoryRoot $caseRoot *> $null
            $succeeded = $true
        }
        catch {
            $failure = $_.Exception.Message
        }
        if ($succeeded -eq $ShouldSucceed) {
            $script:passed++
            Write-Host "PASS: $Name" -ForegroundColor Green
        }
        else {
            $script:failed++
            Write-Host "FAIL: $Name" -ForegroundColor Red
            if ($succeeded) {
                Write-Host '  Invalid registry was unexpectedly accepted.'
            }
            else {
                Write-Host "  Unexpected rejection: $failure"
            }
        }
    }
    catch {
        $script:failed++
        Write-Host "FAIL: $Name" -ForegroundColor Red
        Write-Host "  Test setup error: $($_.Exception.Message)"
    }
    finally {
        if (Test-Path -LiteralPath $caseRoot) {
            Remove-Item -LiteralPath $caseRoot -Recurse -Force
        }
    }
}

try {
    New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null
    Write-Host 'Preparing temporary registry fixture...'
    New-RegistryFixture -Destination $fixtureRoot
    Write-Host ''
    Write-Host 'Tyravex Plugin Registry Tests'
    Write-Host '============================='
    Write-Host ''

    Invoke-RegistryTest -Name 'Valid registry' -ShouldSucceed $true

    Invoke-RegistryTest -Name 'Unsupported schemaVersion' -ShouldSucceed $false -Modify {
        param($root)
        Update-Registry $root { param($r) $r.schemaVersion = 999 }
    }
    Invoke-RegistryTest -Name 'Duplicate plugin ID' -ShouldSucceed $false -Modify {
        param($root)
        Update-Registry $root {
            param($r)
            $copy = $r.plugins[0] | ConvertTo-Json -Depth 20 | ConvertFrom-Json
            $r.plugins = @($r.plugins) + @($copy)
        }
    }
    Invoke-RegistryTest -Name 'Invalid SHA-256 format' -ShouldSucceed $false -Modify {
        param($root)
        Update-Registry $root { param($r) $r.plugins[0].sha256 = 'invalid-hash' }
    }
    Invoke-RegistryTest -Name 'SHA-256 mismatch' -ShouldSucceed $false -Modify {
        param($root)
        Update-Registry $root { param($r) $r.plugins[0].sha256 = '0' * 64 }
    }
    Invoke-RegistryTest -Name 'Non-HTTPS download URL' -ShouldSucceed $false -Modify {
        param($root)
        Update-Registry $root {
            param($r)
            $r.plugins[0].downloadUrl = $r.plugins[0].downloadUrl -replace '^https:', 'http:'
        }
    }
    Invoke-RegistryTest -Name 'Unexpected download host' -ShouldSucceed $false -Modify {
        param($root)
        Update-Registry $root {
            param($r)
            $r.plugins[0].downloadUrl = $r.plugins[0].downloadUrl.Replace('github.com','example.com')
        }
    }
    Invoke-RegistryTest -Name 'Missing ZIP archive' -ShouldSucceed $false -Modify {
        param($root)
        $r = Get-Content (Join-Path $root 'registry.json') -Raw | ConvertFrom-Json
        $p = $r.plugins[0]
        Remove-Item -LiteralPath (Join-Path $root (
            'dist/{0}-{1}.zip' -f $p.id, $p.version)) -Force
    }
    Invoke-RegistryTest -Name 'Missing plugin ID' -ShouldSucceed $false -Modify {
        param($root)
        Update-Registry $root { param($r) $r.plugins[0].id = '' }
    }
    Invoke-RegistryTest -Name 'Missing plugin name' -ShouldSucceed $false -Modify {
        param($root)
        Update-Registry $root { param($r) $r.plugins[0].name = '' }
    }
    Invoke-RegistryTest -Name 'Missing description' -ShouldSucceed $false -Modify {
        param($root)
        Update-Registry $root { param($r) $r.plugins[0].description = '' }
    }
    Invoke-RegistryTest -Name 'Invalid plugin type' -ShouldSucceed $false -Modify {
        param($root)
        Update-Registry $root { param($r) $r.plugins[0].type = 'theme' }
    }
    Invoke-RegistryTest -Name 'Invalid category' -ShouldSucceed $false -Modify {
        param($root)
        Update-Registry $root { param($r) $r.plugins[0].category = 'themes' }
    }
    Invoke-RegistryTest -Name 'Invalid source' -ShouldSucceed $false -Modify {
        param($root)
        Update-Registry $root { param($r) $r.plugins[0].source = 'community' }
    }
    Invoke-RegistryTest -Name 'Version mismatch with manifest' -ShouldSucceed $false -Modify {
        param($root)
        Update-Registry $root { param($r) $r.plugins[0].version = '2.0.0' }
    }
    Invoke-RegistryTest -Name 'Incorrect release asset URL' -ShouldSucceed $false -Modify {
        param($root)
        Update-Registry $root {
            param($r)
            $r.plugins[0].downloadUrl += '?asset=other'
        }
    }
    Invoke-RegistryTest -Name 'Invalid plugins structure' -ShouldSucceed $false -Modify {
        param($root)
        Update-Registry $root { param($r) $r.plugins = 'not-an-array' }
    }
    Invoke-RegistryTest -Name 'Manifest ID mismatch' -ShouldSucceed $false -Modify {
        param($root)
        $path = Join-Path $root 'languages/german/manifest.json'
        $m = Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json
        $m.id = 'tyravex.language.other'
        Write-JsonFile -Path $path -Value $m
    }

    Write-Host ''
    Write-Host '============================='
    Write-Host "Passed: $passed"
    Write-Host "Failed: $failed"
    if ($failed -gt 0) {
        throw "Registry test suite failed: $failed test(s)."
    }
    Write-Host 'Registry test suite passed.' -ForegroundColor Green
}
finally {
    if (Test-Path -LiteralPath $tempRoot) {
        Remove-Item -LiteralPath $tempRoot -Recurse -Force
    }
}
