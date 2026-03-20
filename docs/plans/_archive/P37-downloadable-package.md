# Downloadable Package - Implementation Plan

**Overall Progress:** `100%`

## TLDR
Package Tasklog as a downloadable zip for Windows so non-technical users can double-click a launcher, run the full app locally, and access it from their phone on the same Wi-Fi.

## Goal State
**Current State:** Two-process dev setup requiring .NET SDK, Node.js, and manual configuration. Hardcoded API URLs and CORS origins break outside the developer's machine.
**Goal State:** A single zip file containing everything needed to run Tasklog on any Windows machine with no prerequisites. User unzips, double-clicks the launcher, sees URLs in a console, opens browser, and the app works - including from their phone.

## Critical Decisions
- **Two-process architecture (Option B):** Ship .NET backend + Node.js frontend as separate processes coordinated by a launcher. More production-relevant than collapsing into a single exe. Demonstrates real multi-service architecture.
- **Dynamic API URL:** Frontend derives API base URL from `window.location.hostname` at runtime (client-side) and `localhost` for server-side rendering. No hardcoded IPs. This also fixes issue #1.
- **Permissive CORS for distributable:** Since Tasklog is a single-user local app with no auth, the distributable build uses a broad CORS policy. Dev mode keeps the current explicit origins.
- **Portable Node.js:** Bundle a portable Node.js binary (no installer needed) to run the Next.js standalone server.
- **Self-contained .NET:** Publish as single-file with embedded runtime so no .NET SDK is needed on the target machine.
- **PowerShell build script:** Automates the entire build-and-package pipeline. Run locally, upload the zip manually.

## Enabling Requirements (existing issues resolved by this feature)
- **#1 - CORS and API URL:** Fixed by dynamic URL detection and environment-aware CORS policy.
- **#3 - Fragile DB path:** Fixed by using an absolute path derived from the exe's directory.

## Tasks

- [x] 🟩 **Step 1: Fix dynamic API URL (issue #1)** `[parallel]` - delivers: frontend that auto-detects backend URL
  - [x] 🟩 Update `frontend/src/lib/api.ts` - added `getApiUrl()` function with env var / window.location / localhost fallback
  - [x] 🟩 Keep `NEXT_PUBLIC_API_URL` as an override for dev mode (existing `.env.local` still works)
  - [x] 🟩 Verify dev mode still works with the existing `.env.local`

- [x] 🟩 **Step 2: Fix CORS and DB path (issues #1, #3)** `[parallel]` - delivers: backend that works outside dev machine
  - [x] 🟩 Update `Program.cs` to apply CORS in all environments (not just Development)
  - [x] 🟩 Add `Distributable` CORS policy that allows any origin (safe for local single-user app)
  - [x] 🟩 Keep the existing `FrontendDev` policy for Development mode
  - [x] 🟩 Fix DB path - environment-aware: working dir in dev, AppContext.BaseDirectory in production
  - [x] 🟩 Verify dev mode is unaffected (build succeeds, zero warnings)

- [x] 🟩 **Step 3: Configure Next.js standalone output** `[parallel]` - delivers: self-contained Next.js build
  - [x] 🟩 Set `output: 'standalone'` in `next.config.ts`
  - [x] 🟩 Verify `npm run build` produces a `.next/standalone` directory
  - [x] 🟩 Verified standalone includes server.js + 14 minimal dependencies

- [x] 🟩 **Step 4: Configure .NET self-contained publish** `[parallel]` - delivers: single-file backend exe
  - [x] 🟩 Created publish profile at `Properties/PublishProfiles/win-x64-distributable.pubxml`
  - [x] 🟩 `dotnet publish` produces a 107 MB single-file exe
  - [x] 🟩 Exe starts and serves API (note: defaults to port 5000 in production - launcher will override to 5115)

- [x] 🟩 **Step 5: Create sample database** `[parallel]` - delivers: pre-populated SQLite file
  - [x] 🟩 Created `dist/seed-sample-data.sql` with 3 projects, 4 labels, 12 tasks, 8 label associations
  - [x] 🟩 Created `dist/Create-SampleDb.ps1` to copy dev DB schema and apply seed data

- [x] 🟩 **Step 6: Build the C# launcher** `[sequential]` - depends on: Steps 1-4
  - [x] 🟩 Created `launcher/Tasklog.Launcher` console project, added to solution
  - [x] 🟩 Launcher starts .NET backend with `--urls http://0.0.0.0:5115`
  - [x] 🟩 Launcher starts Node.js with Next.js standalone server (PORT=3000, HOSTNAME=0.0.0.0)
  - [x] 🟩 Detects LAN IP via NetworkInterface API
  - [x] 🟩 Prints localhost + LAN IP URLs with colored console output
  - [x] 🟩 Waits for keypress, kills entire process tree on exit (handles Ctrl+C too)
  - [x] 🟩 Publish profile created at `Properties/PublishProfiles/win-x64-distributable.pubxml`

- [x] 🟩 **Step 7: PowerShell build script** `[sequential]` - depends on: Steps 1-6
  - [x] 🟩 Created `scripts/Build-Distributable.ps1`
  - [x] 🟩 Publishes .NET backend (self-contained, single-file, win-x64)
  - [x] 🟩 Builds Next.js standalone + copies static assets and public folder
  - [x] 🟩 Downloads portable Node.js (cached after first download)
  - [x] 🟩 Publishes launcher as `Tasklog.exe` in zip root
  - [x] 🟩 Assembles folder structure with sample DB (sqlite3 seed, falls back to dev DB if no sqlite3)
  - [x] 🟩 Zips into `build/Tasklog-win-x64.zip`
  - [x] 🟩 Includes README.txt with quick-start and troubleshooting instructions

- [x] 🟩 **Step 8: End-to-end test** `[sequential]` - depends on: Step 7
  - [x] 🟩 Build script ran successfully - produced 115.1 MB zip
  - [x] 🟩 Launcher starts both processes (backend port 5115, frontend port 3000)
  - [x] 🟩 LAN IP detection works (showed 192.168.1.41)
  - [x] 🟩 Backend API responds correctly from published exe (tasks, projects returned)
  - [x] 🟩 Manual test: user confirmed app works in browser
  - [x] 🟩 Manual test: launcher shows URLs and runs correctly
  - [x] 🟩 Manual test: clean shutdown confirmed

## Outcomes
- **Deviation:** Replaced sqlite3 dependency with a temporary .NET project for seeding (avoids requiring external tools)
- **Deviation:** Added HTTPS redirection guard (only in Development) to avoid production warnings
- **Deviation:** DB path fix uses environment-aware logic (working dir in dev, AppContext.BaseDirectory in prod) instead of always using AppContext.BaseDirectory
- **Integration fix:** Published .NET exe defaults to port 5000 in production - launcher overrides to 5115 via `--urls` flag
- **Review issues created:** #38, #39, #40, #41 (non-blocking improvements for future)
