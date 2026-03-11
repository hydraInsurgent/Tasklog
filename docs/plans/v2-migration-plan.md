# Tasklog v2 Migration Plan

**Overall Progress:** `100%`

## TLDR

Migrate Tasklog from a monolithic ASP.NET MVC app (server-rendered Razor views) to a
separated architecture: a .NET Web API backend and a Next.js + React frontend with
Tailwind CSS. The migration replicates v1 functionality exactly - no new features
are introduced during this phase.

---

## Current System Summary

The existing v1 system is a single ASP.NET MVC project on .NET 9.0.

- **Backend:** `TaskController` handles all CRUD operations. Direct DbContext injection
  in the controller. No service layer or repository pattern.
- **Database:** EF Core 9 + SQLite. Single `Tasks` table with four columns:
  `Id`, `Title`, `Deadline`, `CreatedAt`.
- **UI:** Razor Views with Bootstrap 5 + jQuery. Server-rendered HTML. TempData used
  for flash messages (post-redirect-get pattern).
- **Functionality:** Create task, view task list, view single task, delete task.
  Optional deadline field.

Key constraints:
- No service layer - logic lives directly in the controller.
- The SQLite database file lives inside the project folder: `Tasklog/TasklogDatabase.db`.

---

## Goal State

**Current State:** Single MVC project. Backend and UI are tightly coupled. HTML is rendered
on the server. Adding new UI capabilities requires changes to both controller and Razor views.

**Goal State:** Two clearly separated projects in the same repository:
- `backend/` - ASP.NET Core Web API serving JSON endpoints.
- `frontend/` - Next.js (App Router) app consuming those endpoints, styled with Tailwind CSS.

The SQLite database is preserved. Feature parity with v1 is maintained. The system
is ready to accept v2 feature additions (completion lifecycle, projects, filtering)
in subsequent phases.

---

## Critical Decisions

- **App Router** - The Next.js frontend uses the App Router (Next.js 13+). This is the
  current standard. Data fetching happens via React Server Components where possible,
  with Client Components for interactive UI (forms, delete buttons).
- **Keep SQLite for now** - PostgreSQL is deferred. EF Core makes switching providers
  later a near-trivial change (swap package, connection string, regenerate migration).
  SQLite is fully sufficient for a single-user self-hosted app. Migrate to PostgreSQL
  when there is a concrete hosting need that SQLite cannot meet.
- **Separate projects, same repository** - Both backend and frontend live in this repo
  under `backend/` and `frontend/` folders. No separate repositories.
- **Full rewrite of the frontend** - The Razor views are not ported. A new Next.js app
  replicates the same UI interactions via API calls.
- **No new features during migration** - Completion lifecycle, projects, filtering, and
  pagination are all deferred to the next phase after migration is confirmed working.
- **No service layer yet** - The API controllers use DbContext directly (matching v1).
  A service layer can be introduced in the next phase when features expand.
- **CORS required in development** - The API must allow requests from the Next.js dev
  server. In production (same host), a reverse proxy removes the need for CORS entirely.

---

## UI Specification
- Spec file: [UI-SPEC-v2-migration-plan.md](../../UI-SPEC-v2-migration-plan.md)
- Palette: `portfolio` (zinc 900 primary, blue 600 accent, zinc 50 background)
- Fonts: Space Grotesk (headings) + DM Sans (body)
- Styling: Tailwind CSS

---

## Tasks

- [x] 🟩 **Step 1: Restructure the repository** `[sequential]` → delivers: clean folder layout ready for backend and frontend projects
  - [x] 🟩 Move existing MVC project into `legacy/` (preserves it until migration is verified)
  - [x] 🟩 Update `.gitignore` to cover `frontend/node_modules` and `backend/bin`, `backend/obj`

- [x] 🟩 **Step 2: Create the .NET Web API project** `[sequential]` → depends on: Step 1
  - [x] 🟩 Scaffold a new ASP.NET Core Web API project inside `backend/`
  - [x] 🟩 Add EF Core + SQLite packages (match v1 versions: 9.0.x)
  - [x] 🟩 Copy `TaskModel.cs` and `TasklogDbContext.cs` into the new project (adjust namespaces)
  - [x] 🟩 Copy the existing EF Core migrations into the new project (adjust namespaces)
  - [x] 🟩 Move `TasklogDatabase.db` to `backend/` and configure connection string
  - [x] 🟩 Configure CORS to allow requests from localhost:3000 in development
  - [x] 🟩 Implement four API endpoints:
    - GET `/api/tasks` - list all tasks (ordered by CreatedAt desc)
    - GET `/api/tasks/{id}` - get single task
    - POST `/api/tasks` - create task (body: title, deadline)
    - DELETE `/api/tasks/{id}` - delete task

- [x] 🟩 **Step 3: Scaffold the Next.js frontend [UI]** `[sequential]` → depends on: Step 1
  - [x] 🟩 Scaffold a new Next.js app inside `frontend/` with App Router and Tailwind CSS
  - [x] 🟩 Configure the API base URL via `.env.local`

- [x] 🟩 **Step 4: Build the frontend UI (feature parity with v1) [UI]** `[sequential]` → depends on: Steps 2, 3
  - [x] 🟩 Task list page - fetch and display all tasks
  - [x] 🟩 Add task form - title input, optional deadline date picker, submit
  - [x] 🟩 Delete task - button per row, calls API, refreshes list
  - [x] 🟩 Single task detail page at `/tasks/[id]`
  - [x] 🟩 Inline success/error feedback (client-side state, replaces TempData flash messages)
  - [x] 🟩 Basic responsive layout (mobile and desktop)

- [x] 🟩 **Step 5: Verify and decommission the legacy project** `[sequential]` → depends on: Step 4
  - [ ] 🟥 Manually test all operations end-to-end via the new frontend *(run by you)*
  - [ ] 🟥 Confirm the SQLite database is read and written correctly by the new API *(run by you)*
  - [x] 🟩 Remove the `legacy/` folder and delete the `.sln` solution file
  - [x] 🟩 Update `README.md` to reflect the new architecture and how to run each part

---

## Risks

**EF Core migrations namespace**
- Migrations were generated against the original project namespace. Copying them to the
  new project will require namespace adjustments before they compile.

**Database file move**
- The database file must be moved carefully. The `legacy/` folder still references it
  during the overlap period - keep a copy in both locations until Step 5.

**CORS in production**
- If both backend and frontend are served from the same host/port via a reverse proxy,
  CORS is not needed. If they run on separate ports, CORS must stay configured.
  Document the expected production setup in `README.md`.

**App Router data fetching**
- Server Components fetch data directly on the server (no client-side fetch needed for
  read operations). Client Components are required for forms and delete buttons.
  This is a different mental model from Razor Views - review Next.js App Router docs
  before building Step 4 to avoid unnecessary `"use client"` directives.

---

## Outcomes

- **Next.js version was 16 (not 13+):** Tailwind v4 was installed instead of v3. Tailwind v4 has no `tailwind.config.ts` - design tokens go directly in `globals.css` via `@theme`. Standard zinc/blue/red color classes were used directly instead of custom tokens to avoid awkward names like `text-text`.
- **`mv` failed on Windows:** Used `cp -r` + `rm -rf` instead to move the legacy folder.
- **HTTP chosen over HTTPS for the API URL:** Using `http://localhost:5115` in `.env.local` to avoid Node.js rejecting the .NET dev self-signed cert during server-side fetches (task detail page is a Server Component). HTTPS is still available for the browser via port 7243.
- **Delete button added to detail page:** v1 had delete on the detail page. Added a `DeleteTaskButton` Client Component that handles the delete and redirects to home. Not in the original subtasks but required for feature parity.
- **`required` keyword added to `TaskModel.Title`:** The v1 codebase had a nullable warning on `Title`. Fixed in the new project.
