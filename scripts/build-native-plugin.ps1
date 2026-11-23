[CmdletBinding()]
param([string]$Plugin = 'support-center', [string]$RepositoryRoot = '')

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if ([string]::IsNullOrWhiteSpace($RepositoryRoot)) { $RepositoryRoot = Split-Path $PSScriptRoot -Parent }
if ($Plugin -cne 'support-center') { throw 'Unsupported native plugin.' }
& node (Join-Path $RepositoryRoot 'scripts/native-plugin.cjs') verify
if ($LASTEXITCODE -ne 0) { throw 'Native source verification failed.' }
$sourceRoot = (Resolve-Path -LiteralPath (Join-Path $RepositoryRoot 'integrations/support-center')).Path
$manifest = Get-Content -LiteralPath (Join-Path $sourceRoot 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$dist = Join-Path $RepositoryRoot 'dist'
New-Item -ItemType Directory -Path $dist -Force | Out-Null
$destination = Join-Path $dist ('{0}-{1}-source.zip' -f $manifest.id, $manifest.version)
if (Test-Path -LiteralPath $destination) { throw 'Refusing to overwrite an existing source archive.' }
Add-Type -AssemblyName System.IO.Compression
$stream = [IO.File]::Open($destination, [IO.FileMode]::CreateNew)
$archive = New-Object IO.Compression.ZipArchive($stream, [IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($file in (Get-ChildItem -LiteralPath $sourceRoot -Recurse -File | Sort-Object FullName)) {
        $relative = $file.FullName.Substring($sourceRoot.Length + 1).Replace('\', '/')
        $entry = $archive.CreateEntry($relative, [IO.Compression.CompressionLevel]::Optimal)
        $entry.LastWriteTime = [DateTimeOffset]::new(1980, 1, 1, 0, 0, 0, [TimeSpan]::Zero)
        $inputStream = [IO.File]::OpenRead($file.FullName)
        $outputStream = $entry.Open()
        try { $inputStream.CopyTo($outputStream) } finally { $inputStream.Dispose(); $outputStream.Dispose() }
    }
} finally { $archive.Dispose(); $stream.Dispose() }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archiveCheck = [IO.Compression.ZipFile]::OpenRead($destination)
try {
    foreach ($item in $archiveCheck.Entries) {
        $sourcePath = Join-Path $sourceRoot $item.FullName
        $reader = $item.Open()
        $memory = New-Object IO.MemoryStream
        try {
            $reader.CopyTo($memory)
            $sha = [Security.Cryptography.SHA256]::Create()
            try { $entryHash = [BitConverter]::ToString($sha.ComputeHash($memory.ToArray())).Replace('-', '').ToLowerInvariant() } finally { $sha.Dispose() }
        } finally { $reader.Dispose(); $memory.Dispose() }
        if ($entryHash -ne (Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash.ToLowerInvariant()) { throw "Archive integrity mismatch: $($item.FullName)" }
    }
} finally { $archiveCheck.Dispose() }
$hash = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText($destination + '.sha256', $hash + [Environment]::NewLine)
Write-Host "Source archive: $destination"
Write-Host "SHA-256: $hash"
Write-Host 'This is a reviewed source package, not a Marketplace ZIP installer.'
