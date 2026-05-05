#!/bin/bash
# deploy-gcp.sh
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
#   ./scripts/deploy-gcp.sh

set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ZONE="us-central1-f"
VM_USER="manudubey77"
VM_NAME="tasklog-vm"
VM_TARGET="/home/${VM_USER}/tasklog"
API_URL="https://tasklog.manudubey.in"

step() {
    echo ""
    echo -e "\033[36m== $1 ==\033[0m"
}

invoke_vm() {
    gcloud compute ssh "${VM_USER}@${VM_NAME}" --zone="$ZONE" --command="$1"
}

cd "$REPO_ROOT"

# --- Step 1: Build backend ---

step "Building backend (linux-x64)"

BACKEND_OUT="backend/Tasklog.Api/bin/publish/linux-x64"
dotnet publish backend/Tasklog.Api -c Release -r linux-x64 --no-self-contained -o "$BACKEND_OUT"

# --- Step 2: Build frontend ---

step "Building frontend"

NEXT_PUBLIC_API_URL="$API_URL" npm run build --prefix frontend

# --- Step 3: Stop services on VM ---

step "Stopping services on VM"

invoke_vm "sudo systemctl stop tasklog-api tasklog-frontend"

# --- Step 4: Transfer files ---
# Does NOT transfer databases - live data is preserved between deploys.

step "Transferring backend"

gcloud compute scp --recurse "$BACKEND_OUT" "${VM_USER}@${VM_NAME}:${VM_TARGET}/backend" --zone="$ZONE"

step "Transferring frontend"

gcloud compute scp --recurse frontend/.next/standalone "${VM_USER}@${VM_NAME}:${VM_TARGET}/frontend" --zone="$ZONE"
gcloud compute scp --recurse "frontend/.next/standalone/.next" "${VM_USER}@${VM_NAME}:${VM_TARGET}/frontend/" --zone="$ZONE"
gcloud compute scp --recurse frontend/.next/static "${VM_USER}@${VM_NAME}:${VM_TARGET}/frontend/.next/" --zone="$ZONE"
gcloud compute scp --recurse frontend/public "${VM_USER}@${VM_NAME}:${VM_TARGET}/frontend/" --zone="$ZONE"

# --- Step 5: Fix directory structure on VM ---
# gcloud scp copies the named directory itself into the destination (not just its contents).
# Move the files to the right places.

step "Fixing directory structure on VM"

invoke_vm "set -e

# Backend: move out of linux-x64/ subdirectory
mv ${VM_TARGET}/backend/linux-x64/* ${VM_TARGET}/backend/
rm -rf ${VM_TARGET}/backend/linux-x64

# Frontend: move out of standalone/ subdirectory
# Do not use standalone/* - the glob skips hidden dirs like .next
mv ${VM_TARGET}/frontend/standalone/server.js ${VM_TARGET}/frontend/
mv ${VM_TARGET}/frontend/standalone/package.json ${VM_TARGET}/frontend/
rm -rf ${VM_TARGET}/frontend/node_modules
mv ${VM_TARGET}/frontend/standalone/node_modules ${VM_TARGET}/frontend/
rm -rf ${VM_TARGET}/frontend/standalone"

# --- Step 6: Restart services ---

step "Restarting services"

invoke_vm "sudo systemctl start tasklog-api tasklog-frontend"
invoke_vm "sudo systemctl status tasklog-api tasklog-frontend --no-pager"

echo ""
echo -e "\033[32m========================================\033[0m"
echo -e "\033[32m  Deploy complete!\033[0m"
echo -e "\033[32m  $API_URL\033[0m"
echo -e "\033[32m========================================\033[0m"
