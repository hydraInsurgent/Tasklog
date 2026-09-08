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
#   7. Restart - kill inner proot guest processes; runit auto-restarts them
#      with fresh code (sv restart does NOT work for proot - see Step 7 notes)
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
MCP_PORT=5180

# Timezone for the .NET backend process. The phone's proot guest runs in UTC
# (TZ unset), but the user is in IST and the frontend computes dates in the
# browser's local zone. The backend's computed dueStatus uses DateTime.Today,
# so the process must share the user's wall-clock day or "today" is wrong near
# midnight. Set this to the deployment's local zone. See learnings if relocating.
SERVER_TZ="Asia/Kolkata"

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
# chown back to host user at end so the next `next build` can unlink old files.

step "Building arm64 node_modules (Docker, QEMU emulation)"

# Wipe the host-arch node_modules that next build wrote into standalone
rm -rf "frontend/.next/standalone/node_modules"

# Next's standalone copies package.json (which may reference vendored tarballs via
# file:./vendor/...), but NOT the vendor/ dir itself - so the in-container npm install
# would fail with ENOENT on those tarballs. Copy any vendored packages into the
# standalone bundle so file: dependencies resolve inside Docker.
if [ -d "frontend/vendor" ]; then
    rm -rf "frontend/.next/standalone/vendor"
    cp -r "frontend/vendor" "frontend/.next/standalone/vendor"
fi

docker run --rm \
    --platform=linux/arm64 \
    -v "${REPO_ROOT}/frontend/.next/standalone:/app" \
    -w /app \
    -e HOST_UID="$(id -u)" \
    -e HOST_GID="$(id -g)" \
    node:20-slim \
    sh -c 'npm install --omit=dev --no-audit --no-fund --no-progress && chown -R "$HOST_UID:$HOST_GID" node_modules'

# --- Step 2.6: Build MCP TypeScript ---
# Needs host-arch devDependencies (typescript). The arm64 production install
# happens separately in Step 2.7. Idempotent: skips if node_modules/.bin/tsc
# already exists.

step "Building MCP server (TypeScript)"

if [ ! -x "mcp/node_modules/.bin/tsc" ]; then
    echo "  installing host devDependencies for tsc"
    npm install --prefix mcp --no-audit --no-fund --no-progress
fi

npm run build --prefix mcp

# --- Step 2.7: Build arm64 node_modules for MCP ---
# Same Docker QEMU pattern as the frontend. better-sqlite3 needs native
# compilation per architecture, so we cannot reuse the laptop's x64 build.
# Uses full node:20 (not slim) because better-sqlite3 has no arm64 prebuilt
# and node-gyp needs Python + make + g++ to compile from source.

step "Building arm64 node_modules for MCP (Docker, QEMU emulation)"

rm -rf "mcp/node_modules"

docker run --rm \
    --platform=linux/arm64 \
    -v "${REPO_ROOT}/mcp:/app" \
    -w /app \
    -e HOST_UID="$(id -u)" \
    -e HOST_GID="$(id -g)" \
    node:20 \
    sh -c 'npm ci --omit=dev --no-audit --no-fund --no-progress && chown -R "$HOST_UID:$HOST_GID" node_modules'

# --- Step 3: Ensure target directory layout on phone ---

step "Preparing target directories on phone"

ssh "$PHONE_HOST" "mkdir -p '${TARGET_PATH}/backend' '${TARGET_PATH}/frontend/.next' '${TARGET_PATH}/frontend/public' '${TARGET_PATH}/mcp/dist' '${TARGET_PATH}/mcp/node_modules'"

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

# --- Step 5.5: Transfer MCP ---
# --delete is scoped to dist/ and node_modules/ - the runtime data/ directory
# (auth.db with OAuth state) lives in the parent mcp/ and is not touched.

step "Transferring MCP (rsync)"

rsync -az --info=progress2 --delete \
    "mcp/dist/" \
    "${PHONE_HOST}:${TARGET_PATH}/mcp/dist/"

rsync -az --info=progress2 --delete \
    "mcp/node_modules/" \
    "${PHONE_HOST}:${TARGET_PATH}/mcp/node_modules/"

rsync -az --info=progress2 \
    "mcp/package.json" \
    "${PHONE_HOST}:${TARGET_PATH}/mcp/"

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
# TZ -> the guest runs in UTC otherwise; the backend's computed dueStatus uses
#       DateTime.Today, so it must match the user's wall-clock day (see SERVER_TZ).
# Ollama__Url -> semantic search (#87/#90): Ollama runs NATIVE in Termux on 11434;
#       proot shares the network namespace, so localhost reaches it. Absent/dead
#       Ollama just degrades search to keyword - never breaks.
exec proot-distro login ubuntu -- bash -c 'cd /root/tasklog/backend && exec env TZ=${SERVER_TZ} Ollama__Url=http://127.0.0.1:11434 DOTNET_gcServer=0 ASPNETCORE_URLS=http://0.0.0.0:${BACKEND_PORT} ASPNETCORE_ENVIRONMENT=Production dotnet Tasklog.Api.dll'
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
# TZ -> Node otherwise runs UTC in proot; Sage's time injection + message
#       timestamps must speak the user's wall clock (#90 - "12:51 AM" at 6:21 IST).
# COMPANION_ENABLED=1 -> the phone web is LAN-only, so its Sage brain is ON
#       (the public OCI VM never gets this var - route stays 404 there, #88 R1).
#       Requires Claude Code installed+logged-in inside proot (claude /login).
exec proot-distro login ubuntu -- bash -c 'cd /root/tasklog/frontend && exec env TZ=${SERVER_TZ} COMPANION_ENABLED=1 PORT=${FRONTEND_PORT} HOSTNAME=0.0.0.0 node server.js'
RUN
chmod +x \$PREFIX/var/service/tasklog-web/run

cat > \$PREFIX/var/service/tasklog-web/log/run <<'RUN'
#!/data/data/com.termux/files/usr/bin/bash
mkdir -p /data/data/com.termux/files/home/log/tasklog-web
exec svlogd -tt /data/data/com.termux/files/home/log/tasklog-web
RUN
chmod +x \$PREFIX/var/service/tasklog-web/log/run

# Service: tasklog-mcp (Node MCP server, runs in proot Ubuntu)
mkdir -p \$PREFIX/var/service/tasklog-mcp/log
cat > \$PREFIX/var/service/tasklog-mcp/run <<'RUN'
#!/data/data/com.termux/files/usr/bin/bash
exec 2>&1
# Sources secrets from /root/.tasklog-mcp.env (inside proot). Create this
# file ONCE before first start:
#   ssh phone -t 'proot-distro login ubuntu'
#   cat > /root/.tasklog-mcp.env <<ENV
#   PORT=5180
#   TASKLOG_API_URL=http://localhost:5115
#   MCP_PUBLIC_URL=https://mcp-tasklog.manudubey.in
#   GITHUB_CLIENT_ID=<from github.com/settings/developers>
#   GITHUB_CLIENT_SECRET=<from github.com/settings/developers>
#   ALLOWED_GH_USERS=hydraInsurgent
#   SESSION_SECRET=<openssl rand -hex 32>
#   NODE_ENV=production
#   ENV
#   chmod 600 /root/.tasklog-mcp.env
exec proot-distro login ubuntu -- bash -c 'set -a; [ -f /root/.tasklog-mcp.env ] && . /root/.tasklog-mcp.env; set +a; cd /root/tasklog/mcp && exec node dist/server.js'
RUN
chmod +x \$PREFIX/var/service/tasklog-mcp/run

cat > \$PREFIX/var/service/tasklog-mcp/log/run <<'RUN'
#!/data/data/com.termux/files/usr/bin/bash
mkdir -p /data/data/com.termux/files/home/log/tasklog-mcp
exec svlogd -tt /data/data/com.termux/files/home/log/tasklog-mcp
RUN
chmod +x \$PREFIX/var/service/tasklog-mcp/log/run

# Service: tasklog-tunnel (cloudflared, runs inside proot Ubuntu)
# We host cloudflared inside proot because newer Go binaries use the
# faccessat2 syscall, which Termux's seccomp filter blocks (SIGSYS).
# Expected to fail on first deploy until cloudflared is installed in proot
# and a tunnel is created. See guides/mcp-server-setup.md for the one-time setup.
mkdir -p \$PREFIX/var/service/tasklog-tunnel/log
cat > \$PREFIX/var/service/tasklog-tunnel/run <<'RUN'
#!/data/data/com.termux/files/usr/bin/bash
exec 2>&1
exec proot-distro login ubuntu -- bash -c 'exec cloudflared tunnel --config /root/.cloudflared/config.yml run tasklog'
RUN
chmod +x \$PREFIX/var/service/tasklog-tunnel/run

cat > \$PREFIX/var/service/tasklog-tunnel/log/run <<'RUN'
#!/data/data/com.termux/files/usr/bin/bash
mkdir -p /data/data/com.termux/files/home/log/tasklog-tunnel
exec svlogd -tt /data/data/com.termux/files/home/log/tasklog-tunnel
RUN
chmod +x \$PREFIX/var/service/tasklog-tunnel/log/run

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
#
# CRITICAL: do NOT use `sv restart` for these services. They run inside
# `proot-distro login ubuntu`, and `sv restart` sends SIGTERM to the proot
# WRAPPER, which does not forward the signal to the guest process (dotnet /
# node / cloudflared). The result is a silent stale deploy: sv reports the
# restart, the port still answers, but it is the OLD code - the new binaries
# were rsynced to disk and never loaded. We hit this on every multi-service
# deploy until we traced it (see docs/learnings/proot-signal-propagation.md).
#
# The reliable approach: kill the INNER guest process by a distinctive
# command-line pattern. proot-distro login runs with --kill-on-exit by
# default, so when the guest's main process dies, proot exits, and runsv
# (which keeps "up" services running) auto-restarts the service from its
# run script - picking up the freshly rsynced code. No `sv` command needed.
#
# Patterns must be mutually exclusive:
#   tasklog-api    -> 'Tasklog.Api.dll'
#   tasklog-mcp    -> 'dist/server.js'   (matches node dist/server.js only)
#   tasklog-web    -> 'next-server'      (Next.js renames its process to
#                                         "next-server (vX.Y.Z)" - it is NOT
#                                         "node server.js", which matched nothing)
#   tasklog-tunnel -> 'cloudflared tunnel'

step "Restarting services (kill inner proot guest -> runit auto-restarts)"

ssh "$PHONE_HOST" bash <<EOF
export SVDIR=${PHONE_SVDIR}

echo "--- killing inner guest processes (runit will auto-restart with new code) ---"
pkill -9 -f 'Tasklog.Api.dll'    && echo "  tasklog-api: inner killed"    || echo "  tasklog-api: no inner process found"
pkill -9 -f 'dist/server.js'     && echo "  tasklog-mcp: inner killed"    || echo "  tasklog-mcp: no inner process found"
pkill -9 -f 'next-server'        && echo "  tasklog-web: inner killed"    || echo "  tasklog-web: no inner process found"
pkill -9 -f 'cloudflared tunnel' && echo "  tasklog-tunnel: inner killed" || echo "  tasklog-tunnel: no inner process found"

echo "--- waiting 40s for proot exit + runit auto-restart + app boot ---"
sleep 40

echo "--- sv status (uptimes should be small = fresh restart) ---"
sv status tasklog-api tasklog-web tasklog-mcp tasklog-tunnel

echo
echo "--- backend log tail ---"
tail -10 /data/data/com.termux/files/home/log/tasklog-api/current 2>/dev/null || echo "  (no log yet)"

echo
echo "--- smoke test (from inside the phone) ---"
curl -sS -o /dev/null -w "  backend  /api/tasks  -> HTTP %{http_code}\n" http://localhost:${BACKEND_PORT}/api/tasks  || echo "  backend curl failed"
curl -sS -o /dev/null -w "  backend  filter 400 check -> HTTP %{http_code} (expect 400)\n" "http://localhost:${BACKEND_PORT}/api/tasks?inbox=true&projectIds=1" || echo "  backend filter curl failed"
curl -sS -o /dev/null -w "  frontend /            -> HTTP %{http_code}\n" http://localhost:${FRONTEND_PORT}/            || echo "  frontend curl failed"
curl -sS -o /dev/null -w "  mcp      /.well-known/oauth-protected-resource -> HTTP %{http_code}\n" http://localhost:${MCP_PORT}/.well-known/oauth-protected-resource || echo "  mcp curl failed (expected if env not configured)"
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
