# Deploy Tasklog to GCP

**Overall Progress:** `100%`

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
  - [x] 🟩 Populate a clean demo state using existing `dist/Create-SampleDb.ps1` script
  - [x] 🟩 Transfer `TasklogDatabase.seed.db` to VM alongside reset script
  - [x] 🟩 Write `scripts/reset-demo-db.sh` - copies seed file over live file and restarts the backend service

- [x] 🟩 **Step 3: GCP VM setup** `[sequential]` → depends on: Steps 1, 2
  - [x] 🟩 Create e2-micro VM in us-central1-f (Ubuntu 24.04 LTS x86/64), enable HTTP/HTTPS firewall rules
  - [x] 🟩 Install .NET 10 ASP.NET Core runtime on the VM (via dotnet-install.sh - not in apt)
  - [x] 🟩 Install Node.js 20 LTS on the VM
  - [x] 🟩 Install nginx and certbot on the VM

- [x] 🟩 **Step 4: Build and deploy** `[sequential]` → depends on: Step 3
  - [x] 🟩 Run `dotnet publish -c Release -r linux-x64 --no-self-contained` for the backend; copy output to VM
  - [x] 🟩 Run `npm run build` for the frontend (standalone output); copy `.next/standalone` and static files to VM
  - [x] 🟩 Copy `TasklogDatabase.seed.db` and `reset-demo-db.sh` to VM

- [x] 🟩 **Step 5: nginx + HTTPS** `[sequential]` → depends on: Step 3
  - [x] 🟩 Add DNS A record: `tasklog.manudubey.in` -> VM external IP (34.29.85.225) at Porkbun
  - [x] 🟩 Write nginx server block: proxy `tasklog.manudubey.in` to `localhost:3000`, proxy `/api/` to `localhost:5115`
  - [x] 🟩 Run certbot to issue Let's Encrypt cert for `tasklog.manudubey.in`
  - [x] 🟩 Verify HTTPS redirect works

- [x] 🟩 **Step 6: systemd services** `[sequential]` → depends on: Step 4
  - [x] 🟩 Write `tasklog-api.service` - runs dotnet, sets `ASPNETCORE_URLS` and `API_URL`, restarts on failure
  - [x] 🟩 Write `tasklog-frontend.service` - runs node server.js, sets `NEXT_PUBLIC_API_URL`, restarts on failure
  - [x] 🟩 Enable and start both services; verified they come back on VM reboot

- [x] 🟩 **Step 7: DB reset cron** `[sequential]` → depends on: Steps 4, 6
  - [x] 🟩 Add cron entry: run `reset-demo-db.sh` every 6 hours via `crontab -e`
  - [x] 🟩 Verify reset works: confirmed live DB is replaced and backend restarts cleanly

- [x] 🟩 **Step 8: Documentation and deploy tooling** `[sequential]` → depends on: Steps 1-7
  - [x] 🟩 Write `guides/gcp-server-setup.md` - full one-time VM setup walkthrough with explanations
  - [x] 🟩 Write `guides/gcp-deploying-updates.md` - guide for deploying future releases
  - [x] 🟩 Write `scripts/deploy-gcp.ps1` - automated build + transfer + restart script for future deploys
  - [x] 🟩 Rename `notes/` folder to `guides/` for clarity
  - [x] 🟩 Fix .NET version across docs (was incorrectly noted as .NET 9; csproj targets net10.0)

- [x] 🟩 **Step 9: Smoke test final checks** `[sequential]` → depends on: Steps 5, 6, 7
  - [x] 🟩 App loads at `https://tasklog.manudubey.in`
  - [x] 🟩 Create a task, assign a project, add a label - all persist
  - [x] 🟩 Trigger a manual DB reset - data returns to seed state
  - [x] 🟩 Test deploy script (`scripts/deploy-gcp.ps1`) does a clean redeploy end to end

## Outcomes
- Deployed at `https://tasklog.manudubey.in` on GCP e2-micro VM (us-central1-f, Ubuntu 24.04 LTS)
- .NET 10 backend + Next.js 16 frontend running as systemd services behind nginx with Let's Encrypt HTTPS
- Demo DB resets every 6 hours via cron using `reset-demo-db.sh`
- `deploy-gcp.ps1` verified working for future releases - builds locally, transfers via gcloud scp, restarts services
- Key deviations from plan: .NET version was 10 not 9 (docs updated); gcloud scp copies directory itself not contents (handled with mv cleanup in script); hidden `.next` dir required explicit transfer; node_modules needed rm -rf before mv on re-deploy; sudoers rule required for reset script to control systemd without password
