param(
    [int]$Port = 5173,
    [switch]$Force,
    [switch]$Help
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$TmpDir = Join-Path $ProjectRoot ".tmp"
$PidFile = Join-Path $TmpDir "alphaaigraph-vite-$Port.pid"

if ($Help) {
    Write-Host "Usage:"
    Write-Host "  powershell -ExecutionPolicy Bypass -File .\stop.ps1"
    Write-Host "  powershell -ExecutionPolicy Bypass -File .\stop.ps1 -Port 5174"
    Write-Host "  powershell -ExecutionPolicy Bypass -File .\stop.ps1 -Force"
    exit 0
}

Set-Location $ProjectRoot

$candidateProcessIds = New-Object System.Collections.Generic.List[int]

if (Test-Path -LiteralPath $PidFile) {
    $pidText = (Get-Content -LiteralPath $PidFile -Raw).Trim()
    if ($pidText -match "^\d+$") {
        $candidateProcessIds.Add([int]$pidText)
    }
}

$connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
foreach ($connection in $connections) {
    if (-not $candidateProcessIds.Contains([int]$connection.OwningProcess)) {
        $candidateProcessIds.Add([int]$connection.OwningProcess)
    }
}

if ($candidateProcessIds.Count -eq 0) {
    Write-Host "No AlphaAiGraph dev server was found on port $Port."
    exit 0
}

$stoppedAny = $false

foreach ($processId in $candidateProcessIds) {
    $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $processId" -ErrorAction SilentlyContinue
    if (-not $processInfo) {
        continue
    }

    $commandLine = [string]$processInfo.CommandLine
    $processName = [string]$processInfo.Name
    $isProjectDevServer =
        $commandLine -like "*$ProjectRoot*" -or
        $commandLine -match "alpha-ai-graph|alphaaigraph|vite|node_modules"

    if (-not $isProjectDevServer -and -not $Force) {
        Write-Host "PID $processId ($processName) does not look like the AlphaAiGraph dev server."
        Write-Host "Use -Force only if you are sure this process should be stopped."
        continue
    }

    Write-Host "Stopping $processName ($processId)..."
    Stop-Process -Id $processId -Force
    $stoppedAny = $true
}

if (Test-Path -LiteralPath $PidFile) {
    Set-Content -LiteralPath $PidFile -Value ""
}

Start-Sleep -Milliseconds 700
$stillListening = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue

if ($stillListening) {
    Write-Host "Port $Port is still in use. Check running processes before retrying."
    exit 1
}

if ($stoppedAny) {
    Write-Host "Stopped AlphaAiGraph dev server on port $Port."
} else {
    Write-Host "No matching AlphaAiGraph dev server was stopped."
}
