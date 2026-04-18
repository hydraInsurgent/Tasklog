# deploy-gcp.ps1
# Builds Tasklog locally and deploys the new version to the GCP VM.
#
# What it does:
#   1. Builds the .NET backend for Linux
#   2. Builds the Next.js frontend with the production API URL
#   3. Stops both services on the VM
#   4. Transfers the new files (does not touch the database)
#   5. Fixes the directory structure gcloud scp creates
#   6. Restarts both services
#
# Prerequisites:
#   - gcloud CLI installed and authenticated (gcloud init)
#   - .NET SDK installed
#   - Node.js and npm installed
#
# Usage (from repo root):
#   .\scripts\deploy-gcp.ps1

$ErrorActionPreference = "Stop"

# Ensure gcloud is on the PATH (not added automatically on Windows after install).
$GcloudBin = "C:\Program Files (x86)\Google\Cloud SDK\google-cloud-sdk\bin"
if (Test-Path $GcloudBin) { $env:PATH += ";$GcloudBin" }

$RepoRoot  = "$PSScriptRoot\.."
$Zone      = "us-central1-f"
$VMUser    = "manudubey77"
$VMName    = "tasklog-vm"
$VMTarget  = "/home/$VMUser/tasklog"
$ApiUrl    = "https://tasklog.manudubey.in"

function Write-Step($msg) {
    Write-Host ""
    Write-Host "== $msg ==" -ForegroundColor Cyan
}

function Invoke-VM($command) {
    gcloud compute ssh "${VMUser}@${VMName}" --zone=$Zone --command=$command
    if ($LASTEXITCODE -ne 0) { throw "VM command failed: $command" }
}

Set-Location $RepoRoot

# --- Step 1: Build backend ---

Write-Step "Building backend (linux-x64)"

$BackendOut = "backend/Tasklog.Api/bin/publish/linux-x64"
dotnet publish backend/Tasklog.Api -c Release -r linux-x64 --no-self-contained -o $BackendOut
if ($LASTEXITCODE -ne 0) { throw "Backend build failed" }

# --- Step 2: Build frontend ---

Write-Step "Building frontend"

$env:NEXT_PUBLIC_API_URL = $ApiUrl
npm run build --prefix frontend
if ($LASTEXITCODE -ne 0) { throw "Frontend build failed" }

# --- Step 3: Stop services on VM ---

Write-Step "Stopping services on VM"

Invoke-VM "sudo systemctl stop tasklog-api tasklog-frontend"

# --- Step 4: Transfer files ---
# Does NOT transfer databases - live data is preserved between deploys.

Write-Step "Transferring backend"

gcloud compute scp --recurse $BackendOut "${VMUser}@${VMName}:${VMTarget}/backend" --zone=$Zone
if ($LASTEXITCODE -ne 0) { throw "Backend transfer failed" }

Write-Step "Transferring frontend"

gcloud compute scp --recurse frontend/.next/standalone "${VMUser}@${VMName}:${VMTarget}/frontend" --zone=$Zone
gcloud compute scp --recurse "frontend/.next/standalone/.next" "${VMUser}@${VMName}:${VMTarget}/frontend/" --zone=$Zone
gcloud compute scp --recurse frontend/.next/static "${VMUser}@${VMName}:${VMTarget}/frontend/.next/" --zone=$Zone
gcloud compute scp --recurse frontend/public "${VMUser}@${VMName}:${VMTarget}/frontend/" --zone=$Zone

# --- Step 5: Fix directory structure on VM ---
# gcloud scp copies the named directory itself into the destination (not just its contents).
# Move the files to the right places.

Write-Step "Fixing directory structure on VM"

Invoke-VM @"
set -e

# Backend: move out of linux-x64/ subdirectory
mv ${VMTarget}/backend/linux-x64/* ${VMTarget}/backend/
rm -rf ${VMTarget}/backend/linux-x64

# Frontend: move out of standalone/ subdirectory
# Do not use standalone/* - the glob skips hidden dirs like .next
mv ${VMTarget}/frontend/standalone/server.js ${VMTarget}/frontend/
mv ${VMTarget}/frontend/standalone/package.json ${VMTarget}/frontend/
rm -rf ${VMTarget}/frontend/node_modules
mv ${VMTarget}/frontend/standalone/node_modules ${VMTarget}/frontend/
rm -rf ${VMTarget}/frontend/standalone
"@

# --- Step 6: Restart services ---

Write-Step "Restarting services"

Invoke-VM "sudo systemctl start tasklog-api tasklog-frontend"
Invoke-VM "sudo systemctl status tasklog-api tasklog-frontend --no-pager"

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Deploy complete!" -ForegroundColor Green
Write-Host "  $ApiUrl" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
