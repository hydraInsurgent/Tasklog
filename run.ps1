# run.ps1
# Starts both the backend and frontend for local development.
#
# What it does:
#   1. Starts the .NET backend (dotnet run) on http://localhost:5115
#   2. Starts the Next.js frontend (npm run dev) on http://localhost:3000
#   3. Stops both when you press Ctrl+C
#
# Usage:
#   .\run.ps1

$ErrorActionPreference = "Stop"

$RepoRoot = $PSScriptRoot
$BackendDir = "$RepoRoot\backend\Tasklog.Api"
$FrontendDir = "$RepoRoot\frontend"

# Verify directories exist.
if (-not (Test-Path $BackendDir)) {
    Write-Host "ERROR: Backend not found at $BackendDir" -ForegroundColor Red
    exit 1
}
if (-not (Test-Path $FrontendDir)) {
    Write-Host "ERROR: Frontend not found at $FrontendDir" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Starting Tasklog..." -ForegroundColor Cyan
Write-Host "  Backend:  http://localhost:5115" -ForegroundColor Gray
Write-Host "  Frontend: http://localhost:3000" -ForegroundColor Gray
Write-Host "  Press Ctrl+C to stop both." -ForegroundColor Gray
Write-Host ""

# Start the backend as a background job.
$backendJob = Start-Job -ScriptBlock {
    param($dir)
    Set-Location $dir
    dotnet run 2>&1
} -ArgumentList $BackendDir

# Start the frontend as a background job.
$frontendJob = Start-Job -ScriptBlock {
    param($dir)
    Set-Location $dir
    npm run dev 2>&1
} -ArgumentList $FrontendDir

# Stream output from both jobs until the user presses Ctrl+C.
try {
    while ($true) {
        # Print any new output from both jobs.
        Receive-Job $backendJob -ErrorAction SilentlyContinue | ForEach-Object {
            Write-Host "[backend]  $_" -ForegroundColor Green
        }
        Receive-Job $frontendJob -ErrorAction SilentlyContinue | ForEach-Object {
            Write-Host "[frontend] $_" -ForegroundColor Blue
        }

        # Check if either job has stopped unexpectedly.
        if ($backendJob.State -eq "Failed") {
            Write-Host "Backend stopped unexpectedly." -ForegroundColor Red
            Receive-Job $backendJob -ErrorAction SilentlyContinue
            break
        }
        if ($frontendJob.State -eq "Failed") {
            Write-Host "Frontend stopped unexpectedly." -ForegroundColor Red
            Receive-Job $frontendJob -ErrorAction SilentlyContinue
            break
        }

        Start-Sleep -Milliseconds 500
    }
}
finally {
    # Clean up both jobs on exit.
    Write-Host ""
    Write-Host "Stopping..." -ForegroundColor Yellow
    Stop-Job $backendJob -ErrorAction SilentlyContinue
    Stop-Job $frontendJob -ErrorAction SilentlyContinue
    Remove-Job $backendJob -Force -ErrorAction SilentlyContinue
    Remove-Job $frontendJob -Force -ErrorAction SilentlyContinue
    Write-Host "Stopped." -ForegroundColor Yellow
}
