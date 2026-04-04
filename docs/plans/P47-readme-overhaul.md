# README Overhaul and MIT License Plan

**Overall Progress:** `100%`

## TLDR
Rewrite README.md as a proper GitHub project landing page and add an MIT license file. The current README reads like an internal dev document. The goal is for a visitor landing on the repo to immediately understand what Tasklog is, feel good about the project, and know how to get it.

## Goal State

**Current State:** README is structured for developers - architecture internals, API endpoint tables, and dev setup commands. No visuals, no badges, Windows-only download link, no license.

**Goal State:** README is a polished project introduction: badges, screenshots placeholder, scannable feature list, all-platform download links, quick-start for users, dev setup for contributors, and an MIT license file at the repo root.

## Critical Decisions

- **Remove API endpoints table from README** - it belongs in `docs/architecture.md` where it already lives; not appropriate for a project landing page
- **Screenshots as manual placeholders** - no automated screenshot tooling; user adds images manually after the README is written
- **MIT license** - simplest permissive license, standard for personal open-source projects with no copyleft requirement
- **All 4 platforms in download section** - v2.7 ships win-x64, mac-arm64, mac-x64, linux-x64; README currently only lists Windows

<!-- GUIDELINES CHECK: No new patterns introduced. README and LICENSE are documentation/repo files only. -->

## Tasks

- [x] 🟩 **Step 1: Add MIT LICENSE file** `[parallel]` → delivers: LICENSE file at repo root
  - [x] 🟩 Create `LICENSE` with standard MIT text, year 2025, author "Manu Dubey"

- [x] 🟩 **Step 2: Rewrite README.md** `[parallel]` → delivers: polished project landing page
  - [x] 🟩 Header: project name + one-line tagline ("Minimal self-hosted task manager. No subscription. Your data.")
  - [x] 🟩 Badges row: build status, latest release, license, platforms
  - [x] 🟩 Screenshots section: placeholder block with instruction for manually adding images
  - [x] 🟩 Features section: scannable 11-bullet list covering all key capabilities
  - [x] 🟩 Download section: all 4 platform links (win-x64, mac-arm64, mac-x64, linux-x64) with Mac Gatekeeper note
  - [x] 🟩 Quick Start section: extract and run - 2 steps, no dev knowledge required
  - [x] 🟩 Run from Source section: backend + frontend dev setup (moved to secondary position)
  - [x] 🟩 Tech Stack: brief 4-line list
  - [x] 🟩 Roadmap: coming next + later
  - [x] 🟩 Philosophy: brief personal origin story ("Why Tasklog exists")
  - [x] 🟩 Documentation: links to internal docs (removed LESSONS.md - not relevant to visitors)
  - [x] 🟩 License: one-line reference to LICENSE file
  - [x] 🟩 Remove: API endpoints table (lives in docs/architecture.md)

## Outcomes

- LICENSE created with MIT text, 2025, Manu Dubey - no deviations
- README rewritten as planned; one deviation: LESSONS.md removed from the Documentation table (internal dev log, not relevant to repo visitors)
- Features list expanded to 11 bullets to cover all capabilities including auto-refresh and projects, which were missing from the original
- "Design Philosophy" section renamed to "Why Tasklog exists" - reads more naturally as a project story than a principles list
- API endpoints table removed as planned - it lives in docs/architecture.md
