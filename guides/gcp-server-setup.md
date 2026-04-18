# GCP Deployment Notes

How to deploy Tasklog (or any .NET + Next.js app) to a GCP VM.
Reference for future deploys and new projects.

## How this all fits together

When someone visits `https://tasklog.manudubey.in`, here is what actually happens:

```
Browser
  |
  | HTTPS request
  v
nginx (the gatekeeper, port 443)
  |
  |-- /api/* requests --> .NET backend (port 5115, internal only)
  |                              |
  |                         SQLite database (TasklogDatabase.db)
  |
  \-- everything else --> Next.js frontend (port 3000, internal only)
```

- **nginx** is the only thing the internet can reach. It receives all traffic and decides where to send it.
- **The .NET backend** and **Next.js frontend** are hidden - they only listen on localhost ports. The internet cannot talk to them directly.
- **systemd** is Linux's service manager. It runs both processes in the background and restarts them automatically if they crash or if the VM reboots.
- **certbot** handles the HTTPS certificate from Let's Encrypt and renews it automatically.

---

## One-time: Install gcloud CLI (Windows)

`gcloud` is Google's command-line tool for controlling GCP from your machine.
You use it to transfer files and SSH into VMs without opening the browser every time.

Download from: https://cloud.google.com/sdk/docs/install

After install, open a **new** PowerShell window (PATH won't update in the current one).
If gcloud still isn't found, add it manually:
```powershell
$env:PATH += ";C:\Program Files (x86)\Google\Cloud SDK\google-cloud-sdk\bin"
```

Then authenticate and set your project:
```powershell
gcloud init   # does auth + project selection in one step
# OR separately:
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
```

Find your project ID: GCP Console top bar, or `gcloud projects list`.

---

## Part 1: Create the VM (GCP Console)

A VM is a Linux computer running in Google's data centre. You rent it by the hour.
e2-micro (1 shared CPU, 1 GB RAM) qualifies for GCP's always-free tier in 3 US regions.

Go to Compute Engine > VM Instances > Create Instance.

| Setting | Value |
|---------|-------|
| Name | tasklog-vm (or your app name) |
| Region | us-central1 (free tier) |
| Zone | us-central1-f |
| Machine type | e2-micro (under Shared-core in E2 series) |
| OS | Ubuntu 24.04 LTS (Noble), x86/64 |
| Boot disk | 10 GB standard |
| Firewall | tick Allow HTTP + Allow HTTPS |

Cost estimate shows ~$7 - ignore it. Free tier applies on the bill.

> **e2-micro vs shared-core:** The machine type picker groups e2-micro under "Shared-core"
> because its CPU is shared with other VMs on the same host. It bursts when needed and
> idles cheaply. Fine for a low-traffic demo.

---

## Part 2: Install runtimes on the VM

The VM is a blank Ubuntu Linux box. It has no idea what .NET or Node.js are.
This step installs the software needed to run your app.

SSH in via GCP Console (click SSH button), then:

### Kill the auto-updater first

Ubuntu runs automatic security updates immediately after first boot.
This locks the package manager (apt) so your installs fail. Kill it first:
```bash
sudo systemctl stop unattended-upgrades
```

### .NET ASP.NET Core runtime

Two runtimes are needed for a Web API - the base .NET runtime plus the ASP.NET Core layer on top.
The apt package manager only carries LTS versions (.NET 8), so use Microsoft's install script instead.

Check your backend .csproj TargetFramework first to know which channel to install.

```bash
curl -fsSL https://dot.net/v1/dotnet-install.sh -o dotnet-install.sh
chmod +x dotnet-install.sh

# Install the base .NET runtime
sudo ./dotnet-install.sh --runtime dotnet --channel 10.0 --install-dir /usr/share/dotnet

# Install the ASP.NET Core runtime on top (required for Web API - adds HTTP pipeline, middleware, etc.)
sudo ./dotnet-install.sh --runtime aspnetcore --channel 10.0 --install-dir /usr/share/dotnet

# Make dotnet available system-wide (so systemd services can find it)
sudo ln -sf /usr/share/dotnet/dotnet /usr/local/bin/dotnet

dotnet --list-runtimes   # verify - should show both Microsoft.NETCore.App and Microsoft.AspNetCore.App
```

> `dotnet --version` shows the SDK version and fails when only the runtime is installed.
> Use `--list-runtimes` to verify a runtime-only install.
> Run the install script from the home directory (~), not a subdirectory.

### Node.js 20 LTS

Next.js standalone output is just a Node.js server. Node.js runs it.
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version
```

### nginx + certbot

nginx is the reverse proxy - it sits in front of both processes and routes traffic.
certbot is the tool that gets and renews HTTPS certificates from Let's Encrypt (free).
```bash
sudo apt-get install -y nginx certbot python3-certbot-nginx
sudo systemctl enable nginx   # start nginx automatically on VM boot
sudo systemctl start nginx
```

Verify: visit `http://<VM-external-IP>` in a browser - should show the nginx welcome page.
This confirms the VM is reachable and nginx is running on port 80.

---

## Part 3: Build locally (Windows)

The app needs to be compiled before transferring. You build on your machine,
then copy the compiled output to the VM. The VM does not need the source code.

Run all commands from the **repo root** (`D:\Personal\Code\Depth Projects\Tasklog`).

### Check your .NET version first
```powershell
Select-String -Path "backend/Tasklog.Api/Tasklog.Api.csproj" -Pattern "TargetFramework"
# Use that version number in Part 2 runtime install and the publish command
```

### Backend (Linux build)

`dotnet publish` compiles the C# code into a `.dll` that the .NET runtime can execute.
`-r linux-x64` targets Linux 64-bit (the VM's architecture).
`--no-self-contained` means the runtime on the VM is used instead of bundling one into the output (smaller output).
```powershell
dotnet publish backend/Tasklog.Api -c Release -r linux-x64 --no-self-contained -o backend/Tasklog.Api/bin/publish/linux-x64
```

### Frontend (with production API URL)

`npm run build` compiles the Next.js app into a standalone Node.js server.
`.env.production` is gitignored so the public API URL is set inline at build time instead.
The URL is baked into the browser-side JavaScript at build time - it can't be changed without rebuilding.
```powershell
$env:NEXT_PUBLIC_API_URL = "https://tasklog.manudubey.in"
npm run build --prefix frontend
```

### Seed database
```powershell
.\dist\Create-SampleDb.ps1
# output: dist/sample/TasklogDatabase.db
```

---

## Part 4: Transfer files to VM

`gcloud compute scp` is like copying files but over SSH to the remote VM.

**Key behaviour to know:** `gcloud scp --recurse some/dir remote:/dest/` copies the
named directory itself into the destination - not just its contents. So `scp linux-x64 remote:/backend/`
creates `/backend/linux-x64/` on the VM, not `/backend/` directly. The mv steps below fix this.

Create target directories on the VM first (SSH in):
```bash
mkdir -p /home/manudubey77/tasklog/backend
mkdir -p /home/manudubey77/tasklog/frontend
mkdir -p /home/manudubey77/tasklog/scripts
```

Then transfer from Windows (run from repo root).
Run transfers in order - step 2 creates `frontend/.next/` which step 3 depends on.

```powershell
# --- Backend ---
# Copies linux-x64/ into backend/ -> creates backend/linux-x64/ on VM
gcloud compute scp --recurse backend/Tasklog.Api/bin/publish/linux-x64 manudubey77@tasklog-vm:/home/manudubey77/tasklog/backend --zone=us-central1-f

# --- Frontend: step 1 - standalone server files ---
# Copies standalone/ into frontend/ -> creates frontend/standalone/ on VM
# Contains server.js, package.json, node_modules - but NOT the hidden .next/ dir (see step 2)
gcloud compute scp --recurse frontend/.next/standalone manudubey77@tasklog-vm:/home/manudubey77/tasklog/frontend --zone=us-central1-f

# --- Frontend: step 2 - hidden .next dir inside standalone ---
# gcloud scp --recurse silently skips hidden directories (names starting with dot).
# So .next/ inside standalone was NOT transferred in step 1. Transfer it explicitly.
# This creates frontend/.next/ on the VM (contains BUILD_ID, server-side code, etc.)
gcloud compute scp --recurse "frontend/.next/standalone/.next" manudubey77@tasklog-vm:/home/manudubey77/tasklog/frontend/ --zone=us-central1-f

# --- Frontend: step 3 - static browser assets ---
# Target the PARENT directory (.next/) not the directory itself (.next/static/).
# If you target .next/static/ as destination, scp creates .next/static/static/ (one level too deep).
# Targeting .next/ lets scp create static/ correctly inside it.
# Must run AFTER step 2 so frontend/.next/ already exists on the VM.
gcloud compute scp --recurse frontend/.next/static manudubey77@tasklog-vm:/home/manudubey77/tasklog/frontend/.next/ --zone=us-central1-f

# --- Frontend: step 4 - public files ---
# Target frontend/ (parent) so scp creates public/ inside it.
gcloud compute scp --recurse frontend/public manudubey77@tasklog-vm:/home/manudubey77/tasklog/frontend/ --zone=us-central1-f

# --- Databases ---
gcloud compute scp backend/Tasklog.Api/TasklogDatabase.db manudubey77@tasklog-vm:/home/manudubey77/tasklog/backend/TasklogDatabase.db --zone=us-central1-f
gcloud compute scp dist/sample/TasklogDatabase.db manudubey77@tasklog-vm:/home/manudubey77/tasklog/backend/TasklogDatabase.seed.db --zone=us-central1-f

# --- Reset script ---
gcloud compute scp scripts/reset-demo-db.sh manudubey77@tasklog-vm:/home/manudubey77/tasklog/scripts/reset-demo-db.sh --zone=us-central1-f
```

Fix directory structure on the VM (move files out of the subdirectories scp created):
```bash
# Backend: linux-x64/ landed inside backend/ - move its contents up
mv /home/manudubey77/tasklog/backend/linux-x64/* /home/manudubey77/tasklog/backend/
rm -rf /home/manudubey77/tasklog/backend/linux-x64

# Frontend: standalone/ landed inside frontend/ - move its visible contents up
# Do NOT use standalone/* here - the * glob skips hidden dirs like .next
# The .next inside standalone was already handled by the explicit transfer above
mv /home/manudubey77/tasklog/frontend/standalone/server.js /home/manudubey77/tasklog/frontend/
mv /home/manudubey77/tasklog/frontend/standalone/package.json /home/manudubey77/tasklog/frontend/
mv /home/manudubey77/tasklog/frontend/standalone/node_modules /home/manudubey77/tasklog/frontend/
rm -rf /home/manudubey77/tasklog/frontend/standalone

# Verify
ls /home/manudubey77/tasklog/backend/                # must show Tasklog.Api.dll directly
ls /home/manudubey77/tasklog/frontend/               # must show server.js directly
ls /home/manudubey77/tasklog/frontend/.next/static/  # must show chunks/ css/ media/ (NOT another static/ folder)
```

---

## Part 5: nginx config + HTTPS

nginx is the reverse proxy. It sits between the internet and your two processes.
Without nginx, your processes would need to run as root to use port 80/443 (a security risk),
and you'd have no way to route `/api/` to one process and everything else to another.

**Add the DNS A record first** before setting up nginx or running certbot.
Certbot verifies domain ownership by making an HTTP request to your domain.
If DNS hasn't propagated yet, certbot will fail.

Add this record in Porkbun (or your registrar):

| Type | Host | Answer | TTL |
|------|------|--------|-----|
| A | tasklog (or your subdomain) | VM external IP | 300 |

A wildcard CNAME (`*.domain.com`) does not block this - a specific A record takes priority.
Wait a few minutes, then check propagation: `ping tasklog.manudubey.in`

### nginx config

Create `/etc/nginx/sites-available/tasklog`:
```nginx
server {
    listen 80;
    server_name tasklog.manudubey.in;

    # /api/* requests go to the .NET backend on port 5115
    location /api/ {
        proxy_pass http://localhost:5115;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Everything else goes to Next.js on port 3000
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

nginx has two directories: `sites-available` (all configs) and `sites-enabled` (active ones).
A symlink connects them. Enable the config and reload:
```bash
sudo ln -s /etc/nginx/sites-available/tasklog /etc/nginx/sites-enabled/
sudo nginx -t          # test the config for syntax errors before reloading
sudo systemctl reload nginx
```

### HTTPS (Let's Encrypt via certbot)

certbot talks to Let's Encrypt, proves you own the domain, and gets a free SSL certificate.
The `--nginx` flag tells certbot to automatically update the nginx config to use HTTPS
and redirect all HTTP traffic to HTTPS. You don't need to edit nginx manually.
```bash
sudo certbot --nginx -d tasklog.manudubey.in
```

The certificate auto-renews every 90 days. certbot installs a cron job for this.

---

## Part 6: systemd services

systemd is Linux's process manager. It's responsible for starting processes when the VM boots
and restarting them if they crash. Without systemd, your app stops the moment you close the SSH window.

A `.service` file tells systemd: what command to run, what directory to run it in,
what environment variables to set, and what to do if it fails.

### Backend service

Create `/etc/systemd/system/tasklog-api.service`:
```ini
[Unit]
Description=Tasklog .NET API
After=network.target         # wait for network to be ready before starting

[Service]
WorkingDirectory=/home/manudubey77/tasklog/backend
ExecStart=/usr/local/bin/dotnet Tasklog.Api.dll
Environment=ASPNETCORE_ENVIRONMENT=Production
Environment=ASPNETCORE_URLS=http://localhost:5115   # override default port 5000
Environment=API_URL=http://localhost:5115            # used by Next.js SSR to reach the API
Restart=always       # restart the process if it crashes
RestartSec=5         # wait 5 seconds before restarting
User=manudubey77     # run as your user, not root

[Install]
WantedBy=multi-user.target   # start this service when the system reaches normal boot state
```

> `ASPNETCORE_URLS` is required because .NET ignores launchSettings.json in Production mode
> and defaults to port 5000. Setting this env var overrides it to 5115.

### Frontend service

Create `/etc/systemd/system/tasklog-frontend.service`:
```ini
[Unit]
Description=Tasklog Next.js Frontend
After=network.target

[Service]
WorkingDirectory=/home/manudubey77/tasklog/frontend
ExecStart=/usr/bin/node server.js
Environment=PORT=3000
Environment=HOSTNAME=0.0.0.0   # listen on all interfaces, not just localhost
Restart=always
RestartSec=5
User=manudubey77

[Install]
WantedBy=multi-user.target
```

Enable and start both services:
```bash
sudo systemctl daemon-reload                          # tell systemd to read the new service files
sudo systemctl enable tasklog-api tasklog-frontend   # start automatically on VM boot
sudo systemctl start tasklog-api tasklog-frontend    # start right now
sudo systemctl status tasklog-api tasklog-frontend   # check they are running
```

After services are running, do an initial reset to load seed data:
```bash
cp /home/manudubey77/tasklog/backend/TasklogDatabase.seed.db /home/manudubey77/tasklog/backend/TasklogDatabase.db
sudo systemctl restart tasklog-api
```

---

## Part 7: DB reset cron

cron is Linux's task scheduler. It runs commands on a schedule.
The reset script copies the seed database over the live one so the demo always returns
to a clean state. The backend is restarted so it picks up the new file.

**First: allow the script to control systemd without a password.**
The reset script uses `sudo systemctl` to stop and start the backend. Without this,
cron (and manual runs as `manudubey77`) will get "Authentication failure":

```bash
echo "manudubey77 ALL=(ALL) NOPASSWD: /bin/systemctl stop tasklog-api, /bin/systemctl start tasklog-api" | sudo tee /etc/sudoers.d/tasklog-reset
```

**Second: create the log file owned by manudubey77.**
The script appends to `reset.log`. If the file doesn't exist yet, create it now
so the script has permission to write to it:

```bash
touch /home/manudubey77/tasklog/scripts/reset.log
```

**Then set up cron:**

```bash
chmod +x /home/manudubey77/tasklog/scripts/reset-demo-db.sh   # make the script executable
crontab -e   # open your personal cron schedule (pick nano as editor)
```

Add this line at the bottom (`0 */6` = at minute 0, every 6 hours):
```
0 */6 * * * /home/manudubey77/tasklog/scripts/reset-demo-db.sh
```

**Test it manually before relying on cron:**
```bash
/home/manudubey77/tasklog/scripts/reset-demo-db.sh
cat /home/manudubey77/tasklog/scripts/reset.log   # should show a timestamped entry
```

---

## Useful commands (day-to-day)

```bash
# Check if services are running
sudo systemctl status tasklog-api
sudo systemctl status tasklog-frontend

# Restart a service (e.g. after a deploy)
sudo systemctl restart tasklog-api

# View live logs (Ctrl+C to stop)
sudo journalctl -u tasklog-api -f
sudo journalctl -u tasklog-frontend -f

# Test nginx config before reloading
sudo nginx -t

# Manual DB reset (same thing the cron runs)
/home/manudubey77/tasklog/scripts/reset-demo-db.sh

# Renew SSL cert manually (certbot does this automatically, but just in case)
sudo certbot renew
```

---

## Deploying updates (after initial setup)

Once the server is set up, deploying a new version is a single command.
The deploy script (`scripts/deploy-gcp.ps1`) handles the full cycle automatically:
builds locally, transfers to the VM, fixes the directory structure, restarts services.
It does **not** touch the database - live data is preserved between deploys.

Run from the repo root:
```powershell
.\scripts\deploy-gcp.ps1
```

What the script does step by step:
1. `dotnet publish` - compiles the backend for Linux
2. `npm run build` - compiles the Next.js frontend with the production API URL
3. SSH: stops both systemd services on the VM
4. `gcloud compute scp` - transfers backend and frontend files (not the DB)
5. SSH: moves files out of the subdirectories gcloud scp creates
6. SSH: starts both services and prints their status

If you want to deploy without the script (manual):
```bash
# On the VM - check logs if something looks wrong after a deploy
sudo journalctl -u tasklog-api -f
sudo journalctl -u tasklog-frontend -f
```

---

## Adding a second app to the same VM

Each app gets its own subdomain, its own nginx server block, and its own systemd services.
The VM itself doesn't change - just add config files.

1. Build and transfer files to `/home/manudubey77/<appname>/`
2. Create systemd service files for the new app (different ports, e.g. 5116 and 3001)
3. Add a new nginx server block in `/etc/nginx/sites-available/<appname>`
4. Enable it with a symlink and reload nginx
5. Run certbot for the new subdomain
6. Add a DNS A record pointing to the same VM IP

No VM changes needed. Same machine, new subdomain.

---

## Upgrading VM size (when you outgrow e2-micro)

The VM can be resized without losing any data. Everything on disk stays intact.

1. GCP Console > VM Instances > Stop the VM
2. Click the VM name > Edit > Change machine type to e2-small (~$14/month)
3. Start the VM

Takes about 2 minutes. Apps come back automatically via systemd.
