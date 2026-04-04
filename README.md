# Tasklog

**Minimal self-hosted task manager. No subscription. Your data.**

[![Build](https://github.com/hydraInsurgent/Tasklog/actions/workflows/release.yml/badge.svg)](https://github.com/hydraInsurgent/Tasklog/actions/workflows/release.yml)
[![Latest Release](https://img.shields.io/github/v/release/hydraInsurgent/Tasklog)](https://github.com/hydraInsurgent/Tasklog/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![Platforms](https://img.shields.io/badge/platforms-Windows%20%7C%20macOS%20%7C%20Linux-blue)

---

## Screenshots

<!-- Add screenshots here after first run. Suggested shots:
     1. Main task list (desktop) showing labels, deadlines, and color coding
     2. Mobile card view
     3. Single task detail page
     Drag images into this section in the GitHub editor, or place files in docs/images/ -->

*Screenshots coming soon.*

---

## Features

- Create tasks with a title and optional deadline
- Deadline color coding - red when overdue, yellow when due within 3 days
- Labels for organizing and filtering tasks
- Mark tasks complete with a checkbox - completed tasks hide with a brief animation
- Show/hide completed tasks and undo completion
- View tasks grouped by project (Inbox and custom projects)
- Task detail page with full status and completion history
- Delete tasks from the list or the detail page
- Responsive layout - clean list on desktop, card view on mobile
- Background auto-refresh - changes from other devices appear automatically
- All data stored locally in SQLite - you own it

---

## Download

Ready-to-run packages - no prerequisites needed. Extract and run.

| Platform | Download |
|----------|----------|
| Windows (x64) | [Tasklog-win-x64.zip](https://github.com/hydraInsurgent/Tasklog/releases/latest/download/Tasklog-win-x64.zip) |
| macOS (Apple Silicon) | [Tasklog-mac-arm64.tar.gz](https://github.com/hydraInsurgent/Tasklog/releases/latest/download/Tasklog-mac-arm64.tar.gz) |
| macOS (Intel) | [Tasklog-mac-x64.tar.gz](https://github.com/hydraInsurgent/Tasklog/releases/latest/download/Tasklog-mac-x64.tar.gz) |
| Linux (x64) | [Tasklog-linux-x64.tar.gz](https://github.com/hydraInsurgent/Tasklog/releases/latest/download/Tasklog-linux-x64.tar.gz) |

> **macOS note:** The app is not code-signed. On first run, open System Settings > Privacy & Security and click "Open Anyway" if macOS blocks it.

---

## Quick Start

1. Extract the downloaded package
2. Run `Tasklog.exe` (Windows) or `./Tasklog` (macOS/Linux) and open the URL shown in the console

That's it. The app opens in your browser.

**Windows first-run notes:**
- If Windows SmartScreen warns the app is unrecognized, click "More info" then "Run anyway"
- When prompted by Windows Firewall, allow network access for both the backend api and Node.js - this is needed for the app to work on your local network

---

## Run from Source

For contributors or anyone who wants to run from the repository directly.

**Backend**

```bash
cd backend/Tasklog.Api
dotnet run
```

Runs on `http://localhost:5115` by default (see `Properties/launchSettings.json`).

**Frontend**

```bash
cd frontend
npm install
npm run dev
```

Runs on `http://localhost:3000`. Configure the API base URL in `frontend/.env.local`.

> Both servers must be running at the same time.

---

## Tech Stack

- **Backend:** ASP.NET Core 9 Web API, Entity Framework Core, SQLite
- **Frontend:** Next.js 16 (App Router), React 19, Tailwind CSS v4
- **Icons:** Lucide React
- **Fonts:** Space Grotesk (headings), DM Sans (body)

---

## Roadmap

### Coming next

- Dark mode and custom themes
- Always-on hosting (Raspberry Pi or home server)

### Later

- Task editing from the main list
- PostgreSQL migration when SQLite is no longer sufficient
- Offline access and sync

---

## Why Tasklog exists

I was paying for a Todoist subscription for a feature set I could build myself in a weekend.

Tasklog started from that frustration: stop paying for something simple, build it end-to-end, own the data, and evolve it deliberately. The goal is a system that stays understandable by one person - no framework bloat, no cloud dependency, no recurring bill.

---

## Documentation

| File | What it covers |
|------|----------------|
| [docs/architecture.md](docs/architecture.md) | System structure, data model, API endpoints, component responsibilities |
| [docs/product-design.md](docs/product-design.md) | What the product is, who it's for, feature rules and current scope |
| [docs/engineering-guidelines.md](docs/engineering-guidelines.md) | Coding patterns, component conventions, known deviations |
| [CHANGELOG.md](CHANGELOG.md) | Version history and what changed in each release |

---

## License

[MIT](LICENSE)
