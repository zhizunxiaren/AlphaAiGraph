param(
    [int]$Port = 5173,
    [string]$HostName = "127.0.0.1",
    [switch]$SkipInstall,
    [switch]$Foreground,
    [switch]$Help
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$TmpDir = Join-Path $ProjectRoot ".tmp"
$PidFile = Join-Path $TmpDir "alphaaigraph-vite-$Port.pid"
$OutLog = Join-Path $TmpDir "alphaaigraph-vite-$Port.out.log"
$ErrLog = Join-Path $TmpDir "alphaaigraph-vite-$Port.err.log"

if ($Help) {
    Write-Host "Usage:"
    Write-Host "  powershell -ExecutionPolicy Bypass -File .\start.ps1"
    Write-Host "  powershell -ExecutionPolicy Bypass -File .\start.ps1 -Port 5174"
    Write-Host "  powershell -ExecutionPolicy Bypass -File .\start.ps1 -SkipInstall"
    Write-Host "  powershell -ExecutionPolicy Bypass -File .\start.ps1 -Foreground"
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

$existing = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($existing) {
    Write-Host "AlphaAiGraph may already be running at http://$HostName`:$Port/ (PID $($existing.OwningProcess))."
    exit 0
}

New-Item -ItemType Directory -Force -Path $TmpDir | Out-Null

if ($Foreground) {
    Write-Host "Starting AlphaAiGraph in foreground at http://$HostName`:$Port/"
    npm run dev -- --host $HostName --port $Port
    exit $LASTEXITCODE
}

Write-Host "Starting AlphaAiGraph in background at http://$HostName`:$Port/"
$process = Start-Process `
    -FilePath "npm.cmd" `
    -ArgumentList @("run", "dev", "--", "--host", $HostName, "--port", "$Port") `
    -WorkingDirectory $ProjectRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $OutLog `
    -RedirectStandardError $ErrLog `
    -PassThru

Set-Content -LiteralPath $PidFile -Value $process.Id

$deadline = (Get-Date).AddSeconds(20)
do {
    Start-Sleep -Milliseconds 500
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri "http://$HostName`:$Port/" -TimeoutSec 2
        if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
            Write-Host "Started. URL: http://$HostName`:$Port/"
            Write-Host "PID: $($process.Id)"
            Write-Host "Logs:"
            Write-Host "  $OutLog"
            Write-Host "  $ErrLog"
            exit 0
        }
    } catch {
        if ($process.HasExited) {
            Write-Host "AlphaAiGraph failed to start. Check logs:"
            Write-Host "  $OutLog"
            Write-Host "  $ErrLog"
            exit 1
        }
    }
} while ((Get-Date) -lt $deadline)

Write-Host "Start command was launched, but the server did not respond within 20 seconds."
Write-Host "PID: $($process.Id)"
Write-Host "Logs:"
Write-Host "  $OutLog"
Write-Host "  $ErrLog"
exit 1
