# Tasklog

Tasklog is a **minimal, self-hosted task application** built for personal use.

The project started for two simple reasons:
1. I didn't want to keep paying for a Todoist subscription.
2. I wanted full control over my tasks, data, and code.

Rather than recreating an existing SaaS app, the goal was to build the **smallest useful system**, ship it end-to-end, and evolve it deliberately over time.

---

## Architecture (v2)

Tasklog v2 is a separated client-server application:

```
backend/    .NET Core Web API (ASP.NET Core 9, EF Core, SQLite)
frontend/   Next.js 16 app (React 19, App Router, Tailwind CSS v4)
```

The backend exposes a REST JSON API. The frontend consumes it.

---

## Running the app

### Backend

```bash
cd backend/Tasklog.Api
dotnet run
```

Runs on `http://localhost:5115` by default (see `Properties/launchSettings.json`).

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Runs on `http://localhost:3000`. API base URL is configured in `frontend/.env.local`.

> **Note:** Both servers must be running at the same time for the app to work.

---

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/tasks` | List all tasks (newest first) |
| GET | `/api/tasks/:id` | Get a single task |
| POST | `/api/tasks` | Create a task `{ title, deadline? }` |
| DELETE | `/api/tasks/:id` | Delete a task |

---

## Capabilities (v2)

- Create tasks with a title and optional deadline
- View all tasks in a clean list
- View a single task on its own page
- Delete tasks from the list or the detail page
- Deadline color coding: red (overdue), yellow (due within 3 days)
- Inline feedback after every action (no page reloads)
- Responsive layout for mobile and desktop
- SQLite persistence (database file: `backend/Tasklog.Api/TasklogDatabase.db`)

---

## Design Philosophy

- Ship something usable before optimizing
- Prefer clarity over abstraction
- Avoid premature features
- Treat this as a tool, not a product
- Let real usage guide evolution

---

## Tech Stack

- **Backend:** ASP.NET Core Web API, Entity Framework Core 9, SQLite
- **Frontend:** Next.js 16 (App Router), React 19, Tailwind CSS v4
- **Icons:** Lucide React
- **Fonts:** Space Grotesk (headings), DM Sans (body)

---

## Roadmap

### Next - v2 features

Now that the architecture is in place, planned additions:

- Mark tasks as completed (completion lifecycle)
- Separate history of completed tasks
- Task grouping via projects
- Filtering and pagination

### v3+ - Reliability

- Always-on hosting (Raspberry Pi or VPS)
- PostgreSQL migration (when SQLite is no longer sufficient)
- Offline access and sync

---

## Status

**v2 architecture is live.** Backend API and Next.js frontend are both running.

The project is in an evolution phase. New features will be added only when they solve a real usage problem.

### Known limitations

Six issues were identified in the v2 code review and are tracked on GitHub:

| # | Area |
|---|------|
| [#1](https://github.com/hydraInsurgent/Tasklog/issues/1) | CORS and server-side fetch break outside localhost |
| [#2](https://github.com/hydraInsurgent/Tasklog/issues/2) | State/UX bugs in feedback timer and delete flow |
| [#3](https://github.com/hydraInsurgent/Tasklog/issues/3) | Fragile database path and silent API URL failure |
| [#4](https://github.com/hydraInsurgent/Tasklog/issues/4) | Accessibility - contrast and focus indicators |
| [#5](https://github.com/hydraInsurgent/Tasklog/issues/5) | Code cleanup - duplicated utils, UTC timestamps |
| [#6](https://github.com/hydraInsurgent/Tasklog/issues/6) | Security hardening - CORS methods, AllowedHosts |
