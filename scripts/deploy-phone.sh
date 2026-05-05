#!/bin/bash
# deploy-phone.sh
# Deploy Tasklog to a phone home-server (Termux + proot Ubuntu, arm64).
#
# What it does:
#   1. Preflight checks (laptop and phone state) so failures surface early
#   2. Cross-compile .NET backend for linux-arm64 on the laptop
#   3. Build Next.js standalone frontend on the laptop (no NEXT_PUBLIC_API_URL baked in)
#   4. Build arm64 node_modules in a Docker container on the laptop (QEMU emulation)
#   5. rsync artifacts to the phone over SSH (services keep running on old files)
#   6. Setup runit services on phone (idempotent) and ensure runsvdir supervisor is running
#   7. sv restart - kills old services, starts new ones with fresh code
#
# Why Docker for node_modules:
#   proot's syscall translation breaks npm's atomic cache rename intermittently
#   ('rename: ENOENT' on _cacache moves). Building inside a linux/arm64 container
#   on the laptop produces correct arm64 binaries without ever running npm in proot.
#
# Why runit (termux-services) for service supervision:
#   tmux running inside proot dies when proot exits (--kill-on-exit).
#   tmux running in Termux works but is one tool used for one feature.
#   runit is a real service supervisor: auto-restart on crash, standard `sv` commands,
#   real logs in $HOME/log/<service>/, easy to add future services.
#
# Prerequisites:
#   - SSH alias "phone" pointing at Termux sshd
#   - In Termux: rsync, termux-services (rsync's remote side runs IN Termux, not proot)
#   - Inside proot Ubuntu: dotnet ASP.NET Core 10 runtime, node 20+
#     (see guides/phone-server-setup.md)
#   - On laptop: .NET SDK with linux-arm64 target, Docker (user in 'docker' group),
#     qemu-user-static + binfmt-support for arm64 emulation
#
# Usage (from repo root):
#   ./scripts/deploy-phone.sh

set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# --- Config ---

PHONE_HOST="phone"

# proot-distro stores Ubuntu's rootfs at this path inside Termux. Writing to it
# from outside proot drops files directly into the proot namespace (no bind mount
# needed). See docs/learnings/proot-on-android.md.
PROOT_ROOTFS="/data/data/com.termux/files/usr/var/lib/proot-distro/installed-rootfs/ubuntu"
DEPLOY_DIR="/root/tasklog"
TARGET_PATH="${PROOT_ROOTFS}${DEPLOY_DIR}"

BACKEND_OUT="backend/Tasklog.Api/bin/publish/linux-arm64"

# Bind addresses are 0.0.0.0 so the services accept connections on any interface
# the phone has. See docs/learnings/network-bind-addresses.md.
BACKEND_PORT=5115
FRONTEND_PORT=3000

# runit service definitions live in Termux's $PREFIX/var/service/.
# SVDIR has to point here for `sv` commands to find them.
PHONE_SVDIR='$PREFIX/var/service'

# --- Helpers ---

step() {
    echo
    echo -e "\033[36m== $1 ==\033[0m"
}

fail() {
    echo
    echo -e "\033[31mERROR: $1\033[0m" >&2
    exit 1
}

cd "$REPO_ROOT"

# --- Step 0: Preflight checks ---

step "Preflight checks"

command -v dotnet >/dev/null || fail "dotnet not found on laptop. Install .NET SDK."
echo "  laptop: dotnet $(dotnet --version)"

command -v npm >/dev/null || fail "npm not found on laptop."
echo "  laptop: npm $(npm --version)"

command -v docker >/dev/null || fail "docker not found on laptop. See guides/phone-server-setup.md for install commands."
docker info >/dev/null 2>&1 || fail "docker daemon not reachable. Are you in the 'docker' group? Try: newgrp docker"
echo "  laptop: docker $(docker --version | awk '{print $3}' | tr -d ,)"

ssh -o BatchMode=yes -o ConnectTimeout=3 "$PHONE_HOST" 'echo ok' >/dev/null 2>&1 \
    || fail "Cannot SSH to '$PHONE_HOST'. Is the phone awake and on the LAN?"
echo "  ssh: $PHONE_HOST reachable"

ssh "$PHONE_HOST" 'command -v rsync >/dev/null && command -v sv >/dev/null && command -v runsvdir >/dev/null' \
    || fail "Termux missing tools. Need: rsync, sv, runsvdir. Run: ssh $PHONE_HOST 'pkg install -y rsync termux-services'"
echo "  termux: rsync, sv, runsvdir ok"

ssh "$PHONE_HOST" 'proot-distro login ubuntu -- bash -c "command -v dotnet && command -v node"' >/dev/null 2>&1 \
    || fail "Missing tools in proot Ubuntu. Need dotnet runtime + node. See guides/phone-server-setup.md."
echo "  proot: dotnet, node ok"

echo
echo "Ready to deploy."

# --- Step 1: Cross-compile backend for arm64 ---

step "Building backend (linux-arm64)"

dotnet publish backend/Tasklog.Api \
    -c Release \
    -r linux-arm64 \
    --no-self-contained \
    -o "$BACKEND_OUT"

# --- Step 2: Build frontend ---

step "Building frontend"

npm run build --prefix frontend

# --- Step 2.5: Build arm64 node_modules in a Docker container ---
# QEMU emulation runs an arm64 node:20 image on the x86 laptop. npm install
# inside that container produces correct arm64 binaries (sharp, @next/swc, etc.).
# We mount the standalone bundle directly so node_modules ends up in place.
# First run downloads node:20-slim (~50 MB). Subsequent runs use the local cache.

step "Building arm64 node_modules (Docker, QEMU emulation)"

# Wipe the host-arch node_modules that next build wrote into standalone
rm -rf "frontend/.next/standalone/node_modules"

docker run --rm \
    --platform=linux/arm64 \
    -v "${REPO_ROOT}/frontend/.next/standalone:/app" \
    -w /app \
    node:20-slim \
    sh -c 'npm install --omit=dev --no-audit --no-fund --no-progress'

# --- Step 3: Ensure target directory layout on phone ---

step "Preparing target directories on phone"

ssh "$PHONE_HOST" "mkdir -p '${TARGET_PATH}/backend' '${TARGET_PATH}/frontend/.next' '${TARGET_PATH}/frontend/public'"

# --- Step 4: Transfer backend ---
# Services keep running on the old files during the rsync (Linux replaces inodes
# atomically; running processes hold the old fd). Restart in step 7 picks up new code.

step "Transferring backend (rsync)"

rsync -az --info=progress2 --delete \
    --exclude 'TasklogDatabase.db' \
    --exclude '*.db-journal' \
    --exclude '*.db-wal' \
    --exclude '*.db-shm' \
    "${BACKEND_OUT}/" \
    "${PHONE_HOST}:${TARGET_PATH}/backend/"

# --- Step 5: Transfer frontend ---

step "Transferring frontend (rsync)"

# node_modules is now arm64 (built by Docker step), so we ship it.
rsync -az --info=progress2 --delete \
    "frontend/.next/standalone/" \
    "${PHONE_HOST}:${TARGET_PATH}/frontend/"

rsync -az --info=progress2 --delete \
    "frontend/.next/static/" \
    "${PHONE_HOST}:${TARGET_PATH}/frontend/.next/static/"

rsync -az --info=progress2 --delete \
    "frontend/public/" \
    "${PHONE_HOST}:${TARGET_PATH}/frontend/public/"

# --- Step 6: Setup runit services on phone (idempotent) ---
# Writes the run + log/run scripts every deploy. Cheap, ensures any tweaks
# to env vars or commands here become the source of truth.
# runsvdir scans the service dir continuously; new dirs auto-pickup.

step "Setting up runit services on phone"

ssh "$PHONE_HOST" bash <<EOF
set -e

# Service: tasklog-api (the .NET backend)
mkdir -p \$PREFIX/var/service/tasklog-api/log
cat > \$PREFIX/var/service/tasklog-api/run <<'RUN'
#!/data/data/com.termux/files/usr/bin/bash
exec 2>&1
# DOTNET_gcServer=0 -> workstation GC (server GC tries to reserve 256 GiB, fails in proot)
# ASPNETCORE_URLS -> bind on every interface (LAN-friendly, see learnings/network-bind-addresses.md)
exec proot-distro login ubuntu -- bash -c 'cd /root/tasklog/backend && exec env DOTNET_gcServer=0 ASPNETCORE_URLS=http://0.0.0.0:${BACKEND_PORT} ASPNETCORE_ENVIRONMENT=Production dotnet Tasklog.Api.dll'
RUN
chmod +x \$PREFIX/var/service/tasklog-api/run

cat > \$PREFIX/var/service/tasklog-api/log/run <<'RUN'
#!/data/data/com.termux/files/usr/bin/bash
mkdir -p /data/data/com.termux/files/home/log/tasklog-api
exec svlogd -tt /data/data/com.termux/files/home/log/tasklog-api
RUN
chmod +x \$PREFIX/var/service/tasklog-api/log/run

# Service: tasklog-web (the Next.js frontend)
mkdir -p \$PREFIX/var/service/tasklog-web/log
cat > \$PREFIX/var/service/tasklog-web/run <<'RUN'
#!/data/data/com.termux/files/usr/bin/bash
exec 2>&1
exec proot-distro login ubuntu -- bash -c 'cd /root/tasklog/frontend && exec env PORT=${FRONTEND_PORT} HOSTNAME=0.0.0.0 node server.js'
RUN
chmod +x \$PREFIX/var/service/tasklog-web/run

cat > \$PREFIX/var/service/tasklog-web/log/run <<'RUN'
#!/data/data/com.termux/files/usr/bin/bash
mkdir -p /data/data/com.termux/files/home/log/tasklog-web
exec svlogd -tt /data/data/com.termux/files/home/log/tasklog-web
RUN
chmod +x \$PREFIX/var/service/tasklog-web/log/run

# Start runsvdir (the supervisor) if not already running.
# Single instance only - second runsvdir would chaos the supervise dir.
if ! pgrep -x runsvdir >/dev/null 2>&1; then
    echo "  starting runsvdir"
    nohup runsvdir -P \$PREFIX/var/service >/dev/null 2>&1 &
    sleep 3
else
    echo "  runsvdir already running"
fi
EOF

# --- Step 7: Restart services ---
# sv restart sends TERM, waits for clean exit, then starts the new run script.
# Service is briefly down during the restart (~30s for proot login + dotnet boot).

step "Restarting services (sv restart)"

ssh "$PHONE_HOST" bash <<EOF
export SVDIR=${PHONE_SVDIR}
sv restart tasklog-api tasklog-web

echo "--- waiting 35s for services to come up ---"
sleep 35

echo "--- sv status ---"
sv status tasklog-api tasklog-web

echo
echo "--- backend log tail ---"
tail -10 /data/data/com.termux/files/home/log/tasklog-api/current 2>/dev/null || echo "  (no log yet)"

echo
echo "--- smoke test (from inside the phone) ---"
curl -sS -o /dev/null -w "  backend  /api/tasks  -> HTTP %{http_code}\n" http://localhost:${BACKEND_PORT}/api/tasks  || echo "  backend curl failed"
curl -sS -o /dev/null -w "  frontend /            -> HTTP %{http_code}\n" http://localhost:${FRONTEND_PORT}/            || echo "  frontend curl failed"
EOF

# --- Done ---

echo
echo -e "\033[32m========================================\033[0m"
echo -e "\033[32m  Deploy complete!\033[0m"
echo -e "\033[32m  Open from any LAN device:\033[0m"
echo -e "\033[32m  http://192.168.1.51:${FRONTEND_PORT}\033[0m"
echo -e "\033[32m========================================\033[0m"
echo
echo "Inspect:"
echo "  ssh ${PHONE_HOST} 'SVDIR=\$PREFIX/var/service sv status tasklog-api tasklog-web'"
echo "  ssh ${PHONE_HOST} 'tail -f \$HOME/log/tasklog-api/current'"
echo "  ssh ${PHONE_HOST} 'tail -f \$HOME/log/tasklog-web/current'"
echo
echo "Manual control:"
echo "  ssh ${PHONE_HOST} 'SVDIR=\$PREFIX/var/service sv {up,down,restart} tasklog-api'"
