[CmdletBinding()]
param([string]$PanelRoot)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'helpers/Remove-TestDirectory.ps1')
$repoRoot = Split-Path $PSScriptRoot -Parent
$sourcePlugin = Join-Path $repoRoot 'languages/german'
$sourceChecker = Join-Path $PSScriptRoot 'Test-Translations.ps1'
$pluginManifest = Get-Content -LiteralPath (Join-Path $sourcePlugin 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$sourceEnglish = if ($PanelRoot) {
    Join-Path $PanelRoot 'apps/frontend/src/shared/i18n/locales/en'
} else {
    Join-Path $repoRoot ('tests/references/german/' + $pluginManifest.version + '/en')
}
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ('tyravex-translation-tests-' + [guid]::NewGuid().ToString('N'))
$passed = 0
$failed = 0

function Update-TestJson {
    param([string]$Path, [scriptblock]$Modify)
    $json = Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json
    & $Modify $json
    [IO.File]::WriteAllText($Path, ($json | ConvertTo-Json -Depth 50), (New-Object Text.UTF8Encoding($false)))
}

function Invoke-TranslationCase {
    param([string]$Name, [bool]$ShouldSucceed, [scriptblock]$Modify, [switch]$ComparePanel)
    $caseRoot = Join-Path $tempRoot ('case-' + [guid]::NewGuid().ToString('N'))
    try {
        $languages = Join-Path $caseRoot 'languages'
        $tests = Join-Path $caseRoot 'tests'
        $panel = Join-Path $caseRoot 'panel'
        $english = Join-Path $panel 'apps/frontend/src/shared/i18n/locales/en'
        New-Item -ItemType Directory -Force -Path $languages, $tests, $english | Out-Null
        Copy-Item -LiteralPath $sourcePlugin -Destination (Join-Path $languages 'german') -Recurse
        Copy-Item -LiteralPath $sourceChecker -Destination (Join-Path $tests 'Test-Translations.ps1')
        foreach ($file in Get-ChildItem -LiteralPath $sourceEnglish -Filter '*.json' -File) {
            Copy-Item -LiteralPath $file.FullName -Destination $english
        }
        $reference = Join-Path $tests ('references/german/' + $pluginManifest.version + '/en')
        New-Item -ItemType Directory -Force -Path $reference | Out-Null
        foreach ($file in Get-ChildItem -LiteralPath $sourceEnglish -Filter '*.json' -File) {
            Copy-Item -LiteralPath $file.FullName -Destination $reference
        }
        if ($null -ne $Modify) { & $Modify (Join-Path $languages 'german') }
        $succeeded = $false
        $failure = ''
        try {
            if ($ComparePanel) {
                & (Join-Path $tests 'Test-Translations.ps1') -PanelRoot $panel *> $null
            } else {
                & (Join-Path $tests 'Test-Translations.ps1') *> $null
            }
            $succeeded = $true
        } catch { $failure = $_.Exception.Message }
        if ($succeeded -eq $ShouldSucceed) {
            $script:passed++
            Write-Host "PASS: $Name"
        } else {
            $script:failed++
            Write-Host "FAIL: $Name ($failure)"
        }
    } finally {
        Remove-TestDirectory -LiteralPath $caseRoot -TestRoot $tempRoot
    }
}

try {
    New-Item -ItemType Directory -Path $tempRoot | Out-Null
    Invoke-TranslationCase -Name 'Complete German resources' -ShouldSucceed $true
    Invoke-TranslationCase -Name 'Explicit panel compatibility check' -ShouldSucceed $true -ComparePanel
    Invoke-TranslationCase -Name 'Missing versioned reference' -ShouldSucceed $false -Modify {
        param($plugin)
        Update-TestJson (Join-Path $plugin 'manifest.json') { param($json) $json.version = '9.9.9' }
    }
    Invoke-TranslationCase -Name 'Missing whole manifest section' -ShouldSucceed $false -Modify {
        param($plugin)
        Update-TestJson (Join-Path $plugin 'manifest.json') {
            param($json)
            $json.translations.files = @($json.translations.files | Where-Object { $_ -ne './locales/services.json' })
        }
    }
    Invoke-TranslationCase -Name 'Missing individual translation' -ShouldSucceed $false -Modify {
        param($plugin)
        Update-TestJson (Join-Path $plugin 'locales/common.json') { param($json) $json.common.PSObject.Properties.Remove('cancel') }
    }
    Invoke-TranslationCase -Name 'Unexpected individual translation' -ShouldSucceed $false -Modify {
        param($plugin)
        Update-TestJson (Join-Path $plugin 'locales/common.json') { param($json) $json.common | Add-Member -NotePropertyName unexpectedReferenceKey -NotePropertyValue 'Zusatz' }
    }
    Invoke-TranslationCase -Name 'Lost leading umlaut' -ShouldSucceed $false -Modify {
        param($plugin)
        Update-TestJson (Join-Path $plugin 'locales/navigation.json') { param($json) $json.navigation.overview = '?bersicht' }
    }
    Invoke-TranslationCase -Name 'Unicode replacement character' -ShouldSucceed $false -Modify {
        param($plugin)
        Update-TestJson (Join-Path $plugin 'locales/common.json') { param($json) $json.common.back = [string][char]0xFFFD }
    }
    Invoke-TranslationCase -Name 'Missing interpolation parameter' -ShouldSucceed $false -Modify {
        param($plugin)
        Update-TestJson (Join-Path $plugin 'locales/common.json') { param($json) $json.common.copyright = 'Tyravex' }
    }
    Invoke-TranslationCase -Name 'Empty translation' -ShouldSucceed $false -Modify {
        param($plugin)
        Update-TestJson (Join-Path $plugin 'locales/common.json') { param($json) $json.common.cancel = '' }
    }
    Invoke-TranslationCase -Name 'Legitimate question punctuation' -ShouldSucceed $true -Modify {
        param($plugin)
        Update-TestJson (Join-Path $plugin 'locales/common.json') { param($json) $json.common.cancel = 'Fortfahren?' }
    }
    Write-Host "Passed: $passed"
    Write-Host "Failed: $failed"
    if ($failed) { throw "Translation regression tests failed: $failed" }
} finally {
    Remove-TestDirectory -LiteralPath $tempRoot -TestRoot $tempRoot
}
