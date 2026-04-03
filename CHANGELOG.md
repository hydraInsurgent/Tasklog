# Changelog

---

## v2.7.1 - Bug Fix
*April 2026*

### Fixed

- Frontend fails to start in downloaded package - the inner `.next/` directory inside the Next.js standalone output was silently excluded from the CI artifact because `upload-artifact@v4` skips hidden directories by default. Added `include-hidden-files: true` to the upload step. (#45)

---

## v2.7 - CI and Cross-Platform Distribution
*March 2026*

### What changed

**CI / Build**
- GitHub Actions release workflow builds all 4 platform packages automatically when a version tag is pushed
- Packages are uploaded directly to the GitHub Release: `Tasklog-win-x64.zip`, `Tasklog-mac-arm64.tar.gz`, `Tasklog-mac-x64.tar.gz`, `Tasklog-linux-x64.tar.gz`
- `workflow_dispatch` trigger allows manual test builds without creating a tag
- Frontend built once on Ubuntu (platform-independent); backend and launcher compiled per platform
- Node.js portable binary verified against official SHA-256 checksums before bundling

**Cross-platform**
- Launcher now detects the OS at runtime - no hardcoded `.exe` extensions on Mac/Linux
- New publish profiles for `osx-arm64`, `osx-x64`, and `linux-x64` (backend and launcher)
- Mac packages include Gatekeeper workaround instructions in README.txt
- `run.sh` added for Mac/Linux contributors as a bash equivalent of `run.ps1`

**Fixed**
- `usePolling` hook was referenced in components but missing from git - committed and verified
- Mac Intel (`osx-x64`) cross-compiled from Ubuntu after `macos-13` runner was discontinued

**Issues resolved**
- #44 - CI with GitHub Actions and cross-platform distribution

---

## v2.6 - Background Auto-Refresh
*March 2026*

### What changed

**Frontend**
- The app now silently polls for changes every 30 seconds, keeping tasks, projects, and labels in sync across devices
- New `usePolling` custom hook with `setInterval` and the Visibility API - pauses polling when the tab is hidden, fires an immediate fetch when the tab becomes visible again
- Tasks page (`TasksClient`) polls tasks and labels together, skipping poll cycles during in-flight deletes or completions to avoid disrupting animations
- Projects sidebar (`ProjectLayout`) polls for project list changes in the background
- Labels management page (`LabelsClient`) polls for label changes, pausing during create/edit/delete operations
- Open forms, active filters, and scroll position are preserved across polls

**Documentation**
- `usePolling` hook pattern documented in engineering guidelines

**Issues resolved**
- #42 - Background Auto-Refresh

---

## v2.5 - Downloadable Package
*March 2026*

### What changed

**Distributable package**
- Tasklog can now be downloaded as a single zip and run on any Windows machine with no prerequisites
- PowerShell build script (`build.ps1`) produces the distributable zip
- C# launcher (`Tasklog.exe`) starts both backend and frontend, displays browser and LAN URLs, handles clean shutdown
- .NET backend published as self-contained single-file exe (no .NET SDK needed on target)
- Next.js frontend built in standalone mode with bundled portable Node.js binary
- Sample database with 3 projects, 4 labels, and 12 tasks pre-loaded for demo purposes
- README.txt with quick-start and troubleshooting instructions included in the zip

**Backend**
- CORS now works in all environments: `FrontendDev` policy for development, `Distributable` policy (any origin) for production
- Database path resolves relative to the exe directory in production, fixing issue #3
- HTTPS redirection disabled in production (distributable runs over HTTP on local network)

**Frontend**
- Dynamic API URL detection: uses `NEXT_PUBLIC_API_URL` if set (dev mode), otherwise derives from `window.location.hostname` (distributable mode)
- This fixes issue #1 - the app now works on any device without hardcoded IPs
- Next.js standalone output configured for self-contained builds

**Issues resolved**
- #1 - CORS and server-side fetch break outside localhost
- #3 - Fragile database path

---

## v2.4 - Labels and Filtering
*March 2026*

### What changed

**Backend**
- New `Labels` table with many-to-many relationship to Tasks (implicit join table via EF Core)
- New endpoints: `GET /api/labels`, `POST /api/labels`, `PATCH /api/labels/{id}`, `DELETE /api/labels/{id}`
- New endpoint: `PATCH /api/tasks/{id}/labels` - replaces the full label set on a task
- Label name uniqueness enforced (case-insensitive, returns 409 Conflict)
- Label ID validation on assignment (returns 400 with invalid IDs)
- Task queries now eager-load labels via `.Include(t => t.Labels)`

**Frontend**
- Labels dashboard page (`/labels`) accessible from the sidebar - full CRUD with inline rename, color picker, and delete with confirmation
- 10-color VIBGYOR palette for label colors, auto-cycling on creation
- Labels field in AddTaskForm with autocomplete, multi-select, and auto-create on Enter
- Labels row on task detail page with add/remove via AssignLabelsButton (optimistic updates)
- Label chips (`#labelname`) shown on mobile task cards
- Filter panel popover (three-dot menu in task list header) with label, project, and date filters
- Filter state persists across navigation via sessionStorage
- New components: `LabelsClient`, `FilterPanel`, `ColorPicker`, `LabelChip`, `AssignLabelsButton`

**Tests**
- 15 new tests for `LabelsController` (CRUD, validation, uniqueness, color range)

---

## v2.3 - Mobile Task Cards
*March 2026*

### What changed

**Frontend**
- Task list now shows as compact cards on mobile (below 768px) instead of a horizontal-scrolling table
- Each card shows a circle checkbox, task title (links to detail page), project name, deadline with proximity colour, and a three-dot menu with a Delete action
- Desktop table layout is unchanged
- Shared date formatting utilities extracted to `src/lib/format.ts` (closes backlog item #20)

---

## v2.2 - Projects and Inbox
*March 2026*

### What changed

**Backend**
- New `Projects` table: `Id`, `Name`, `CreatedAt`
- `Tasks` table: added nullable `ProjectId` foreign key
- New endpoints: `GET /api/projects`, `POST /api/projects`, `PATCH /api/projects/{id}`, `DELETE /api/projects/{id}` (cascade deletes all tasks in the project)
- New endpoint: `PATCH /api/tasks/{id}/project` - reassigns a task to a project or Inbox (null)

**Frontend**
- Left sidebar with "All Tasks", "Inbox", and named project views
- Sidebar hidden on mobile - opens as a drawer via hamburger button
- Create, rename, and delete projects from the sidebar
- Delete project shows a confirmation dialog warning that all tasks will also be deleted
- Task list filters by the active view (client-side)
- Add task form includes a project dropdown, pre-selected to the current view
- Task detail page includes a project selector to reassign after creation
- Error feedback banner for project create/rename/delete failures
- New components: `ProjectLayout`, `ProjectSidebar`, `AssignProjectButton`

---

## v2.1 - Task Completion
*March 2026*

### What changed

**Backend**
- Added `IsCompleted` (boolean) and `CompletedAt` (nullable datetime) to the Tasks table
- New endpoint: `PATCH /api/tasks/{id}/complete` - marks a task complete or incomplete, records timestamp

**Frontend**
- Checkbox on each task row to mark complete/incomplete
- Completed tasks animate out and hide from the default view after 1.5s
- "Show completed" toggle in the task list header reveals all completed tasks
- Completed date shown in list and detail page
- "Mark complete" / "Mark incomplete" button on the task detail page
- New `CompleteTaskButton` component (mirrors `DeleteTaskButton` pattern)

---

## v2.0 - Architecture Migration
*March 2026*

### What changed

The entire application was restructured from a monolithic ASP.NET MVC app into
two separate projects: a .NET Web API backend and a Next.js frontend.

**Backend**
- Replaced ASP.NET MVC + Razor Views with ASP.NET Core Web API
- Controllers now return JSON instead of rendered HTML
- Same EF Core + SQLite stack, same data model, same database file
- Namespace updated from `Tasklog` to `Tasklog.Api`

**Frontend**
- New Next.js 16 app (App Router) in `frontend/`
- Tailwind CSS v4 for styling
- Space Grotesk + DM Sans font pairing
- Client-side state management replaces server-side TempData flash messages
- Deadline colour coding: red (overdue), yellow (due within 3 days)

**Repository**
- `Tasklog/` (v1 MVC project) moved to `legacy/` during migration, then removed
- `backend/` and `frontend/` folders replace the single project layout
- `Tasklog.sln` removed

### What stayed the same

- All v1 features: create task, view list, view detail, delete task, optional deadline
- SQLite database - existing data preserved, no schema changes
- No new features added during migration (by design)

### Known issues at release

See GitHub issues [#1](https://github.com/hydraInsurgent/Tasklog/issues/1) through
[#6](https://github.com/hydraInsurgent/Tasklog/issues/6) for limitations identified
during code review.

---

## v1.0 - Initial Release
*January 2026*

First working version. Single ASP.NET MVC app with server-rendered Razor views.

- Create tasks with title and optional deadline
- View all tasks
- View single task detail
- Delete tasks (delete = done in v1)
- SQLite persistence via EF Core
- Accessible over local network from phone and desktop
