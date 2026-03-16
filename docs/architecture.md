# Tasklog Architecture

This document describes the current system structure.
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
│       │   ├── ProjectLayout.tsx  Sidebar + task list wrapper, owns activeView (Client Component)
│       │   ├── ProjectSidebar.tsx Project navigation and management (Client Component)
│       │   ├── TasksClient.tsx    Task list + add form, filters by activeView (Client Component)
│       │   ├── AddTaskForm.tsx    Add task form with optional project dropdown (Client Component)
│       │   ├── AssignProjectButton.tsx  Project reassignment on detail page (Client Component)
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
├── UI-SPEC.md                     Design tokens and UX rules for v2 frontend
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
ProjectsController       No business logic beyond input checking.
    │
    ▼
TasklogDbContext         EF Core context. Direct DbSet access - no repository layer.
    │
    ▼
TasklogDatabase.db       SQLite file. Two tables: Tasks, Projects.
```

### Data model

```
Projects
  Id          INTEGER  primary key, autoincrement
  Name        TEXT     not null
  CreatedAt   TEXT     not null  (ISO 8601 datetime string)

Tasks
  Id          INTEGER  primary key, autoincrement
  Title       TEXT     not null
  Deadline    TEXT     nullable  (ISO 8601 date string)
  CreatedAt   TEXT     not null  (ISO 8601 datetime string)
  IsCompleted INTEGER  not null  default 0  (boolean: 0 = pending, 1 = complete)
  CompletedAt TEXT     nullable  (ISO 8601 datetime string, set when marked complete, cleared on un-complete)
  ProjectId   INTEGER  nullable  foreign key -> Projects.Id (null = Inbox)

Labels
  Id          INTEGER  primary key, autoincrement
  Name        TEXT     not null
  ColorIndex  INTEGER  not null  (0-9, maps to VIBGYOR palette in frontend)
  CreatedAt   TEXT     not null  (ISO 8601 datetime string)

LabelTaskModel  (join table - implicit many-to-many)
  LabelsId    INTEGER  not null  foreign key -> Labels.Id  (cascade delete)
  TasksId     INTEGER  not null  foreign key -> Tasks.Id   (cascade delete)
```

### API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/tasks` | All tasks, ordered by `CreatedAt` descending |
| GET | `/api/tasks/{id}` | Single task by ID. 404 if not found |
| POST | `/api/tasks` | Create task. Body: `{ title, deadline?, projectId? }` |
| DELETE | `/api/tasks/{id}` | Delete task. 204 on success, 404 if not found |
| PATCH | `/api/tasks/{id}/complete` | Mark task complete or incomplete. Body: `{ isCompleted: bool }`. Returns updated task |
| PATCH | `/api/tasks/{id}/project` | Reassign task to a project or Inbox. Body: `{ projectId: int? }` |
| GET | `/api/projects` | All projects, ordered by name |
| POST | `/api/projects` | Create project. Body: `{ name: string }`. Returns created project |
| PATCH | `/api/projects/{id}` | Rename project. Body: `{ name: string }`. Returns updated project |
| DELETE | `/api/projects/{id}` | Delete project and cascade delete all its tasks. 204 on success |
| GET | `/api/labels` | All labels, ordered by name |
| POST | `/api/labels` | Create label. Body: `{ name, colorIndex }`. Returns created label |
| PATCH | `/api/labels/{id}` | Update label name and/or color. Body: `{ name, colorIndex }`. Returns updated label |
| DELETE | `/api/labels/{id}` | Delete label. Unlinks from all tasks (does not delete tasks). 204 on success |
| PATCH | `/api/tasks/{id}/labels` | Replace task's label set. Body: `{ labelIds: int[] }`. Returns updated task |

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
                       Renders <ProjectLayout />.

  tasks/[id]/
    page.tsx           Server Component. Route: /tasks/:id
                       Fetches task and projects from API, renders detail card.
                       Returns 404 if task not found. Projects fallback to [] silently.
```

### Component responsibilities

```
ProjectLayout.tsx       Client Component.
                        - Owns activeView state ("all" | "inbox" | projectId)
                        - Fetches projects on mount
                        - Handles create/rename/delete project actions
                        - Shows error feedback banner for project operation failures
                        - Renders ProjectSidebar and TasksClient side by side
                        - On mobile: renders sidebar as a slide-in drawer

ProjectSidebar.tsx      Client Component.
                        - Renders "All Tasks", "Inbox", and project list
                        - Highlights the active selection
                        - Create project: inline input at the bottom
                        - Rename project: opens an Edit Project modal dialog
                        - Delete project: opens a confirmation dialog (warns about cascade)
                        - Delegates all data operations to ProjectLayout via callbacks

TasksClient.tsx         Client Component.
                        - Owns the task list state
                        - Fetches all tasks on mount (useEffect)
                        - Filters tasks client-side by activeView prop
                        - Handles add, delete, and completion operations
                        - Shows loading spinner, inline feedback messages
                        - Renders task table with AddTaskForm below
                        - Project column shown only in "all" view
                        - Toggle to show/hide completed tasks

AddTaskForm.tsx         Client Component.
                        - Owns title, deadline, and project dropdown state
                        - Project dropdown pre-selected to active project view
                        - Syncs dropdown when defaultProjectId prop changes
                        - Validates title not empty before calling parent's onAdd
                        - Shows inline field-level error messages

DeleteTaskButton.tsx    Client Component.
                        - Used only on the task detail page
                        - Calls DELETE API, then redirects to home on success
                        - Shows spinner during request, error on failure

CompleteTaskButton.tsx  Client Component.
                        - Used only on the task detail page
                        - Toggles IsCompleted via PATCH API, then calls router.refresh()
                        - Shows "Mark complete" or "Mark incomplete" based on current state
                        - Shows spinner during request, error on failure

AssignProjectButton.tsx Client Component.
                        - Used only on the task detail page
                        - Dropdown to reassign task to a project or Inbox
                        - Calls PATCH /api/tasks/{id}/project, then router.refresh()
                        - State only updates after API confirms (no optimistic update)

LabelChip.tsx           Client Component.
                        - Shared colored pill chip for label display
                        - Optional onRemove callback renders an × button
                        - Background color derived from label.colorIndex via labelColor()

AssignLabelsButton.tsx  Client Component.
                        - Used only on the task detail page
                        - Shows current labels as LabelChip components with remove buttons
                        - Select dropdown to add unassigned labels
                        - Calls PATCH /api/tasks/{id}/labels on each change, then router.refresh()

LabelsClient.tsx        Client Component.
                        - Used on the /labels page
                        - Full CRUD: fetch, create, inline rename, color picker, delete
                        - Desktop: table layout. Mobile: card list.

ColorPicker.tsx         Client Component.
                        - 10-color swatch grid popover
                        - Used by LabelsClient for color assignment/editing

FilterPanel.tsx         Client Component.
                        - Popover opened from the task list header three-dot button
                        - Filter sections: Labels (multi-select chips), Project (checkboxes), Date (radio)
                        - Apply and Clear buttons; draft state committed only on Apply
```

### API calls

All fetch calls go through `src/lib/api.ts`. This is the only place
that knows the API base URL and constructs request shapes.

```
getTasks()                GET /api/tasks                  Used by TasksClient (client-side)
getTask(id)               GET /api/tasks/:id              Used by tasks/[id]/page.tsx (server-side)
createTask()              POST /api/tasks                 Used by TasksClient via AddTaskForm callback
deleteTask(id)            DELETE /api/tasks/:id           Used by TasksClient and DeleteTaskButton
completeTask(id, bool)    PATCH /api/tasks/:id/complete   Used by TasksClient and CompleteTaskButton
assignTaskProject(id, pid) PATCH /api/tasks/:id/project   Used by AssignProjectButton
getProjects()             GET /api/projects               Used by ProjectLayout and tasks/[id]/page.tsx
createProject(name)       POST /api/projects              Used by ProjectLayout
renameProject(id, name)   PATCH /api/projects/:id         Used by ProjectLayout
deleteProject(id)         DELETE /api/projects/:id        Used by ProjectLayout
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

- Pagination
- Authentication
- Production deployment configuration
