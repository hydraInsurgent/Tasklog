# GCP - Deploying Updates

How to push a new version of Tasklog to the live VM after the initial setup is done.
See `guides/gcp-server-setup.md` for the one-time server setup.

---

## How deploys work

The VM runs two processes managed by systemd - the .NET backend and the Next.js frontend.
To deploy a new version:

1. Build the new code locally (your machine does the heavy lifting, not the tiny VM)
2. Stop the running services so files are not locked during transfer
3. Transfer the compiled output to the VM (overwrite old files)
4. Restart the services with the new code

The **database is never touched** during a deploy. Live data survives across releases.

---

## The deploy script

`scripts/deploy-gcp.ps1` does all of the above in one command.

Run from the repo root:
```powershell
.\scripts\deploy-gcp.ps1
```

The script takes about 2-3 minutes. The app is briefly offline during steps 3-4
(stop → transfer → restart). For a demo this is fine.

Expected output at the end:
```
== Restarting services ==

● tasklog-api.service - Tasklog .NET API
     Active: active (running) ...

● tasklog-frontend.service - Tasklog Next.js Frontend
     Active: active (running) ...

========================================
  Deploy complete!
  https://tasklog.manudubey.in
========================================
```

---

## What the script does NOT do

- Does not run database migrations - if a new release adds a migration, you need to run it manually on the VM first (see below)
- Does not update the seed database - if you changed `seed-sample-data.sql`, update the seed file on the VM separately
- Does not update systemd service files or nginx config - those are one-time setup, only change manually if needed

---

## If a release adds a database migration

EF Core migrations change the database schema. You need to apply them before restarting the backend,
otherwise the new code will crash trying to use columns that don't exist yet.

On the VM after transferring files but before restarting:
```bash
# Run migrations against the live database
cd /home/manudubey77/tasklog/backend
dotnet Tasklog.Api.dll --migrate-only   # if a migrate-only flag exists
# OR: let the backend apply migrations on startup (check Program.cs)
```

If the backend applies migrations automatically on startup (common pattern), just deploy normally.
Check `Program.cs` for `context.Database.Migrate()` - if it's there, nothing extra is needed.

---

## Updating the seed database

If you changed `dist/seed-sample-data.sql` and want the cron reset to use the new data:

```powershell
# Regenerate locally
.\dist\Create-SampleDb.ps1

# Transfer the new seed file to the VM
gcloud compute scp dist/sample/TasklogDatabase.db manudubey77@tasklog-vm:/home/manudubey77/tasklog/backend/TasklogDatabase.seed.db --zone=us-central1-f
```

The next cron reset (every 6 hours) will use the new seed. 
To apply it immediately:
```bash
# On the VM - requires the sudoers rule from the server setup guide
/home/manudubey77/tasklog/scripts/reset-demo-db.sh
```

---

## Troubleshooting a failed deploy

**Services won't start after deploy:**
```bash
# Check what went wrong
sudo journalctl -u tasklog-api -n 50
sudo journalctl -u tasklog-frontend -n 50
```

**Frontend shows old version:**
Next.js caches aggressively. Hard refresh the browser (Ctrl+Shift+R).
If still old, check the static files were transferred correctly:
```bash
ls /home/manudubey77/tasklog/frontend/.next/static/
```

**502 Bad Gateway after deploy:**
One of the services didn't start. Check status:
```bash
sudo systemctl status tasklog-api tasklog-frontend
```

**Script fails mid-way:**
The services may be stopped but not restarted. SSH in and start them manually:
```bash
sudo systemctl start tasklog-api tasklog-frontend
sudo systemctl status tasklog-api tasklog-frontend
```

---

## Rollback

There is no automatic rollback. If a deploy breaks the app:

1. Fix the code locally and redeploy (`.\scripts\deploy-gcp.ps1`)
2. Or SSH in and manually replace files with a known good version

For safety on important releases, keep a copy of the previous build output before deploying.
