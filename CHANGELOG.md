# Changelog

---

## v2.12.0 - Deadline time-of-day
*May 2026*

### Added

- Deadlines can now include an optional time of day ("due Friday at 3pm"), set via a time field beside the date on the add-task form and the edit modal. Leave it blank for a date-only deadline, exactly as before (#68)
- `dueStatus` reflects the time: a timed deadline becomes `overdue` the moment it passes, while a date-only deadline stays due all that calendar day (then overdue the next). today / this_week / later are still calendar-based
- The deadline shows its time wherever it's displayed (list pill, task detail). MCP `create_task`/`update_task` already accepted a datetime; their descriptions now spell out the date-vs-datetime distinction

No DB migration (the deadline column already stored a datetime). Interpreted in the server's local time.

---

## v2.11.0 - Task description field
*May 2026*

### Added

- Tasks now have an optional free-text `description` - notes, context, a link - so titles stop doubling as metadata storage. Stored as a new nullable `Description` column (DB migration; existing tasks get null) (#67)
- Editable via an optional multiline field on the add-task form and the edit modal, and shown on the task detail page (line breaks preserved). Cleared by blanking it
- MCP: `create_task` and `update_task` accept a `description` (pass null on update to clear), and it is included in returned task objects - so Claude can "add a note to task N" or read a task's context

Capped at 2000 characters. Plain text (no markdown rendering this release).

---

## v2.10.7 - Agent ergonomics (bulk priority + name resolution)
*May 2026*

### Added

- `bulk_set_priority` - set the priority on many tasks at once, closing the bulk asymmetry (complete/move/deadline already had bulk variants). Available as a `setPriority` operation on `POST /api/tasks/bulk`, a `bulk_set_priority` MCP tool, and a "Set priority" action on the web bulk-actions bar. MCP tool count: 19 → 20 (#66)
- Name-based resolution: `assign_task_to_project` / `bulk_assign_to_project` accept a `projectName`, and `set_task_labels` accepts `labelNames`, resolved server-side (case-insensitive, exact). So Claude can "move these to Work" or "tag these urgent" without a `list_projects`/`list_labels` lookup first. Ids still work; an ambiguous or unknown name returns a clear 400

No DB migration. The web UI gains the bulk priority action; the rest is MCP/API surface.

---

## v2.10.6 - list_tasks query completeness
*May 2026*

### Added

- `GET /api/tasks` (and the MCP `list_tasks` tool) gained `createdAfter` / `createdBefore` filters on a task's creation date - so "what did I add today" is a single filtered call instead of fetching everything and eyeballing dates (#65)
- Sorting: `sort` (`created` / `deadline` / `priority`) + `order` (`asc` / `desc`), default `created` / `desc` (unchanged from before). Deadline sort lists tasks with no deadline last; priority ascending lists P1 first
- `limit` caps the result to the first N tasks after sorting (e.g. "top 5 by priority"); omit for all, `limit < 1` returns 400

MCP-only surface growth - the web UI is unaffected. No DB migration.

---

## v2.10.5 - Task priority (P1-P4)
*May 2026*

### Added

- Tasks now have a priority on the Todoist P1-P4 scale: P1 = Urgent (red), P2 = High (orange), P3 = Medium (blue), P4 = None (the default). Stored as a new `Priority` column (DB migration; existing tasks default to P4) (#64)
- Set priority on the add-task form and the edit modal; a small colored dot appears next to the title for P1-P3 (P4 shows nothing). A priority filter row on the filter panel narrows the list by one or more priorities
- MCP: `create_task` and `update_task` accept a `priority` param (1-4), `list_tasks` accepts a `priorities` filter, and the priority is included in returned task objects - so Claude can "make this P1" or answer "what's P1 and due this week?" in one call

---

## v2.10.4 - Bulk task operations
*May 2026*

### Added

- `POST /api/tasks/bulk` - apply one operation to many tasks in a single transaction: `complete` (complete/reopen), `assignProject` (move to a project or Inbox), or `setDeadline` (set or clear). Returns the affected tasks; unknown ids are skipped. There is intentionally no bulk delete (#63)
- Three MCP tools - `bulk_set_completion`, `bulk_assign_to_project`, `bulk_set_deadline` - so Claude can reorganize many tasks in one call (e.g. "move these 5 to Work", "push all of these to Friday") instead of one call per task. MCP tool count: 16 → 19
- Web UI multi-select: a "Select" toggle on the task list reveals selection checkboxes (desktop column with select-all, mobile card checkboxes) and a sticky bulk-actions bar with Complete, Reopen, Move to project, and Set deadline

---

## v2.10.3 - Computed dueStatus field + MCP tool-description shape hints
*May 2026*

### Added

- Every task now carries a server-computed, read-only `dueStatus` field alongside `deadline`: one of `overdue`, `today`, `this_week` (through the upcoming Sunday), `later`, or `none`. Computed in the API layer relative to today (no DB column, always current), so Claude and the web UI get consistent due buckets without each recomputing them (#61)
- The MCP `Task` shape and the web UI `Task` type both expose `dueStatus`. The web UI keeps its own deadline-pill colors (a 3-day threshold, intentionally distinct from the calendar-week `dueStatus` buckets)

### Changed

- All 16 MCP tool descriptions now end with a "Returns: ..." sentence describing their output shape, so LLM clients can reason about results before calling. The task-returning tools document the full task shape including the new `dueStatus`

---

## v2.10.2 - Editable task title and deadline
*May 2026*

### Added

- `PATCH /api/tasks/{id}` - partial update of a task's `title` and/or `deadline`. Present-key detection: an omitted field is left unchanged, `deadline: null` clears the deadline, and a value sets it. Returns 400 on an empty/whitespace title or an unparseable date, 404 if the task does not exist. Until now title and deadline could only be set at creation (#59)
- MCP `update_task(id, title?, deadline?)` tool wrapping the new endpoint, so Claude can rename a task or change/clear its deadline without delete-and-recreate (which lost `createdAt` and completion history). MCP tool count: 15 → 16
- Web UI edit modal (`EditTaskModal`) on the task three-dot menu and a desktop table edit action - edits title, deadline, project, and labels in one place, firing only the fields that changed
- Web UI quick-deadline popover (`DeadlinePopover`) on the deadline pill: Today, Tomorrow, This weekend (upcoming Saturday), Next week (upcoming Monday), or None to clear

---

## v2.10.1 - MCP task filtering + tool consolidation
*May 2026*

### Added

- `GET /api/tasks` now accepts optional filter query params: `projectIds`, `inbox`, `labelIds`, `dueBefore`, `dueAfter`, `completed`, and `text` (case-insensitive title substring). Filters AND together across dimensions; within `projectIds`/`labelIds` the semantics are OR. No params returns all tasks as before (#57)
- The MCP `list_tasks` tool surfaces all of those filters, so Claude can answer "what's due this week in the Work project?" or "tasks tagged urgent" with a single server-side filtered call instead of fetching everything
- Text-search box on the web UI's filter panel (client-side title substring match)

### Changed

- MCP `complete_task` and `uncomplete_task` merged into a single `set_task_completion(id, isCompleted)` tool. MCP tool count: 16 → 15
- Tasks with no deadline are excluded from `dueBefore`/`dueAfter` filters. Sending `inbox=true` together with a non-empty `projectIds` returns 400 (contradictory)

---

## v2.10 - MCP server for claude.ai custom connector
*May 2026*

### Added

- Tasklog now speaks the [Model Context Protocol](https://modelcontextprotocol.io/specification/2025-06-18). A new Node/TS service (`mcp/`) exposes all Tasklog operations as MCP tools so claude.ai can manage tasks on your behalf (#50)
- 16 MCP tools: list/get/create/delete/complete/uncomplete tasks, assign tasks to projects, set task labels, list/create/rename/delete projects, list/create/update/delete labels
- OAuth 2.1 authorization server with Dynamic Client Registration (RFC 7591), PKCE S256 (RFC 7636), Authorization Server Metadata (RFC 8414), Protected Resource Metadata (RFC 9728), and Resource Indicators (RFC 8707) - the full spec stack claude.ai's connector requires
- GitHub OAuth upstream for user authentication: log in with GitHub, allow-listed by username (env var `ALLOWED_GH_USERS`), zero passwords managed by the server
- Cloudflare Tunnel integration so the MCP endpoint is publicly reachable at `https://mcp-tasklog.manudubey.in` without exposing the phone's IP or opening any inbound ports
- `scripts/deploy-phone.sh` extended to build, transfer, and supervise the new `tasklog-mcp` and `tasklog-tunnel` services via runit
- `guides/mcp-server-setup.md` - top-level end-to-end walkthrough
- `guides/cloudflare-tunnel-dns-setup.md` - prerequisite: migrating a domain to Cloudflare DNS
- `guides/github-oauth-app-setup.md` - prerequisite: registering the upstream OAuth App
- `docs/learnings/{mcp-protocol,oauth-2-1-for-mcp,cloudflare-tunnel,dns-and-nameservers,github-oauth-vs-github-apps}.md` - five new study docs covering the concepts behind this feature
- `docs/research/{mcp-spec-2025-06-18,claude-ai-connector-oauth,cloudflare-tunnel}.md` - verified excerpts from canonical specs and vendor docs
- `docs/workflow-notes.md` - new living doc for tracking workflow experiments and deviations across features

### Changed

- `manudubey.in` DNS migrated from Porkbun's nameservers to Cloudflare's (required for Tunnel; existing GCP + GitHub Pages records preserved)

### Security notes

- The Tasklog .NET API remains LAN-only with no authentication. The MCP server is the ONLY public surface; it gates access with OAuth + GitHub upstream + a one-name allow-list before forwarding any request to the API.
- Access tokens are short-lived (1 hour) and audience-bound; refresh tokens (30 days) rotate on every use per OAuth 2.1 for public clients.
- OAuth state lives in a separate SQLite file (`mcp/data/auth.db`); the Tasklog task DB is unchanged.

---

## v2.9 - Deploy Tasklog to GCP
*April 2026*

### Added

- Tasklog is now publicly hosted at `https://tasklog.manudubey.in` - a live demo on a GCP Compute Engine e2-micro VM (always-free tier) (#48)
- `scripts/deploy-gcp.ps1` - one-command deploy script: builds locally, transfers to VM, restarts services
- `guides/gcp-server-setup.md` - full one-time VM setup walkthrough (nginx, systemd, certbot, cron)
- `guides/gcp-deploying-updates.md` - guide for pushing future releases using the deploy script
- Demo database resets every 6 hours from a seed copy so the live demo stays clean

### Changed

- `api.ts` URL resolution now splits SSR and browser paths - server-side uses `API_URL` (private, direct to backend), browser uses `NEXT_PUBLIC_API_URL` (through nginx). Local dev behaviour unchanged.

---

## v2.8.1 - Bug Fix
*April 2026*

### Fixed

- Labels column missing from desktop task table - labels were only rendered in the mobile card view. Added a Labels column between Created and Completed in the desktop table. (#46)

---

## v2.8 - README Overhaul and MIT License
*April 2026*

### Added

- MIT license file (`LICENSE`) added to the repo root (#47)
- README rewritten as a proper GitHub project landing page: badges, screenshots placeholder, scannable feature list, all-platform download links, Windows first-run notes, Quick Start for users, and Run from Source for contributors (#47)
- Dark mode and custom themes added to the roadmap

### Changed

- API endpoints table removed from README - it lives in `docs/architecture.md`
- `Readme.md` renamed to `README.md` (standard casing)

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
