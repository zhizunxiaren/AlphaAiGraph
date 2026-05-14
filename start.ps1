param(
    [int]$Port = 5173,
    [string]$HostName = "127.0.0.1",
    [switch]$SkipInstall,
    [switch]$Help
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

if ($Help) {
    Write-Host "Usage:"
    Write-Host "  powershell -ExecutionPolicy Bypass -File .\start.ps1"
    Write-Host "  powershell -ExecutionPolicy Bypass -File .\start.ps1 -Port 5174"
    Write-Host "  powershell -ExecutionPolicy Bypass -File .\start.ps1 -SkipInstall"
    exit 0
}

Set-Location $ProjectRoot

if (-not (Test-Path -LiteralPath "package.json")) {
    throw "package.json was not found in $ProjectRoot"
}

if (-not $SkipInstall -and -not (Test-Path -LiteralPath "node_modules")) {
    Write-Host "node_modules not found. Running npm install..."
    npm install
}

Write-Host "Starting AlphaAiGraph at http://$HostName`:$Port/"
npm run dev -- --host $HostName --port $Port
