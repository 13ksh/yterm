$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Find-Node {
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $guesses = @(
    "$env:ProgramFiles\nodejs\node.exe",
    "${env:ProgramFiles(x86)}\nodejs\node.exe",
    "$env:LOCALAPPDATA\Programs\node\node.exe"
  )
  foreach ($p in $guesses) {
    if (Test-Path $p) { return $p }
  }
  return $null
}

$node = Find-Node
if (-not $node) {
  Write-Host "Node.js 20+ is required: https://nodejs.org"
  exit 1
}

$dest = Join-Path $env:LOCALAPPDATA "yterm"
$zip = Join-Path $env:TEMP "yterm-src.zip"
$stage = Join-Path $env:TEMP "yterm-src"
$url = "https://codeload.github.com/13ksh/yterm/zip/refs/heads/main"

Write-Host "[1/4] Download"
Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $zip

if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
New-Item -ItemType Directory -Path $stage | Out-Null
Expand-Archive -Force -Path $zip -DestinationPath $stage

$src = Get-ChildItem -Directory $stage | Select-Object -First 1
if (-not $src) { throw "zip layout unexpected" }

if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
New-Item -ItemType Directory -Path $dest | Out-Null
Copy-Item -Path (Join-Path $src.FullName "*") -Destination $dest -Recurse -Force

Write-Host "[2/4] npm install"
$npmCmd = Join-Path (Split-Path $node) "npm.cmd"
if (-not (Test-Path $npmCmd)) { $npmCmd = "npm" }
Push-Location $dest
try {
  & $npmCmd install
  if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
} finally {
  Pop-Location
}

Write-Host "[3/4] launcher"
try {
  reg add HKCU\Console /v VirtualTerminalLevel /t REG_DWORD /d 1 /f | Out-Null
} catch { }
$shim = Join-Path $dest "yterm.cmd"
@"
@echo off
chcp 65001 >nul
reg add HKCU\Console /v VirtualTerminalLevel /t REG_DWORD /d 1 /f >nul 2>&1
"$node" "$dest\bin\yterm.js" %*
"@ | Set-Content -Path $shim -Encoding Ascii

Copy-Item $shim (Join-Path $env:USERPROFILE "yterm.cmd") -Force
$apps = Join-Path $env:LOCALAPPDATA "Microsoft\WindowsApps\yterm.cmd"
try { Copy-Item $shim $apps -Force } catch { }

Write-Host "[4/4] ffmpeg"
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
  Write-Host "ffmpeg missing. Run: winget install Gyan.FFmpeg"
}

Write-Host ""
Write-Host "OK. Close CMD, open a NEW CMD, then:"
Write-Host "  yterm --demo"
Write-Host "Or:"
Write-Host "  $shim --demo"
