# Changelog

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
