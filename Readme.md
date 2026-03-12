# Tasklog

Tasklog is a **minimal, self-hosted task application** built for personal use.

The project started for two simple reasons:
1. I didn't want to keep paying for a Todoist subscription.
2. I wanted full control over my tasks, data, and code.

Rather than recreating an existing SaaS app, the goal was to build the **smallest useful system**, ship it end-to-end, and evolve it deliberately over time.

---

## Architecture

Tasklog is a separated client-server application:

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
| PATCH | `/api/tasks/:id/complete` | Mark a task complete or incomplete `{ isCompleted: bool }` |

---

## Capabilities

- Create tasks with a title and optional deadline
- Mark tasks as complete via checkbox - completed tasks hide with a brief animation
- Show/hide completed tasks via toggle - completion can be undone
- View all tasks in a clean list with created and completed dates
- View a single task on its own page with full status and completion history
- Delete tasks from the list or the detail page
- Deadline color coding: red (overdue), yellow (due within 3 days)
- Inline feedback after every action (no page reloads)
- Responsive layout for mobile and desktop
- SQLite persistence (database file: `backend/Tasklog.Api/TasklogDatabase.db`)

---

## Tech Stack

- **Backend:** ASP.NET Core Web API, Entity Framework Core 9, SQLite
- **Frontend:** Next.js 16 (App Router), React 19, Tailwind CSS v4
- **Icons:** Lucide React
- **Fonts:** Space Grotesk (headings), DM Sans (body)

---

## Documentation

| File | What it covers |
|------|---------------|
| [docs/architecture.md](docs/architecture.md) | System structure, data model, API endpoints, component responsibilities |
| [docs/product-design.md](docs/product-design.md) | What the product is, who it's for, feature rules and current scope |
| [docs/engineering-guidelines.md](docs/engineering-guidelines.md) | Coding patterns, component conventions, known deviations |
| [docs/backlog.md](docs/backlog.md) | Active work, feature and bug backlog, closed items |
| [CHANGELOG.md](CHANGELOG.md) | Version history and what changed in each release |
| [LESSONS.md](LESSONS.md) | Session learnings and things worth remembering |

---

## Design Philosophy

- Ship something usable before optimizing
- Prefer clarity over abstraction
- Avoid premature features
- Treat this as a tool, not a product
- Let real usage guide evolution

---

## Roadmap

### Coming next

- Task grouping via projects
- Filtering and pagination

### Later

- Always-on hosting (Raspberry Pi or VPS)
- PostgreSQL migration (when SQLite is no longer sufficient)
- Offline access and sync
