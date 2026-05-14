param(
    [int]$Port = 5173,
    [string]$HostName = "127.0.0.1",
    [switch]$SkipInstall,
    [switch]$Force,
    [switch]$Help
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

if ($Help) {
    Write-Host "Usage:"
    Write-Host "  powershell -ExecutionPolicy Bypass -File .\restart.ps1"
    Write-Host "  powershell -ExecutionPolicy Bypass -File .\restart.ps1 -Port 5174"
    Write-Host "  powershell -ExecutionPolicy Bypass -File .\restart.ps1 -SkipInstall"
    Write-Host "  powershell -ExecutionPolicy Bypass -File .\restart.ps1 -Force"
    exit 0
}

Set-Location $ProjectRoot

$stopArgs = @("-ExecutionPolicy", "Bypass", "-File", ".\stop.ps1", "-Port", "$Port")
if ($Force) {
    $stopArgs += "-Force"
}

powershell @stopArgs

$startArgs = @("-ExecutionPolicy", "Bypass", "-File", ".\start.ps1", "-HostName", $HostName, "-Port", "$Port")
if ($SkipInstall) {
    $startArgs += "-SkipInstall"
}

powershell @startArgs
