# Phone Server Setup

How to turn an Android phone (Termux + proot Ubuntu) into a 24/7 home server running Tasklog on the LAN.
Reference for future setups and similar projects.

**Last updated:** 2026-05-05 - first working deploy with runit-based service supervision.

> **Status:** working setup documented. Some sections are still being filled as we use it day-to-day.
> Sister guide: [phone-deploying-updates.md](phone-deploying-updates.md).

---

## How this all fits together

When you visit `http://192.168.1.51:3000` from a laptop on the same wifi, here is what actually happens:

```
Laptop browser                                     Phone (Realme, Android)
      |                                            +-------------------------------------------+
      | HTTP                                       |  Termux (Android app)                     |
      | request                                    |   |- sshd                (SSH access)    |
      v                                            |   |- wake-lock           (no Android kill)|
http://192.168.1.51:3000  --- LAN wifi --->        |   |- runsvdir            (runit superv.)  |
http://192.168.1.51:5115                           |   |     |                                 |
                                                   |   |     |-- service: tasklog-api          |
                                                   |   |     |    -> proot-distro login -> ... |
                                                   |   |     |       dotnet Tasklog.Api.dll    |
                                                   |   |     |         (binds 0.0.0.0:5115)    |
                                                   |   |     |                                 |
                                                   |   |     `-- service: tasklog-web          |
                                                   |   |          -> proot-distro login -> ... |
                                                   |   |             node server.js            |
                                                   |   |               (binds 0.0.0.0:3000)    |
                                                   |   v                                       |
                                                   |  proot-distro Ubuntu rootfs               |
                                                   |   `- SQLite file: TasklogDatabase.db      |
                                                   +-------------------------------------------+
```

- **Termux** is an Android app that gives you a Linux-like userspace on the phone without root.
- **proot-distro** runs an Ubuntu rootfs inside Termux without root, by intercepting syscalls. See [learnings/proot-on-android.md](../docs/learnings/proot-on-android.md) for the full theory.
- **runit** (via the `termux-services` package) supervises the backend and frontend processes in Termux. It's the closest equivalent to systemd you can have here, since proot has no init system. Standard `sv up/down/restart/status` commands. Auto-restarts crashed services. Logs to `~/log/<service>/current` via `svlogd`.
- **Why runit lives in Termux, not proot:** proot's `--kill-on-exit` flag means anything launched inside a proot session dies when that session ends. So we run runit in Termux (long-lived), and each `run` script does `proot-distro login ubuntu -- <service command>`. The supervisor outlives any individual proot login.
- **wake-lock + Termux:Boot + battery-optimization-off** are the three Android-specific knobs that keep this running 24/7. Skip any one and the phone will kill it.
- **No reverse proxy** in this setup - both ports are exposed directly on the LAN. That's fine LAN-only. When/if we expose this to the internet, we add Caddy or similar (see Stage 5 placeholder near the bottom of this guide).

The chain is `SSH -> Termux -> runit -> proot -> service`. The only layer with real overhead is proot (~10-15% on syscall-heavy work, invisible for a personal REST API).

---

## Prerequisites checklist

Things to do on the phone **before** anything in this guide. These are mostly Android UI steps that can't be automated over SSH.

- [x] **Termux** installed (from F-Droid, **not** Play Store - the Play Store version is unmaintained).
- [x] **Termux:Boot** installed (also from F-Droid). Required to auto-start on phone reboot.
- [x] **Battery optimization disabled** for Termux. Settings > Apps > Termux > Battery > Don't optimize. Without this, Android kills Termux within hours.
- [x] **Static IP reserved** for the phone on the home router (DHCP reservation by MAC). Multi-band devices may get separate IPs per band - reserve all the MACs you care about.
- [x] **SSH key** added to `~/.ssh/authorized_keys` in Termux, and `~/.ssh/config` alias on the laptop pointing at the phone.

---

## Part 1: Termux side (sshd, wake-lock, boot script)

The minimal Termux-side setup needed before we touch proot.

### One-time install

```bash
# In Termux on the phone
pkg update
pkg install openssh termux-api termux-services rsync
```

- `openssh` provides `sshd`.
- `termux-api` is required for `termux-wake-lock`.
- `termux-services` is the runit-based service manager. Provides `sv`, `sv-enable`, `runsvdir`. Required - this is what keeps tasklog-api and tasklog-web alive.
- `rsync` is required **in Termux** (not just proot) because rsync's remote side runs in Termux when the laptop pushes files over SSH.

### SSH key setup

```bash
# In Termux
mkdir -p ~/.ssh
echo "<paste laptop public key here>" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

Set a port if you want (default sshd port in Termux is 8022) by editing `$PREFIX/etc/ssh/sshd_config`.

### Boot script (consolidated)

Termux:Boot runs every script in `~/.termux/boot/` once at phone power-on. Use the helper script in this repo to install the canonical version:

```bash
# From the laptop, repo root
./scripts/setup-phone-boot.sh
```

That writes `~/.termux/boot/start-tasklog-server.sh` on the phone and removes any old `start.sh` / `start-server.sh` duplicates. The final script is short:

```bash
#!/data/data/com.termux/files/usr/bin/bash
termux-wake-lock                                        # 1. keep Android from killing us
sshd                                                    # 2. start SSH server (laptop deploys)
if ! pgrep -x runsvdir >/dev/null 2>&1; then           # 3. start runit supervisor
    nohup runsvdir -P $PREFIX/var/service >/dev/null 2>&1 &
fi
```

Why this is enough: `runsvdir` watches `$PREFIX/var/service/` continuously. When `scripts/deploy-phone.sh` (or your future deploys) creates `tasklog-api/` and `tasklog-web/` service dirs there, runsvdir picks them up automatically and starts them. No need to enumerate services in the boot script - adding a third service just means another deploy creating another service dir.

To test without rebooting the phone:

```bash
ssh phone -t 'bash ~/.termux/boot/start-tasklog-server.sh'
```

### Wi-Fi keepalive (LAN reachability workaround)

Some Android ROMs (notably Realme / ColorOS) hide the legacy "Keep Wi-Fi on during sleep" toggle. Without it, the phone's Wi-Fi radio enters power save mode after a few minutes of idle, the router's ARP cache for the phone goes stale, and the laptop hits "No route to host" when trying to SSH or curl the phone's LAN IP - even though outbound (cloudflared tunnel, phone-initiated browsing) still works.

The userspace workaround is to keep the LAN warm with a single ICMP packet every 30 seconds. Add a runit service that pings the default gateway:

```bash
# In Termux on the phone
mkdir -p $PREFIX/var/service/tasklog-keepalive/log

cat > $PREFIX/var/service/tasklog-keepalive/run <<'RUN'
#!/data/data/com.termux/files/usr/bin/bash
exec 2>&1
while true; do
  GW=$(ip route | awk '/^default/ {print $3; exit}')
  if [ -n "$GW" ]; then
    ping -c 1 -W 2 "$GW" >/dev/null 2>&1 || true
  fi
  sleep 30
done
RUN
chmod +x $PREFIX/var/service/tasklog-keepalive/run

cat > $PREFIX/var/service/tasklog-keepalive/log/run <<'RUN'
#!/data/data/com.termux/files/usr/bin/bash
mkdir -p $HOME/log/tasklog-keepalive
exec svlogd -tt $HOME/log/tasklog-keepalive
RUN
chmod +x $PREFIX/var/service/tasklog-keepalive/log/run

SVDIR=$PREFIX/var/service sv start tasklog-keepalive
sv status tasklog-keepalive
```

Cost: ~2880 single-byte pings per day to your own router. Battery impact negligible (the Wi-Fi radio is already cycling at this rate to maintain the cloudflared tunnel).

This is intentionally NOT part of `scripts/deploy-phone.sh` because it's environment-specific (other phones / ROMs may have the Wi-Fi setting or different power management). The deploy script manages app services; this is phone setup.

---

## Part 2: proot Ubuntu side (runtime deps, layout)

What needs to exist inside the proot rootfs before the deploy script runs.

### Install proot-distro and Ubuntu

```bash
# In Termux
pkg install proot-distro
proot-distro install ubuntu
```

This downloads ~150 MB of Ubuntu rootfs into `$PREFIX/var/lib/proot-distro/installed-rootfs/ubuntu/`.

### Install runtime tools inside proot

```bash
# From Termux
proot-distro login ubuntu

# Now inside Ubuntu
apt-get update
apt-get install -y sqlite3
```

- `sqlite3` - inspecting the live DB if needed (optional but handy).

Note: `tmux` and `rsync` do **not** need to be inside proot. tmux is no longer used at all (replaced by runit in Termux). rsync runs on the Termux side.

### Install .NET runtime and Node.js

For Tasklog, we need the **.NET 10 ASP.NET Core runtime** (not full SDK, since cross-compiling happens on the laptop) and **Node.js 20+**.

```bash
# Inside proot Ubuntu
apt-get install -y dotnet-runtime-10.0 aspnetcore-runtime-10.0
apt-get install -y nodejs npm
```

The Realme deploy currently has the SDK (`10.0.107`) installed too, which is harmless but wastes ~350 MB. To strip down to runtime-only later:

```bash
apt-get remove dotnet-sdk-10.0
```

### Verify architecture

```bash
# Inside proot
dotnet --info | grep -i 'rid\|architecture'
# Expect: arm64, ubuntu.25.10-arm64
```

This is the target we'll cross-compile for from the laptop with `dotnet publish -r linux-arm64`.

### Deploy directory layout

```
~/tasklog/
├── backend/                  # cross-compiled .NET output (transferred each deploy)
│   ├── Tasklog.Api.dll
│   ├── ...
│   └── TasklogDatabase.db    # live DB - never overwritten by deploys
└── frontend/                 # Next.js standalone (transferred each deploy)
    ├── server.js
    ├── .next/
    │   └── static/
    ├── public/
    └── node_modules/         # arm64 binaries, installed on phone post-transfer
```

No source code on the phone. No git. Repo lives on the laptop only; phone gets compiled artifacts.

---

## Part 3: Networking - what to bind to and why

Why we bind backend to `0.0.0.0:5115` and frontend to `0.0.0.0:3000`, why we don't bake `NEXT_PUBLIC_API_URL`, and what to know about CORS.

### Bind addresses

Backend launches with `ASPNETCORE_URLS=http://0.0.0.0:5115`. `0.0.0.0` means "listen on every network interface this machine has." This matters because:

- The phone has multiple MAC addresses (separate per wifi band), each with its own LAN IP.
- The phone may also be on USB tethering or a different network.
- If we bound to `192.168.1.51` specifically, the service stops working the moment the IP changes.

Same reasoning for frontend: `HOSTNAME=0.0.0.0 PORT=3000`.

Full theory: [learnings/network-bind-addresses.md](../docs/learnings/network-bind-addresses.md).

### Frontend API URL - not baked

The frontend code in [frontend/src/lib/api.ts](../frontend/src/lib/api.ts) falls back to `http://${window.location.hostname}:5115` when `NEXT_PUBLIC_API_URL` is unset at build time. Result: visiting `http://192.168.1.51:3000` calls the API at `http://192.168.1.51:5115`, visiting `http://192.168.1.50:3000` calls `:5115` on `.50`. No rebuild needed if the phone's IP changes.

So: when running `next build` for the phone deploy, **do not set `NEXT_PUBLIC_API_URL`**. The fallback handles every IP case automatically.

### CORS

Tasklog's backend currently uses `AllowAnyOrigin` (commit `b069d83` enabled this for LAN-roaming convenience). On a LAN-only setup with no port forwarding and no auth, this is fine.

**Before exposing to the internet** (Stage 5 territory), tighten CORS to known origins and add real authentication. CORS is a browser-side barrier, not server-side auth - see [learnings/cors-explained.md](../docs/learnings/cors-explained.md) for why this matters.

---

## Part 4: First deploy

The first deploy uses the same script as ongoing deploys but creates the directory structure on the phone:

```bash
# From the laptop, repo root
./scripts/deploy-phone.sh
```

The script's preflight checks confirm the phone state before doing any work. First deploy includes a fresh `npm install` for arm64 deps inside proot, which is the slow step (~8 min on the phone's internet). Subsequent deploys are faster but still re-download because of a proot+npm cache quirk (see comment in the script). A future optimization is shipping pre-built arm64 `node_modules` from the laptop via `docker run --platform=linux/arm64`; not done yet.

After the script finishes, verify reachability from another LAN device:

```bash
# From your laptop or any wifi-connected device
curl http://192.168.1.51:3000/                        # frontend
curl http://192.168.1.51:5115/api/tasks               # backend
```

Both should return `200 OK`.

---

## Part 5: Auto-start on reboot

The boot script is already covered in [Part 1](#boot-script-consolidated) above. Test it survives a reboot:

```bash
# Physically reboot the phone (power button), then from the laptop wait ~30s and:
ssh phone 'SVDIR=$PREFIX/var/service sv status tasklog-api tasklog-web'
```

Expected: both show `run:` with a recent uptime. If they show `down:` or `fail:`, check `~/log/<service>/current` for clues. Common issues:

- **wake-lock not active** -> Android killed Termux during the reboot transition. Open Termux app once after boot, or add `termux-wake-lock` earlier in the boot script.
- **runsvdir not running** -> the `pgrep` check in the boot script lets it skip if a previous instance is alive. After full reboot, no instance exists, so it should start. If it doesn't, manually run `bash ~/.termux/boot/start-tasklog-server.sh`.

Boot-to-ready time on the Realme: ~30s for runsvdir to start the services + ~25s for proot login + ~5s for the .NET app to boot = ~60s after Termux comes up.

---

## Day-to-day commands

```bash
# Service status (from the laptop)
ssh phone 'SVDIR=$PREFIX/var/service sv status tasklog-api tasklog-web'

# Live backend logs
ssh phone 'tail -f $HOME/log/tasklog-api/current'

# Live frontend logs
ssh phone 'tail -f $HOME/log/tasklog-web/current'

# Manual restart of one service
ssh phone 'SVDIR=$PREFIX/var/service sv restart tasklog-api'

# Stop / start
ssh phone 'SVDIR=$PREFIX/var/service sv down tasklog-api'
ssh phone 'SVDIR=$PREFIX/var/service sv up   tasklog-api'

# Test the API directly from the laptop
curl -i http://192.168.1.51:5115/api/tasks

# Inspect the SQLite DB from the laptop without copying
ssh phone 'proot-distro login ubuntu -- sqlite3 /root/tasklog/backend/TasklogDatabase.db ".tables"'

# Phone resource usage
ssh phone 'termux-battery-status'                 # battery + charging state
ssh phone 'top -b -n 1 | head -20'                # CPU + RAM (Termux side)
ssh phone 'proot-distro login ubuntu -- top -b -n 1 | head -20'  # inside proot
```

The `SVDIR=$PREFIX/var/service` prefix is required because `sv` looks for that env var to know where service definitions live. You can also `export SVDIR=$PREFIX/var/service` in `~/.bashrc` on the phone if you want to drop the prefix, but inline keeps the commands self-contained.

---

## Adding a second app to the same phone

The runit setup is generic. To add a new service:

1. Pick free ports (next available: 5116 for backend, 3001 for frontend, etc.).
2. Create a service dir: `$PREFIX/var/service/<service-name>/`.
3. Write a `run` script (model after [scripts/deploy-phone.sh](../scripts/deploy-phone.sh) Step 6 - the heredoc that creates `tasklog-api`).
4. Write a `log/run` script that pipes output to `~/log/<service-name>/`.
5. `chmod +x` both run scripts.
6. runsvdir picks up the new service automatically within ~5s.

No boot script changes needed - runsvdir already supervises everything in `$PREFIX/var/service/`. If you want fancier per-service settings (resource limits, environment isolation), runit's `chpst` is the standard tool.

If you end up with 3+ services and want clean URLs (`tasklog.local` instead of `:3000`), introduce Caddy at that point. See the Stage 5 placeholder below.

---

## Exposing to the internet (Stage 5 placeholder)

<!-- TODO Stage 5: when we add internet exposure, write a dedicated guide and link it here.
     Topics to cover:
     - Caddy reverse proxy on the phone (hostname routing, free HTTPS)
     - DNS A record for tasklog.manudubey.in pointing at the home public IP
     - Router port forward 443 -> phone:443
     - CORS lockdown to known origin
     - Authentication on the API (real login, not just same-origin trust)
     - Tailscale as an alternative (no port forward, magic domain, harder for randos)
     This guide gets a "Stage 5" note added pointing at the new file.
     -->

---

## Troubleshooting

Issues we've actually hit, with fixes:

**`sv: unable to change to service directory: file does not exist`**
- Cause: `SVDIR` env var is unset. `sv` defaults to `/var/service` which doesn't exist on Termux.
- Fix: prefix with `SVDIR=$PREFIX/var/service` on every `sv` command, or export it in `~/.bashrc` on the phone.

**Backend returns HTTP 500 on every endpoint, frontend loads fine**
- Cause: SQLite DB exists as a 0-byte file (auto-created on first connect) but has no schema.
- Fix: backend now calls `Database.Migrate()` on startup. If you see this on a fresh deploy, redeploy with the latest code so the migration call is present.

**`.NET GC heap initialization failed with error 0x8007000E`**
- Cause: .NET 10's server GC tries to reserve 256 GiB of virtual memory; fails inside proot.
- Fix: launch with `DOTNET_gcServer=0` (workstation GC). Already set in the runit `run` script.

**`npm install` fails with `ENOENT` rename errors**
- Cause: proot's syscall translation breaks npm's atomic cache rename for `_cacache/tmp/X -> _cacache/content-v2/...`.
- Fix: `rm -rf /root/.npm` before each install. Already done in `scripts/deploy-phone.sh`. Slow but reliable.

**Frontend `Cannot find module 'next'` after deploy**
- Cause: standalone bundle's `node_modules` was excluded from rsync (it's x64 binaries, useless on phone), and the post-rsync `npm install` failed silently (probably the proot rename issue).
- Fix: same as above - the deploy script wipes the cache before installing.

**Services restart constantly / "go down 5s after start"**
- Cause: the `run` script is exiting, runit treats that as a crash and restarts. Usually means a typo in the env vars or path.
- Fix: `ssh phone 'tail -50 ~/log/<service>/current'` to see what the service actually said before exiting.

**Can't reach phone from another LAN device but can ping it**
- Cause: probably AP isolation on the router (separates 2.4 GHz and 5 GHz clients).
- Fix: turn off AP isolation in the router admin. Some routers call it "client isolation" or "wireless isolation".

**`proot-distro login` takes 20-30s every time**
- Not a bug. proot has to bind-mount /proc, /sys, /dev, /system, etc. before forking the shell. Normal cost. Batch your phone-side work into single proot sessions when possible.

---

## Reference: file paths on the phone

```
Termux home (visible to ssh sessions):
  ~/                              -> /data/data/com.termux/files/home/
  ~/.termux/boot/                 -> Termux:Boot scripts
  $PREFIX/                        -> /data/data/com.termux/files/usr/

proot Ubuntu rootfs (from Termux):
  $PREFIX/var/lib/proot-distro/installed-rootfs/ubuntu/

Same path from laptop over scp/rsync:
  /data/data/com.termux/files/usr/var/lib/proot-distro/installed-rootfs/ubuntu/

Inside proot (when logged in):
  /                               (the proot rootfs)
  /root/tasklog/                  (deploy target)
```

The deploy script transfers files using the long absolute path so they land directly inside the proot rootfs. No bind-mount needed.
