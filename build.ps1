$ErrorActionPreference = 'Stop'
$projectDir = $PSScriptRoot
$extensionDir = Join-Path $projectDir 'extension'
$distDir = Join-Path $projectDir 'dist'
New-Item -ItemType Directory -Force -Path $distDir | Out-Null
$zipPath = Join-Path $distDir 'neu-webvpn-converter.zip'
Compress-Archive -Path (Join-Path $extensionDir '*') -DestinationPath $zipPath -Force
Write-Output $zipPath
