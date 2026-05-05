# Phone - Deploying Updates

How to push a new version of Tasklog to the phone home-server after the initial setup is done.
See [phone-server-setup.md](phone-server-setup.md) for the one-time setup.

**Last updated:** 2026-05-05 - initial scaffold during the Realme GT Master Edition deploy.

> **Status:** scaffolding. Filled out after the first successful run of `scripts/deploy-phone.sh`.

---

## How phone deploys work

The phone runs two processes inside proot Ubuntu, kept alive by tmux: the .NET backend and the Next.js frontend. Deploying a new version means:

1. Cross-compile the backend on the laptop (`dotnet publish -r linux-arm64`). Phone is arm64; laptop is x64. .NET cross-compiles cleanly for runtime-only targets.
2. Build the Next.js standalone on the laptop. Build artifacts are mostly architecture-neutral except for `node_modules`.
3. Transfer artifacts to the phone with rsync over SSH. Rsync is incremental, so deploys after the first only send what changed.
4. On the phone, `npm install --omit=dev` inside the standalone directory to get arm64-correct native binaries (the laptop-built `node_modules` is x64 and useless on arm64).
5. Kill and restart the two tmux sessions.

The **database is never touched** during a deploy. Live data survives across releases.

---

## The deploy script

`scripts/deploy-phone.sh` does all of the above in one command. Run from the repo root:

```bash
./scripts/deploy-phone.sh
```

<!-- TODO Stage 2 fill: capture actual timing once script runs end-to-end.
     Expected based on perf measurements during setup:
       - Backend cross-compile (laptop): ~10-15s
       - Frontend next build (laptop): ~30-60s
       - Transfer to phone (LAN rsync first time): TBD - measure
       - npm install --omit=dev (phone): ~60s estimated
       - tmux restart: ~5s
       - proot login overhead: ~25s per session (script should batch into one)
     Total first deploy: 3-5 min. Subsequent deploys: faster (rsync incremental).
     -->

The app is briefly offline during the transfer + restart steps. For a personal home server this is fine.

---

## What the script does step by step

<!-- TODO Stage 2 fill once the script is finalized. Mirror the structure of gcp-deploying-updates.md.
     Outline:
       1. dotnet publish - cross-compile backend for linux-arm64
       2. npm run build - frontend standalone (no NEXT_PUBLIC_API_URL set; runtime fallback handles IPs)
       3. SSH: kill the two tmux sessions on the phone
       4. rsync: transfer backend artifacts to /root/tasklog/backend/ inside proot rootfs
       5. rsync: transfer frontend standalone (server.js, package.json), .next/static, public/
       6. SSH: in proot, rm -rf old node_modules in standalone, npm install --omit=dev
       7. SSH: relaunch the tmux sessions with ASPNETCORE_URLS and HOSTNAME env vars
       8. SSH: print process status + a curl smoke test
     -->

---

## What the script does NOT do

- Does not run database migrations - if a release adds an EF Core migration, decide whether the backend applies it on startup (`Database.Migrate()` in `Program.cs`) or whether you need to run it manually.
- Does not update the boot script (`~/.termux/boot/start-tasklog.sh`) - those are one-time setup, edit only when the launch parameters change.
- Does not touch CORS or auth config - those live in the .NET code; redeploy normally to ship changes.
- Does not back up the live database before deploying. If you want a safety copy before a risky release, snapshot it manually first:
  ```bash
  ssh phone -t 'proot-distro login ubuntu -- cp /root/tasklog/backend/TasklogDatabase.db /root/tasklog/backend/TasklogDatabase.bak.$(date +%Y%m%d).db'
  ```

---

## Manual deploy (when you don't want the script)

<!-- TODO Stage 2 fill: document the same steps as the script but as raw commands you'd run by hand.
     Useful for debugging script failures and for porting to phoneclt later.
     Each block is one logical step with a comment explaining why. -->

---

## Troubleshooting

<!-- TODO Stage 4 fill (capture real failures as they come up):
     Likely candidates:
     - "Services don't restart after deploy" -> tmux session detection logic in script
     - "Frontend serves old version" -> Next.js cache, hard refresh; or static/ wasn't transferred
     - "API returns 500 after deploy" -> dotnet exec failure, check tmux log
     - "rsync hangs / fails" -> SSH key not in agent, or proot-distro login timeout
     - "npm install fails on phone" -> network, disk space, or wrong Node version inside proot
     - "Connection refused from another device" -> bind-address regression (back to 127.0.0.1)
     -->

---

## Rollback

There is no automatic rollback. If a deploy breaks the app:

1. Fix the code locally and redeploy (`./scripts/deploy-phone.sh`).
2. Or SSH in and replace files manually with a known-good build.

For risky releases, snapshot the live database first (see "What the script does NOT do" above), and keep a copy of the previous published output in a sibling directory you can swap in.

---

## Future: integrating with `phoneclt`

<!-- TODO future: when phoneclt (the generic per-project deploy tool) is built, this section
     describes how Tasklog plugs into it.
     Probable surface:
       - phoneclt deploy . --target tasklog-phone
       - Tasklog provides a phoneclt config file describing build commands, transfer paths, restart commands
       - The deploy-phone.sh script gets gradually replaced by the phoneclt manifest + generic engine
     Do not fill until phoneclt itself exists.
     -->
