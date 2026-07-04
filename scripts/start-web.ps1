param(
  [int]$Port = 5173,
  [string]$HostAddress = "127.0.0.1",
  [switch]$NoOpen
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot

function Write-Step {
  param([string]$Message)
  Write-Host "[AlphaAiGraph] $Message" -ForegroundColor Cyan
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js was not found in PATH. Install Node.js before starting the web MVP."
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw "npm was not found in PATH. Install npm before starting the web MVP."
}

if (-not (Test-Path -LiteralPath (Join-Path $projectRoot "package.json"))) {
  throw "package.json was not found. Run this script from the AlphaAiGraph repository."
}

if (-not (Test-Path -LiteralPath (Join-Path $projectRoot "node_modules"))) {
  Write-Step "node_modules not found; running npm install first."
  npm install
}

$url = "http://${HostAddress}:$Port/"
Write-Step "Starting web MVP at $url"

if (-not $NoOpen) {
  Start-Process $url | Out-Null
}

npm run dev -- --host $HostAddress --port $Port
