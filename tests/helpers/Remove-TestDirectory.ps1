[CmdletBinding()]
param()

function Remove-TestDirectory {
    param([string]$LiteralPath, [string]$TestRoot)

    $comparison = [StringComparison]::OrdinalIgnoreCase
    $separator = [IO.Path]::DirectorySeparatorChar
    $temporaryDirectory = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd($separator) + $separator
    $root = [IO.Path]::GetFullPath($TestRoot).TrimEnd($separator)
    $target = [IO.Path]::GetFullPath($LiteralPath).TrimEnd($separator)
    if (-not $root.StartsWith($temporaryDirectory, $comparison) -or
        -not ([IO.Path]::GetFileName($root)).StartsWith('tyravex-', $comparison)) {
        throw "Unsafe test root: $root"
    }
    if (-not $target.Equals($root, $comparison) -and
        -not $target.StartsWith($root + $separator, $comparison)) {
        throw "Test cleanup target escapes its root: $target"
    }
    if (Test-Path -LiteralPath $target) {
        Remove-Item -LiteralPath $target -Recurse -Force
    }
}
