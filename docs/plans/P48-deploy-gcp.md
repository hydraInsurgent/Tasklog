# Deploy Tasklog to GCP

**Overall Progress:** `25%`

## TLDR
Deploy Tasklog to a GCP Compute Engine e2-micro VM (free tier) at `tasklog.manudubey.in`.
Stage 1: bare VM deploy - no Docker. Both processes run directly on the VM, managed by systemd, served via nginx with HTTPS. A cron job resets the demo database every 6 hours from a seed copy.

## Goal State

**Current State:** App runs locally only. No public hosting. Issues #1 and #3 already fixed in code.

**Goal State:** `tasklog.manudubey.in` is live, HTTPS, publicly accessible. nginx proxies the subdomain to Next.js (port 3000) and `/api/` paths to the .NET backend (port 5115). Both processes start automatically on VM boot via systemd. Demo data resets every 6 hours.

## Critical Decisions

- **Subdomain over subpath** - `tasklog.manudubey.in` instead of `demos.manudubey.in/tasklog`. Removes the need for Next.js `basePath` config and simplifies nginx routing. Each future project gets its own subdomain, fully isolated.
- **api.ts SSR/client URL split** - `NEXT_PUBLIC_API_URL` (browser) and `API_URL` (server-side) are separate env vars. Browser calls go through nginx (public URL); SSR calls go direct to `localhost:5115` on the same VM. Avoids exposing port 5115 publicly.
- **Bare VM (no Docker) for Stage 1** - intentional learning path. Install runtimes directly, configure systemd and nginx by hand. Stage 2 will containerize what was built manually here.
- **SQLite stays as-is** - no database engine change. Persists on VM disk. Seed copy restored every 6 hours via cron.
- **e2-micro in us-central1** - qualifies for GCP always-free tier.

## Tasks

- [x] 🟩 **Step 1: Code changes** `[parallel]` → delivers: production-ready frontend build
  - [x] 🟩 Update `api.ts` `getApiUrl()` to use `process.env.API_URL` for SSR and `process.env.NEXT_PUBLIC_API_URL` for browser
  - [x] 🟩 Build command on VM uses `NEXT_PUBLIC_API_URL=https://tasklog.manudubey.in npm run build` (env file gitignored - set inline at build time)

- [x] 🟩 **Step 2: Prepare seed database** `[parallel]` → delivers: clean demo DB + reset script
  - [ ] 🟥 Populate a clean demo state in the local app (a few example projects, tasks, labels) ← manual step, see note below
  - [ ] 🟥 Copy `TasklogDatabase.db` to `TasklogDatabase.seed.db` in the same directory ← after above
  - [x] 🟩 Write `scripts/reset-demo-db.sh` - copies seed file over live file and restarts the backend service

- [ ] 🟥 **Step 3: GCP VM setup** `[sequential]` → depends on: Steps 1, 2
  - [ ] 🟥 Create e2-micro VM in us-central1 (Ubuntu 24.04 LTS), enable HTTP/HTTPS firewall rules
  - [ ] 🟥 Install .NET 9 runtime on the VM
  - [ ] 🟥 Install Node.js 20 LTS on the VM
  - [ ] 🟥 Install nginx and certbot on the VM

- [ ] 🟥 **Step 4: Build and deploy** `[sequential]` → depends on: Step 3
  - [ ] 🟥 Run `dotnet publish -c Release` for the backend; copy output to VM
  - [ ] 🟥 Run `npm run build` for the frontend (standalone output); copy `.next/standalone` to VM
  - [ ] 🟥 Copy `TasklogDatabase.seed.db` and `reset-demo-db.sh` to VM
  - [ ] 🟥 Create `API_URL=http://localhost:5115` server-side env on the VM

- [ ] 🟥 **Step 5: nginx + HTTPS** `[sequential]` → depends on: Step 3
  - [ ] 🟥 Add DNS A record: `tasklog.manudubey.in` -> VM external IP
  - [ ] 🟥 Write nginx server block: proxy `tasklog.manudubey.in` to `localhost:3000`, proxy `/api/` to `localhost:5115`
  - [ ] 🟥 Run certbot to issue Let's Encrypt cert for `tasklog.manudubey.in`
  - [ ] 🟥 Verify HTTPS redirect works

- [ ] 🟥 **Step 6: systemd services** `[sequential]` → depends on: Step 4
  - [ ] 🟥 Write `tasklog-api.service` systemd unit file (runs dotnet, restarts on failure)
  - [ ] 🟥 Write `tasklog-frontend.service` systemd unit file (runs node server.js, restarts on failure)
  - [ ] 🟥 Enable and start both services; verify they survive a VM reboot

- [ ] 🟥 **Step 7: DB reset cron** `[sequential]` → depends on: Steps 4, 6
  - [ ] 🟥 Add cron entry: run `reset-demo-db.sh` every 6 hours
  - [ ] 🟥 Verify reset works: confirm live DB is replaced and backend restarts cleanly

- [ ] 🟥 **Step 8: Smoke test** `[sequential]` → depends on: Steps 5, 6, 7
  - [ ] 🟥 Open `https://tasklog.manudubey.in` in a browser - app loads
  - [ ] 🟥 Create a task, assign a project, add a label - all persist
  - [ ] 🟥 Trigger a manual DB reset - data returns to seed state
  - [ ] 🟥 Reboot the VM - both services come back automatically

## Outcomes
<!-- Fill in after execution -->
