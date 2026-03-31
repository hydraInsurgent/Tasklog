# Feature Implementation Plan

**Overall Progress:** `100%`

## TLDR
Add GitHub Actions CI that builds and releases Tasklog for all platforms (Windows, Mac arm64, Mac x64, Linux x64) on every release tag. Also adds `run.sh` for Mac/Linux contributors and fixes the two Windows-only hardcodings in the launcher.

## Goal State

**Current State:** `build.ps1` runs locally on Windows and produces `Tasklog-win-x64.zip` only. No CI exists. The launcher has hardcoded `.exe` extensions that break on Mac/Linux.

**Goal State:** Pushing a `v*` tag triggers GitHub Actions. Four platform packages are built in parallel and uploaded to the GitHub Release automatically. Mac and Linux users can download and run Tasklog.

## Critical Decisions

- **CI only, not CD:** Packages are uploaded to GitHub Releases. Deployment to the Linux server is manual for now.
- **Frontend built once on Ubuntu:** Next.js standalone output is pure JS - no platform-specific native modules. Building once and sharing across matrix jobs avoids redundant 2-3 minute builds.
- **tar.gz for Mac/Linux, zip for Windows:** `tar.gz` preserves execute permissions. Zip does not - the launcher and backend would not be runnable after extraction on Mac/Linux.
- **`macos-latest` for arm64, `macos-13` for x64:** GitHub's current runner mapping. `macos-latest` is M-series (arm64), `macos-13` is Intel (x64).
- **`build.ps1` unchanged:** Still used for local Windows builds. CI workflow re-implements the assembly logic in shell steps per platform.
- **`/ship` creates the release, CI uploads to it:** `/ship` Step 7 runs `gh release create` as today. CI detects the release by tag and uploads packages to it. `/ship` Step 9 output gets a note that CI is building in the background.
- **Mac Gatekeeper note in README:** Unsigned binaries are blocked by default on Mac. README in the Mac packages must document the workaround (`xattr` or right-click > Open).

## Tasks

- [x] 🟩 **Step 1: Fix launcher platform paths** `[parallel]` → delivers: launcher that compiles and runs correctly on Mac/Linux
  - [x] 🟩 Replace hardcoded `"Tasklog.Api.exe"` with platform-aware path using `OperatingSystem.IsWindows()`
  - [x] 🟩 Replace hardcoded `"node.exe"` with platform-aware path using the same check

- [x] 🟩 **Step 2: Add publish profiles** `[parallel]` → delivers: dotnet publish targets for all 3 new platforms
  - [x] 🟩 `backend/.../PublishProfiles/osx-arm64-distributable.pubxml`
  - [x] 🟩 `backend/.../PublishProfiles/osx-x64-distributable.pubxml`
  - [x] 🟩 `backend/.../PublishProfiles/linux-x64-distributable.pubxml`
  - [x] 🟩 `launcher/.../PublishProfiles/osx-arm64-distributable.pubxml`
  - [x] 🟩 `launcher/.../PublishProfiles/osx-x64-distributable.pubxml`
  - [x] 🟩 `launcher/.../PublishProfiles/linux-x64-distributable.pubxml`

- [x] 🟩 **Step 3: Add run.sh** `[parallel]` → delivers: Mac/Linux dev convenience script equivalent to run.ps1
  - [x] 🟩 Start backend (`dotnet run`) and frontend (`npm run dev`) as background processes
  - [x] 🟩 Trap `SIGINT`/`SIGTERM` to stop both cleanly on Ctrl+C
  - [x] 🟩 Line endings converted to LF for Unix compatibility

- [x] 🟩 **Step 4: GitHub Actions release workflow** `[sequential]` → depends on: Steps 1, 2
  - [x] 🟩 Create `.github/workflows/release.yml` triggered on `v*` tag push
  - [x] 🟩 Job: `build-frontend` - runs on `ubuntu-latest`, builds Next.js standalone, uploads as artifact
  - [x] 🟩 Job: `build-release` - matrix of 4 runners, downloads frontend artifact, publishes backend + launcher for the platform's RID, downloads correct Node.js binary, assembles package directory, archives (zip on Windows, tar.gz on Mac/Linux), uploads to GitHub Release
  - [x] 🟩 Seed sample database in each platform's package (temp .NET project runs `seed-sample-data.sql`)
  - [x] 🟩 Platform-specific README: Windows says "double-click Tasklog.exe", Mac includes Gatekeeper workaround (`xattr` / right-click > Open), Linux says `./Tasklog`
  - [x] 🟩 Handle release timing: CI waits up to 5 minutes with retry loop for release to exist before uploading
  - [x] 🟩 Update `/ship` command Step 9 output: add note that CI is building packages, check release page in ~10 minutes
  - [x] 🟩 Add `workflow_dispatch` as a secondary trigger (manual "Run workflow" button in GitHub Actions tab - reusable, no junk tags)
  - [x] 🟩 Dry-run verification: all 4 packages built and verified via `workflow_dispatch` (run 23794886574)

## Outcomes

**What was built:**
- `.github/workflows/release.yml` - CI workflow with `v*` tag and `workflow_dispatch` triggers
- 6 new publish profiles (osx-arm64, osx-x64, linux-x64 for both backend and launcher)
- `launcher/Program.cs` - platform-aware exe paths using `OperatingSystem.IsWindows()`
- `run.sh` - bash dev script for Mac/Linux contributors
- `frontend/src/hooks/usePolling.ts` - was missing from git (unblocked CI frontend build)
- `/ship` command updated with CI status note

**Deviations from plan:**
- `macos-13` runner (for Mac x64) is discontinued - switched to cross-compiling `osx-x64` from `ubuntu-latest`. Identical output, no runtime difference.
- `frontend/src/hooks/usePolling.ts` was never committed to git - discovered when CI ran `npm run build` (local dev mode doesn't require it to exist). Recreated from documented behaviour in `engineering-guidelines.md`.
- `upload-artifact@v4` strips the leading path segment from uploaded paths - fixed assemble step to use `frontend-artifact/.next/` not `frontend-artifact/frontend/.next/`.
- The `.db` file is gitignored so CI cannot copy it - added `dotnet ef database update` step to create a fresh migrated database in CI before seeding.
