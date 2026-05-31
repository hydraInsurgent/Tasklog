# Tasklog Architecture

This document describes the current system structure.
It is the primary reference for any AI assistant or contributor working in this repo.

---

## System Overview

Tasklog is a three-process application as of v2.10. The backend, frontend, and MCP server
run as separate processes. They share no code; communication is HTTP.

```
Browser (LAN-only)
  │
  ├── GET http://localhost:3000        Next.js frontend (React, Tailwind)
  │     │
  │     └── fetch http://localhost:5115/api/...    .NET Web API (ASP.NET Core, EF Core)
  │                                                        │
  │                                                   SQLite database
  │                                               (TasklogDatabase.db)
  └── GET http://localhost:3000/tasks/[id]
        └── Server Component fetches from API on the server, returns rendered HTML

claude.ai (public, web + mobile)
  │
  └── HTTPS https://mcp-tasklog.manudubey.in/mcp
        │
        └── Cloudflare Tunnel  →  cloudflared (Termux)
                                       │
                                       └── localhost:5180  →  tasklog-mcp (Node, proot)
                                                                  │
                                                                  ├── OAuth 2.1 endpoints
                                                                  │   (/authorize, /token,
                                                                  │    /register, /.well-known/*)
                                                                  │   backed by mcp/data/auth.db
                                                                  │
                                                                  └── GET localhost:5115/api/...
                                                                      (Tasklog API, LAN-only)
```

The MCP server is the only public surface. The `/api` and frontend remain LAN-only.

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
│       ├── Services/              Pure domain helpers (RecurrenceRule - parse/validate/advance RRULE + OccursOn schedule membership, v2.14.0/#73; HabitStreak - schedule-aware day streak from check-in dates, v2.16.0/#73; HabitFrequency - "x times a week" weekly count/streak/week-status, v2.18.0/#75)
│       ├── Properties/            Launch settings (ports)
│       ├── Program.cs             App startup and service registration
│       ├── appsettings.json       Config (connection string, logging)
│       └── TasklogDatabase.db     SQLite data file
│
├── mcp/                           Node/TypeScript MCP server (v2.10+)
│   ├── package.json               Dependencies, build/test scripts
│   ├── tsconfig.json              strict, NodeNext, target ES2022
│   ├── src/
│   │   ├── server.ts              Hono HTTP entry, middleware wiring
│   │   ├── config.ts              Env var loading + production validation
│   │   ├── api-client.ts          Typed client for the Tasklog .NET API
│   │   ├── tools/                 22 MCP tools wrapping every API endpoint
│   │   │   ├── tasks.ts           13 task tools (list[+filters]/get/create/update/
│   │   │   │                      delete/set-completion/assign-project/set-labels/add-comment +
│   │   │   │                      bulk-set-completion/bulk-assign-to-project/bulk-set-deadline/bulk-set-priority)
│   │   │   ├── projects.ts        4 project tools
│   │   │   ├── labels.ts          4 label tools
│   │   │   ├── registry.ts        Aggregates and registers all tools
│   │   │   └── result.ts          runTool() helper for error mapping
│   │   └── oauth/                 OAuth 2.1 authorization server
│   │       ├── store.ts           SQLite-backed: clients/codes/access/refresh
│   │       ├── crypto.ts          opaqueToken(), pkceVerify()
│   │       ├── crypto.test.ts     node:test unit tests for crypto layer
│   │       ├── well-known.ts      RFC 9728 + RFC 8414 discovery endpoints
│   │       ├── register.ts        RFC 7591 Dynamic Client Registration
│   │       ├── authorize.ts       /authorize HTML page + signed flow cookie
│   │       ├── github.ts          GitHub OAuth upstream callback
│   │       ├── token.ts           /token (auth_code + refresh_token grants)
│   │       └── middleware.ts      Origin / Protocol-Version / Bearer auth
│   └── data/                      Runtime state (auth.db); gitignored
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
│       │   ├── CompleteTaskButton.tsx  Complete/incomplete toggle on detail page (Client Component)
│       │   ├── EditTaskModal.tsx   Full task edit (title/deadline/project/labels), diff-and-fan-out save (Client Component, v2.10.2)
│       │   ├── DeadlinePopover.tsx Quick deadline preset picker on the deadline pill (Client Component, v2.10.2)
│       │   ├── BulkActionsBar.tsx  Sticky bulk-actions bar for multi-select mode (Client Component, v2.10.4)
│       │   ├── PriorityDot.tsx    Small colored priority dot (P1-P3) next to a task title (v2.10.5)
│       │   ├── RecurrencePicker.tsx  Recurrence builder (none/daily/weekly/monthly + nth-weekday/interval/Ends) on the add/edit forms; `isHabit` prop un-gates it with no deadline (v2.14.0+, #75)
│       │   ├── RecurringBadge.tsx Repeat glyph + human label for recurring tasks (v2.14.0)
│       │   ├── QuickAddInput.tsx  Quick-add title field: inline token highlight overlay + #/@/! autosuggest; Escape/tap un-recognizes a token (#73). v2.15.0+
│       │   ├── TaskSheet.tsx      Chip-driven create+edit sheet (modal/bottom-sheet); chips derived from the title, Escape-to-dismiss; replaces AddTaskForm+EditTaskModal (#73). For habits: Due chip hidden + the Schedule chip is a two-mode picker (specific days OR x-times-a-week stepper), saving recurrence XOR weeklyTarget (#75)
│       │   ├── BoardView/BoardCard.tsx  Board renderer: columns from groupTasksForBoard (lib/board.ts) + the rich card (#73)
│       │   ├── TaskDoneControl.tsx One done-control for list+card+board: complete checkbox, or a daily check-in toggle for a habit (habits are never completed) (#73)
│       │   ├── HabitsPanel.tsx    Right-side habits panel beside the task list, shares habit state with ProjectLayout (#73)
│       │   ├── HabitsClient.tsx   Full /habits view: fetch + poll habits, optimistic done-today toggle (Client Component, v2.16.0)
│       │   └── HabitCard.tsx      One habit: specific-days view (schedule label, day streak, 7-day dot row) OR frequency view (n/x this week, week streak, coloured recent-week strip) keyed on weeklyTarget; shared CheckInButton (v2.16.0/#73/#75)
│       │   (list is representative - other components: TaskCard, FilterPanel, LabelsClient, etc.)
│       └── lib/
│           ├── api.ts             Typed API call functions (used by both server and client)
│           ├── quickAdd.ts        Pure parseQuickAdd(): NL title -> {deadline, recurrence, project, labels, priority} + token spans (chrono-node for dates; recurrence/tokens hand-rolled) (v2.15.0)
│           └── deadlinePresets.ts Pure resolvePreset() for the quick-deadline popover (v2.10.2)
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

**Runtime:** .NET 10 / ASP.NET Core Web API
**Database:** SQLite via Entity Framework Core 9
**Default ports:** HTTP `5115`, HTTPS `7243` (see `launchSettings.json`)

### Layers

```
HTTP request
    │
    ▼
Controllers              Tasks / Projects / Labels / Comments / CheckIns / Habits.
                         Handle routing, validation, HTTP response codes; no business
                         logic beyond input checking (pure helpers like RecurrenceRule
                         and HabitStreak live in Services/).
    │
    ▼
TasklogDbContext         EF Core context. Direct DbSet access - no repository layer.
    │
    ▼
TasklogDatabase.db       SQLite file. Tables: Tasks, Projects, Labels, LabelTaskModel,
                         Comments, CheckIns.
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
  Description TEXT     nullable  (optional free-text notes, <= 2000 chars; null = none) (v2.11.0)
  Deadline    TEXT     nullable  (ISO 8601 datetime. Midnight = date-only (due end of day); a non-midnight time = a specific moment. v2.12.0)
  CreatedAt   TEXT     not null  (ISO 8601 datetime string)
  IsCompleted INTEGER  not null  default 0  (boolean: 0 = pending, 1 = complete)
  CompletedAt TEXT     nullable  (ISO 8601 datetime string, set when marked complete, cleared on un-complete)
  ProjectId   INTEGER  nullable  foreign key -> Projects.Id (null = Inbox)
  Priority    INTEGER  not null  default 4  (Todoist P1-P4: 1=urgent .. 4=none; existing rows migrated to 4) (v2.10.5)
  Recurrence  TEXT     nullable  (RRULE-shaped rule; null = does not repeat. v2.14.0: daily/every-N/weekly-on-weekdays/monthly-on-day. v2.14.1 adds nth-weekday "BYDAY=3TH", last/from-end "BYMONTHDAY=-1", weekly/monthly INTERVAL>1, and end conditions UNTIL/COUNT)
  SeriesId    TEXT     nullable  (Guid linking all occurrences of a repeating task; null for one-offs) (v2.14.0)
  IsHabit     INTEGER  not null  default 0  (boolean: 1 = tracked as a daily habit. Existing rows migrate to 0 = false, the CLR zero, so NO HasDefaultValue is needed - contrast Priority's non-zero default) (v2.16.0)
  WeeklyTarget INTEGER nullable  ("x times a week" habit frequency, 1-7; null = not a frequency habit. A habit is scheduled on specific days (Recurrence) OR by a WeeklyTarget, never both - the controller clears one when the other is set. Nullable int -> existing rows migrate to null, no HasDefaultValue) (v2.18.0)

  (response-only) isRecurring  bool  Recurrence != null. NOT a column; [NotMapped] getter on TaskModel. (v2.14.0)
  (response-only) dueStatus  string  computed from Deadline vs now. A timed deadline goes
                  "overdue" once its instant passes; a midnight/date-only one stays "today"
                  all day then overdue next day. NOT a column. [NotMapped] getter on TaskModel,
                  derived from Deadline relative to DateTime.Today at serialization time.
                  One of: overdue / today / this_week (through upcoming Sunday) / later / none. (v2.10.3)

Labels
  Id          INTEGER  primary key, autoincrement
  Name        TEXT     not null
  ColorIndex  INTEGER  not null  (0-9, maps to VIBGYOR palette in frontend)
  CreatedAt   TEXT     not null  (ISO 8601 datetime string)

LabelTaskModel  (join table - implicit many-to-many)
  LabelsId    INTEGER  not null  foreign key -> Labels.Id  (cascade delete)
  TasksId     INTEGER  not null  foreign key -> Tasks.Id   (cascade delete)

Comments  (v2.13.0)
  Id          INTEGER  primary key, autoincrement
  Body        TEXT     not null  (free text, <= 2000 chars)
  CreatedAt   TEXT     not null  (ISO 8601 datetime string)
  TaskId      INTEGER  not null  foreign key -> Tasks.Id  (cascade delete)

CheckIns  (v2.16.0 - one per habit per day)
  Id          INTEGER  primary key, autoincrement
  CheckInDate TEXT     not null  (date-only, local midnight - the day the habit was done)
  CreatedAt   TEXT     not null  (ISO 8601 datetime string)
  TaskId      INTEGER  not null  foreign key -> Tasks.Id  (cascade delete)
  UNIQUE (TaskId, CheckInDate)   (makes "done today" idempotent - one row per habit per day)
```

### API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/tasks` | Filtered/sorted task list. Filter params: `projectIds` (repeated key), `inbox`, `labelIds` (repeated key), `dueBefore`, `dueAfter`, `createdAfter`, `createdBefore`, `completed`, `text`, `priorities` (repeated key, P1-P4). Sort: `sort` (`created`/`deadline`/`priority`, default `created`) + `order` (`asc`/`desc`, default `desc`; deadline sorts nulls-last, priority asc = P1 first). `limit` caps to the first N after sorting (`<1` → 400). Arrays use repeated keys, not comma-separated. AND across dimensions, OR within id arrays. No params = all tasks, newest-first. `inbox=true` + `projectIds` → 400. |
| GET | `/api/tasks/{id}` | Single task by ID, including its `comments[]` (newest first). 404 if not found |
| GET | `/api/tasks/{taskId}/comments` | List a task's comments, newest first. 404 if task missing |
| POST | `/api/tasks/{taskId}/comments` | Add a comment. Body: `{ body }` (non-empty, <= 2000). 201 with the created comment; 400 bad body; 404 task missing |
| DELETE | `/api/tasks/{taskId}/comments/{id}` | Delete a comment under that task. 204; 404 if not found |
| POST | `/api/tasks` | Create task. Body: `{ title, deadline?, projectId?, priority?, description?, recurrence?, isHabit?, weeklyTarget? }`. priority is 1-4 (default 4 = none); description <= 2000 chars (blank → null); `recurrence` is an RRULE-shaped rule that stamps a SeriesId - it requires a deadline UNLESS the task `isHabit` (a habit schedules itself with no anchor, v2.18.0); `isHabit` defaults false; `weeklyTarget` (1-7) is the "x times a week" habit frequency (habits only, mutually exclusive with `recurrence` - 400 if both, if non-habit, or out of 1-7). 400 if out of range |
| PATCH | `/api/tasks/{id}` | Partial update of title, deadline, priority, description, recurrence, isHabit, and/or weeklyTarget. JSON body, present-key detection: omit=keep, `deadline: null`/`description: null`/blank/`recurrence: null`/`weeklyTarget: null`=clear, value=set. `isHabit` is processed first so the effective habit state gates the rest (turning it off keeps past check-ins but clears WeeklyTarget). Setting recurrence requires a deadline UNLESS the task is a habit (v2.18.0), assigns a SeriesId, and clears WeeklyTarget; clearing recurrence nulls Recurrence + SeriesId. Setting `weeklyTarget` (1-7, habits only) clears Recurrence + SeriesId. Recurrence and weeklyTarget are mutually exclusive - sending both string+number in one PATCH is 400. priority must be 1-4; description <= 2000. 400 on empty title / bad date / bad priority / too-long description / unsupported recurrence / non-boolean isHabit / weeklyTarget out of 1-7 or on a non-habit. Returns the updated task |
| DELETE | `/api/tasks/{id}` | Delete task. 204 on success, 404 if not found |
| PATCH | `/api/tasks/{id}/complete` | Mark task complete or incomplete. Body: `{ isCompleted: bool }`. Returns the (completed) task. For a recurring task, completing it also spawns the next occurrence (deadline advanced per the rule; title/project/labels/priority/description/recurrence carried under the same SeriesId) and logs a completion comment on the finished one - UNLESS an end condition is reached (v2.14.1: UNTIL date passed or COUNT occurrences exist), in which case the series stops and a "series complete" comment is logged instead. COUNT is evaluated by counting rows with the same SeriesId. Bulk-complete does not spawn |
| PATCH | `/api/tasks/{id}/project` | Reassign task to a project or Inbox. Body: `{ projectId: int?, projectName?: string }`. projectName is resolved by name (case-insensitive, exact) and wins over projectId; 0/multiple matches → 400 |
| POST | `/api/tasks/bulk` | Apply one operation to many tasks in one transaction. Body: `{ operation: "complete" \| "assignProject" \| "setDeadline" \| "setPriority", taskIds: int[], data?: { isCompleted?, projectId?, projectName?, deadline?, priority? } }`. assignProject accepts a project name (resolved, wins over id). No bulk delete. Unknown ids skipped; returns the affected tasks. 400 on empty ids / unknown op / invalid data (missing/ambiguous project name, priority out of 1-4) |
| GET | `/api/projects` | All projects, ordered by name |
| POST | `/api/projects` | Create project. Body: `{ name: string }`. Returns created project |
| PATCH | `/api/projects/{id}` | Rename project. Body: `{ name: string }`. Returns updated project |
| DELETE | `/api/projects/{id}` | Delete project and cascade delete all its tasks. 204 on success |
| GET | `/api/labels` | All labels, ordered by name |
| POST | `/api/labels` | Create label. Body: `{ name, colorIndex }`. Returns created label |
| PATCH | `/api/labels/{id}` | Update label name and/or color. Body: `{ name, colorIndex }`. Returns updated label |
| DELETE | `/api/labels/{id}` | Delete label. Unlinks from all tasks (does not delete tasks). 204 on success |
| PATCH | `/api/tasks/{id}/labels` | Replace task's label set. Body: `{ labelIds?: int[], labelNames?: string[] }`. labelNames is resolved by name and wins over labelIds; 0/multiple matches → 400. Empty/absent both clear. Returns updated task |
| GET | `/api/tasks/{taskId}/checkins` | List a habit's check-in dates, newest first. 404 if task missing (v2.16.0) |
| POST | `/api/tasks/{taskId}/checkins` | Log a check-in. Body: `{ date? }` (default today, reduced to date-only). Idempotent: existing day → 200 with that check-in; new day → 201. 404 if task missing (v2.16.0) |
| DELETE | `/api/tasks/{taskId}/checkins` | Undo a check-in. Query `?date=yyyy-MM-dd` (default today). 204 on success; 404 if there was no check-in that day (v2.16.0) |
| GET | `/api/habits` | Habit dashboard: every task where `IsHabit`, each as `{ task, currentStreak, doneToday, recentCheckIns[], weeklyTarget, thisWeekCount, recentWeeks[] }` (last ~90 days of check-ins, newest-first). `currentStreak` is unit-aware: consecutive **days** for a specific-days/daily habit (grace through yesterday), consecutive **weeks** with >= 1 check-in for a frequency habit (`weeklyTarget != null`, v2.18.0). For frequency habits, `thisWeekCount` = days done this calendar week (Mon-Sun) and `recentWeeks[]` = the last 8 weeks `{ weekStart, count, status }` (status met/partial/none); these three fields are null for non-frequency habits. Ordered newest-created first (v2.16.0) |

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

  labels/
    page.tsx           Server Component. Route: /labels. Renders <LabelsClient /> (client-fetched).

  habits/
    page.tsx           Server Component. Route: /habits. Renders <HabitsClient /> (client-fetched). (v2.16.0)
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
getHabits()               GET /api/habits                 Used by HabitsClient (v2.16.0)
addCheckIn(id, date?)     POST /api/tasks/:id/checkins    Used by HabitsClient (done-today toggle) (v2.16.0)
removeCheckIn(id, date?)  DELETE /api/tasks/:id/checkins  Used by HabitsClient (undo) (v2.16.0)
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

## MCP server (Node/TypeScript)

**Runtime:** Node.js 20+ via `tsx` in dev, compiled JS via `tsc` in production
**HTTP framework:** Hono with `@hono/node-server`
**MCP SDK:** `@modelcontextprotocol/sdk` (Streamable HTTP transport, stateful mode)
**OAuth:** hand-rolled, conforming to OAuth 2.1 + RFC 7591/7636/8414/8707/9728
**Default port:** `5180`
**Public URL (production):** `https://mcp-tasklog.manudubey.in` via Cloudflare Tunnel

### Endpoint surface

```
GET  /                                          health/identity JSON
POST /mcp                                       JSON-RPC (initialize, tools/*, etc.)
GET  /mcp                                       405 Method Not Allowed (we do not push)
GET  /.well-known/oauth-protected-resource      RFC 9728 metadata
GET  /.well-known/oauth-authorization-server    RFC 8414 metadata
POST /register                                  RFC 7591 Dynamic Client Registration
GET  /authorize                                 OAuth user-consent page (renders HTML)
GET  /auth/github/callback                      GitHub OAuth upstream callback
POST /token                                     auth_code and refresh_token grants
```

### Middleware on /mcp (applied in order)

| Middleware | Purpose | Failure response |
|---|---|---|
| `originMiddleware` | Origin header allow-list (claude.ai, localhost in dev) | 403 |
| `protocolVersionMiddleware` | `MCP-Protocol-Version: 2025-06-18` if present | 400 |
| `bearerAuthMiddleware` | Validate access token, check audience claim | 401 + RFC 9728 `WWW-Authenticate` |

### Tool layer

22 MCP tools across three families (tasks: 14, projects: 4, labels: 4). The task family includes four bulk tools (`bulk_set_completion`, `bulk_assign_to_project`, `bulk_set_deadline`, `bulk_set_priority`) backed by the single `POST /api/tasks/bulk` endpoint, `add_task_comment` (comments are read back via `get_task`), and `log_habit_checkin` (mark a habit done for a day; idempotent; v2.16.0). `assign_task_to_project` / `bulk_assign_to_project` / `set_task_labels` accept a name as an alternative to an id (resolved server-side). `create_task` and `update_task` accept an RRULE-shaped `recurrence` string (v2.14.0), an `isHabit` flag (v2.16.0), and a `weeklyTarget` (1-7) for "x times a week" habits (v2.18.0); completing a recurring task via `set_task_completion` spawns the next occurrence server-side, so no separate recurrence tool exists. Each tool is a thin wrapper around the corresponding Tasklog `/api` endpoint via `api-client.ts`. Input schemas use Zod and are inlined per tool. The `runTool()` helper in `result.ts` converts thrown `ApiError`s into MCP `isError: true` tool results (not JSON-RPC protocol errors), so the LLM can see and react to failures.

The `list_tasks` tool accepts an optional filter object (project, inbox, labels, deadline range, completion, title substring) that `api-client.ts` serializes into a query string on `GET /api/tasks`. Completion is a single `set_task_completion(id, isCompleted)` tool - the earlier `complete_task` / `uncomplete_task` split was consolidated in v2.10.1.

### OAuth data model

Separate SQLite file at `mcp/data/auth.db` (not the Tasklog DB). Four tables:

```
clients
  client_id      TEXT  primary key (opaque, generated by /register)
  client_name    TEXT
  redirect_uris  TEXT  JSON-encoded array
  created_at     INTEGER  unix epoch seconds

auth_codes
  code                  TEXT  primary key (one-use, consumed by /token)
  client_id             TEXT
  redirect_uri          TEXT
  code_challenge        TEXT  S256 base64url
  code_challenge_method TEXT
  scope                 TEXT
  resource              TEXT  RFC 8707 resource indicator
  github_user           TEXT  verified GitHub login
  expires_at            INTEGER

access_tokens
  token        TEXT  primary key (opaque, 32-byte hex)
  client_id    TEXT
  audience     TEXT  must match MCP_PUBLIC_URL on validation
  github_user  TEXT
  scope        TEXT
  expires_at   INTEGER  TTL 1h

refresh_tokens
  same shape as access_tokens, TTL 30d, rotated on every /token use
```

`consume()` queries on `auth_codes` and `refresh_tokens` are transactional read+delete so replay attacks fail.

### Authorization flow

```
claude.ai opens /authorize in browser
  -> we validate params, set signed flow cookie, render "Log in with GitHub"
  -> user clicks, goes to GitHub
  -> GitHub redirects to /auth/github/callback
  -> we exchange code with GitHub, fetch user identity
  -> we check login against ALLOWED_GH_USERS env var
  -> we mint our auth code, 302 to claude.ai's callback
claude.ai POSTs /token with code + PKCE verifier
  -> we verify PKCE, issue access + refresh tokens
claude.ai POSTs /mcp with Authorization: Bearer <access_token>
  -> middleware validates token + audience
  -> MCP transport handles tools/list, tools/call
```

See [docs/learnings/oauth-2-1-for-mcp.md](learnings/oauth-2-1-for-mcp.md) for the full mechanics, [docs/learnings/mcp-protocol.md](learnings/mcp-protocol.md) for what MCP itself is, and [guides/mcp-server-setup.md](../guides/mcp-server-setup.md) for the end-to-end setup walkthrough.

### Environment variables (read by config.ts)

| Var | Purpose | Required in prod |
|---|---|---|
| `PORT` | HTTP listen port (default 5180) | no |
| `TASKLOG_API_URL` | Where to reach the Tasklog API | no (default localhost:5115) |
| `MCP_PUBLIC_URL` | Canonical public URL; used as token audience | yes |
| `GITHUB_CLIENT_ID` | Upstream GitHub OAuth App | yes |
| `GITHUB_CLIENT_SECRET` | Same; secret | yes |
| `ALLOWED_GH_USERS` | Comma-separated GitHub login allow-list | yes |
| `SESSION_SECRET` | HMAC key for signed flow cookies | yes |
| `NODE_ENV` | `production` enables strict env validation | implicit |
| `AUTH_DB_PATH` | SQLite path (default data/auth.db) | no |

In production, `config.ts` throws on startup if any required var is missing or still at its dev default. Secrets live in `/root/.tasklog-mcp.env` (chmod 600) inside proot, sourced by the runit service script.

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

**Asking Claude to create a task (post v2.10):**
```
1. User types in claude.ai mobile: "add task: review PR by Friday"
2. claude.ai sends prompt to its LLM, which decides to invoke our connector
3. claude.ai opens TLS connection to https://mcp-tasklog.manudubey.in/mcp
4. Cloudflare edge terminates TLS, forwards over the tunnel to phone:5180
5. tasklog-mcp middleware: Origin OK (claude.ai), Bearer token validated, audience matches
6. McpServer routes tools/call -> create_task handler
7. Handler POSTs http://localhost:5115/api/tasks (LAN-only call inside the phone)
8. Tasklog .NET API inserts row in SQLite, returns new task JSON
9. Handler wraps the result in a CallToolResult content block
10. Response flows back: phone -> tunnel -> Cloudflare edge -> claude.ai -> LLM -> user
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
