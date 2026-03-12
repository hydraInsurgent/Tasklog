# Tasklog Architecture

This document describes the current system structure as of v2.
It is the primary reference for any AI assistant or contributor working in this repo.

---

## System Overview

Tasklog is a two-process application. The backend and frontend run as separate servers
and communicate over HTTP. They share no code.

```
Browser
  │
  ├── GET http://localhost:3000        Next.js frontend (React, Tailwind)
  │     │
  │     └── fetch http://localhost:5115/api/...    .NET Web API (ASP.NET Core, EF Core)
  │                                                        │
  │                                                   SQLite database
  │                                               (TasklogDatabase.db)
  └── GET http://localhost:3000/tasks/[id]
        └── Server Component fetches from API on the server, returns rendered HTML
```

---

## Repository Layout

```
Tasklog/
├── backend/
│   └── Tasklog.Api/               .NET Web API project
│       ├── Controllers/           HTTP endpoint handlers
│       ├── Data/                  EF Core DbContext
│       ├── Migrations/            EF Core schema migrations
│       ├── Models/                Data model classes
│       ├── Properties/            Launch settings (ports)
│       ├── Program.cs             App startup and service registration
│       ├── appsettings.json       Config (connection string, logging)
│       └── TasklogDatabase.db     SQLite data file
│
├── frontend/
│   └── src/
│       ├── app/                   Next.js App Router pages and layout
│       │   ├── layout.tsx         Root layout (header, fonts, body wrapper)
│       │   ├── page.tsx           Home route /
│       │   ├── globals.css        Tailwind import + font tokens
│       │   └── tasks/[id]/
│       │       └── page.tsx       Task detail route /tasks/:id
│       ├── components/            Reusable UI components
│       │   ├── TasksClient.tsx    Task list + add form (Client Component)
│       │   ├── AddTaskForm.tsx    Add task form (Client Component)
│       │   ├── DeleteTaskButton.tsx  Delete action on detail page (Client Component)
│       │   └── CompleteTaskButton.tsx  Complete/incomplete toggle on detail page (Client Component)
│       └── lib/
│           └── api.ts             Typed API call functions (used by both server and client)
│
├── docs/
│   ├── architecture.md            This file
│   └── plans/                     Implementation plans from planning sessions
│
├── CLAUDE.md                      Instructions for AI assistants
├── LESSONS.md                     Session learnings log
├── UI-SPEC-v2-migration-plan.md   Design tokens and UX rules for v2 frontend
└── Readme.md                      Human-facing project overview
```

---

## Backend

**Runtime:** .NET 9 / ASP.NET Core Web API
**Database:** SQLite via Entity Framework Core 9
**Default ports:** HTTP `5115`, HTTPS `7243` (see `launchSettings.json`)

### Layers

```
HTTP request
    │
    ▼
TasksController          Handles routing, validation, HTTP response codes.
    │                    No business logic beyond input checking.
    ▼
TasklogDbContext         EF Core context. Direct DbSet access - no repository layer.
    │
    ▼
TasklogDatabase.db       SQLite file. One table: Tasks.
```

### Data model

```
Tasks
  Id          INTEGER  primary key, autoincrement
  Title       TEXT     not null
  Deadline    TEXT     nullable  (ISO 8601 date string)
  CreatedAt   TEXT     not null  (ISO 8601 datetime string)
  IsCompleted INTEGER  not null  default 0  (boolean: 0 = pending, 1 = complete)
  CompletedAt TEXT     nullable  (ISO 8601 datetime string, set when marked complete, cleared on un-complete)
```

### API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/tasks` | All tasks, ordered by `CreatedAt` descending |
| GET | `/api/tasks/{id}` | Single task by ID. 404 if not found |
| POST | `/api/tasks` | Create task. Body: `{ title: string, deadline?: string }` |
| DELETE | `/api/tasks/{id}` | Delete task. 204 on success, 404 if not found |
| PATCH | `/api/tasks/{id}/complete` | Mark task complete or incomplete. Body: `{ isCompleted: bool }`. Returns updated task |

### CORS

Enabled in Development mode only (`Program.cs`). Allows `http://localhost:3000`.
In production, a reverse proxy on the same host is assumed - no CORS needed.
**Known issue:** see GitHub issue #1 - LAN access currently breaks without this fix.

---

## Frontend

**Runtime:** Node.js / Next.js 16 (App Router)
**Styling:** Tailwind CSS v4
**Fonts:** Space Grotesk (headings), DM Sans (body) via `next/font/google`
**Default port:** `3000`

### Next.js App Router

Next.js uses file-based routing. Every `page.tsx` file maps to a URL.
Components are either Server Components (run on the server, no interactivity)
or Client Components (run in the browser, marked with `"use client"`).

```
src/app/
  layout.tsx           Server Component. Runs on every request.
                       Loads fonts, renders header, wraps all pages in <main>.

  page.tsx             Server Component. Route: /
                       Renders <TasksClient />.

  tasks/[id]/
    page.tsx           Server Component. Route: /tasks/:id
                       Reads id from URL, fetches task from API, renders detail card.
                       Returns 404 if task not found.
```

### Component responsibilities

```
TasksClient.tsx         Client Component.
                        - Owns the task list state
                        - Fetches all tasks on mount (useEffect)
                        - Handles add, delete, and completion operations
                        - Shows loading spinner, inline feedback messages
                        - Renders the task table with checkbox column and AddTaskForm
                        - Toggle to show/hide completed tasks

AddTaskForm.tsx         Client Component.
                        - Owns title and deadline input state
                        - Validates title not empty before calling parent's onAdd
                        - Shows inline field-level error messages
                        - Disabled during submit

DeleteTaskButton.tsx    Client Component.
                        - Used only on the task detail page
                        - Calls DELETE API, then redirects to home on success
                        - Shows spinner during request, error on failure

CompleteTaskButton.tsx  Client Component.
                        - Used only on the task detail page
                        - Toggles IsCompleted via PATCH API, then calls router.refresh()
                        - Shows "Mark complete" or "Mark incomplete" based on current state
                        - Shows spinner during request, error on failure
```

### API calls

All fetch calls go through `src/lib/api.ts`. This is the only place
that knows the API base URL and constructs request shapes.

```
getTasks()            GET /api/tasks                Used by TasksClient (client-side)
getTask(id)           GET /api/tasks/:id            Used by tasks/[id]/page.tsx (server-side)
createTask()          POST /api/tasks               Used by TasksClient via AddTaskForm callback
deleteTask(id)        DELETE /api/tasks/:id         Used by TasksClient and DeleteTaskButton
completeTask(id, bool) PATCH /api/tasks/:id/complete Used by TasksClient and CompleteTaskButton
```

**Known issue:** `getTask()` uses `NEXT_PUBLIC_API_URL` which resolves to `localhost`
from a server-side Node.js process. Breaks in production. See GitHub issue #1.

### Environment variables

```
NEXT_PUBLIC_API_URL     Base URL for API calls. Defined in frontend/.env.local.
                        Currently: http://localhost:5115
                        NEXT_PUBLIC_ prefix = available in both browser and server code.
```

---

## How a request flows end to end

**Opening the home page:**
```
1. Browser requests http://localhost:3000/
2. Next.js renders layout.tsx + page.tsx on server (Server Components)
3. HTML shell sent to browser
4. Browser loads TasksClient.tsx JavaScript
5. TasksClient useEffect fires: GET http://localhost:5115/api/tasks
6. .NET queries SQLite, returns JSON array
7. React renders the task table
```

**Adding a task:**
```
1. User fills form and clicks "Add Task"
2. AddTaskForm validates input, calls onAdd() callback
3. TasksClient calls createTask() in api.ts
4. POST http://localhost:5115/api/tasks with JSON body
5. .NET inserts row in SQLite, returns new task JSON
6. TasksClient prepends task to local state
7. React re-renders the list - no page reload
```

**Viewing a task detail:**
```
1. Browser requests http://localhost:3000/tasks/42
2. Next.js runs tasks/[id]/page.tsx on the server
3. Server calls getTask(42): GET http://localhost:5115/api/tasks/42
4. .NET returns task JSON
5. Server renders HTML with task data
6. Browser receives complete HTML - no client-side fetch needed
```

---

## Known architectural limitations

These are tracked as GitHub issues:

| Issue | Description |
|-------|-------------|
| [#1](https://github.com/hydraInsurgent/Tasklog/issues/1) | CORS and server-side localhost URL break app outside dev |
| [#2](https://github.com/hydraInsurgent/Tasklog/issues/2) | Optimistic delete and feedback timer state bugs |
| [#3](https://github.com/hydraInsurgent/Tasklog/issues/3) | Fragile database path and silent API URL failure |

---

## What does not exist yet

These are planned but not built:

- Projects / task grouping
- Filtering and pagination
- Authentication
- Production deployment configuration
