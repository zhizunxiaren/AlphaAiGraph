param(
    [int]$Port = 5173,
    [switch]$Force,
    [switch]$Help
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

if ($Help) {
    Write-Host "Usage:"
    Write-Host "  powershell -ExecutionPolicy Bypass -File .\stop.ps1"
    Write-Host "  powershell -ExecutionPolicy Bypass -File .\stop.ps1 -Port 5174"
    Write-Host "  powershell -ExecutionPolicy Bypass -File .\stop.ps1 -Force"
    exit 0
}

Set-Location $ProjectRoot

$connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue

if (-not $connections) {
    Write-Host "No server is listening on port $Port."
    exit 0
}

$processIds = $connections | Select-Object -ExpandProperty OwningProcess -Unique

foreach ($processId in $processIds) {
    $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $processId" -ErrorAction SilentlyContinue
    $commandLine = if ($processInfo) { [string]$processInfo.CommandLine } else { "" }
    $processName = if ($processInfo) { [string]$processInfo.Name } else { "PID $processId" }
    $looksLikeDevServer = $commandLine -match "vite|npm|node_modules|node"

    if (-not $looksLikeDevServer -and -not $Force) {
        Write-Host "Port $Port is owned by $processName ($processId), but it does not look like the AlphaAiGraph dev server."
        Write-Host "Use -Force only if you are sure this process should be stopped."
        continue
    }

    Write-Host "Stopping $processName ($processId) on port $Port..."
    Stop-Process -Id $processId -Force
}

Start-Sleep -Milliseconds 500
$stillListening = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue

if ($stillListening) {
    Write-Host "Port $Port is still in use. Check running processes before retrying."
    exit 1
}

Write-Host "Stopped server on port $Port."
