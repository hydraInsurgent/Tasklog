#!/usr/bin/env bash
# deploy-oci.sh — Deploy Tasklog to the OCI production server.
#
# Builds locally (linux-x64, x86), transfers to the VM, swaps in the new build,
# and restarts the systemd services. The live database is preserved (never
# overwritten). Rollback copies are kept as backend-old / frontend-old on the VM.
#
# Prereqs: dotnet SDK, node/npm locally; SSH key at $OCI_KEY.
# Usage (from repo root):  ./scripts/deploy-oci.sh
#
# Override host/key via env if the server changes:
#   OCI_HOST=ubuntu@1.2.3.4 OCI_KEY=~/.ssh/oci_prod ./scripts/deploy-oci.sh

set -euo pipefail

KEY="${OCI_KEY:-$HOME/.ssh/oci_prod}"
HOST="${OCI_HOST:-ubuntu@140.245.203.70}"
API_URL="${TASKLOG_API_URL:-https://tasklog.manudubey.in}"
T="/home/ubuntu/tasklog"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

step(){ printf "\n\033[36m== %s ==\033[0m\n" "$1"; }

step "Build backend (linux-x64)"
dotnet publish backend/Tasklog.Api -c Release -r linux-x64 --no-self-contained \
  -o backend/Tasklog.Api/bin/publish/linux-x64

step "Build frontend (API_URL=$API_URL)"
NEXT_PUBLIC_API_URL="$API_URL" npm run build --prefix frontend

step "Stop services on VM"
ssh -i "$KEY" -o StrictHostKeyChecking=accept-new "$HOST" "sudo systemctl stop tasklog-api tasklog-frontend"

step "Stage backend"
ssh -i "$KEY" "$HOST" "rm -rf $T/backend-new && mkdir -p $T/backend-new"
scp -i "$KEY" -q -r backend/Tasklog.Api/bin/publish/linux-x64/. "$HOST:$T/backend-new/"

step "Stage frontend"
ssh -i "$KEY" "$HOST" "rm -rf $T/frontend-new && mkdir -p $T/frontend-new"
scp -i "$KEY" -q -r frontend/.next/standalone/.       "$HOST:$T/frontend-new/"
scp -i "$KEY" -q -r frontend/.next/standalone/.next   "$HOST:$T/frontend-new/"
scp -i "$KEY" -q -r frontend/.next/static             "$HOST:$T/frontend-new/.next/"
scp -i "$KEY" -q -r frontend/public                   "$HOST:$T/frontend-new/"

step "Swap in new build + restart (DB preserved)"
ssh -i "$KEY" "$HOST" 'bash -s' <<'REMOTE'
set -e
T=/home/ubuntu/tasklog
# preserve the live database into the new backend before swapping
cp -f "$T/backend/TasklogDatabase.db" "$T/backend-new/TasklogDatabase.db" 2>/dev/null || true
rm -rf "$T/backend-old"  && mv "$T/backend"  "$T/backend-old"  && mv "$T/backend-new"  "$T/backend"
rm -rf "$T/frontend-old" && mv "$T/frontend" "$T/frontend-old" && mv "$T/frontend-new" "$T/frontend"
sudo systemctl start tasklog-api tasklog-frontend
sleep 6
echo -n "api: "; systemctl is-active tasklog-api
echo -n "frontend: "; systemctl is-active tasklog-frontend
REMOTE

step "Verify"
curl -s -o /dev/null -w "https://tasklog.manudubey.in -> %{http_code}\n" https://tasklog.manudubey.in/
echo "Deploy complete."
