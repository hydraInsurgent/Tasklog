# Projects and Inbox - Implementation Plan

**Overall Progress:** `100%`

## TLDR
Add a Projects feature that lets the user categorize tasks. Tasks without a project go to Inbox. A sidebar lets the user navigate between All Tasks, Inbox, and individual projects. Tasks can be assigned to a project at creation or updated afterwards.

## Goal State

**Current State:** The app has one flat list of tasks with no grouping or categorization.

**Goal State:** Tasks belong to a project (optional). A left sidebar shows All / Inbox / Projects. Selecting a view filters the task list. Tasks created while in a project view are automatically assigned to that project.

## Critical Decisions

- **Client-side filtering** - `getTasks()` continues to fetch all tasks. The active view filters client-side. Consistent with how the app works today and avoids a new API query-param pattern.
- **Null ProjectId = Inbox** - Tasks with no project assigned appear in Inbox and are excluded from project views. Simple and unambiguous.
- **All view** - Shows every task regardless of project. Useful for daily planning.
- **ProjectLayout wrapper component** - A new Client Component owns the active project state and renders both sidebar and task list side by side. This keeps `TasksClient` focused and avoids prop-drilling through the layout.
- **Sidebar in frontend layout** - The sidebar is part of the content area, not the app shell. `layout.tsx` widens its container; the sidebar is rendered inside `ProjectLayout`.
- **Task detail page gets project selector** - Project reassignment after creation is only possible from the task detail page. The main list is read-only.
- **Cascade delete** - Deleting a project deletes all its tasks. Always confirmed via dialog before proceeding.

## UI Decisions

> Design tokens and global rules inherited from [UI-SPEC.md](../../UI-SPEC.md).
> Only feature-specific decisions are recorded here.

### Sidebar - Mobile behavior
- **Layout:** Hidden by default on mobile. A hamburger button (top-left of content area) opens it as a drawer overlay with a backdrop. Desktop always shows it inline.
- **Breakpoint:** Sidebar visible at `md:` (768px) and above; drawer mode below that.

### Sidebar - Project management
- **Rename/edit:** Each project has an edit icon button. Clicking it opens an "Edit Project" modal dialog with a name field. Designed as a dialog (not inline edit) so future fields (e.g. color) can be added without restructuring.
- **Delete:** Cascade deletes all tasks in the project. Always shows a confirmation dialog warning: "This will permanently delete [N] tasks. This cannot be undone." Requires explicit confirmation before proceeding.
- **Create:** An "Add project" button at the bottom of the sidebar list. Opens a simple inline input (not a modal - name is the only field at creation time).

### Project assignment
- **At creation:** `AddTaskForm` gets an optional project dropdown. Defaults to the currently active project view (or none if viewing All/Inbox). User can override.
- **After creation:** Only on the task detail page. A project selector field is added to the detail view.
- **Main list views:** Read-only. No inline project editing from the task table.

### Empty states
- **Empty project view:** "No tasks in this project yet. Add one below." (reuses existing empty state pattern)
- **Empty Inbox:** "Your inbox is clear." (distinct message - inbox empty is a positive state)

### UX Rules in scope for this feature
- [ ] `touch-targets` (CRITICAL) - sidebar buttons, drawer toggle, and edit/delete icons all need 44x44px targets
- [ ] `aria-labels` (CRITICAL) - hamburger button, edit icon, delete icon all need aria-label
- [ ] `focus-states` (CRITICAL) - sidebar nav items, modal inputs, and drawer close button need visible focus rings
- [ ] `loading-states` (HIGH) - show spinner while projects load; disable sidebar actions during create/rename/delete
- [ ] `color-not-only-indicator` (HIGH) - active sidebar item uses both color and a visual marker (bold or left border)
- [ ] `disable-during-async` (MEDIUM) - confirm button in delete dialog disabled while request is in flight
- [ ] `animation-duration` (MEDIUM) - drawer open/close at 200ms; modal at 200ms
- [ ] `responsive-breakpoints` (MEDIUM) - test sidebar drawer at 320px and 640px; two-column layout at 768px+

---

## Tasks

- [x] 🟩 **Step 1: Backend data model + migration** `[sequential]` → first - all backend work depends on this
  - [x] 🟩 Create `Models/Project.cs` with `Id` (int PK), `Name` (string, required), `CreatedAt` (DateTime)
  - [x] 🟩 Add `ProjectId` (nullable int FK) and `Project` navigation property to `Models/TaskModel.cs`
  - [x] 🟩 Add `DbSet<Project> Projects` to `Data/TasklogDbContext.cs`
  - [x] 🟩 Run `dotnet ef migrations add AddProjects` and verify the generated migration
  - [x] 🟩 Run `dotnet ef database update` to apply the migration

- [x] 🟩 **Step 2: Backend API endpoints** `[sequential]` → depends on: Step 1
  - [x] 🟩 Create `Controllers/ProjectsController.cs` with:
    - `GET /api/projects` - return all projects ordered by name
    - `POST /api/projects` - create project, body: `{ name: string }`
    - `PATCH /api/projects/{id}` - rename project, body: `{ name: string }`
    - `DELETE /api/projects/{id}` - delete project and cascade delete all its tasks
  - [x] 🟩 Update `Controllers/TasksController.cs`:
    - Add optional `ProjectId` to `CreateTaskRequest` record
    - Set `ProjectId` on the new task in the `Create` action
    - Add `PATCH /api/tasks/{id}/project` endpoint, body: `{ projectId: int? }` (null to unassign)

- [x] 🟩 **Step 3: Frontend API client** `[UI]` `[parallel]` → delivers: typed functions and updated Task type (independent of Step 4 files)
  - [x] 🟩 Add `Project` interface to `lib/api.ts`: `{ id: number; name: string; createdAt: string }`
  - [x] 🟩 Add `projectId: number | null` field to the `Task` interface
  - [x] 🟩 Add `getProjects()` - GET /api/projects
  - [x] 🟩 Add `createProject(name)` - POST /api/projects
  - [x] 🟩 Add `renameProject(id, name)` - PATCH /api/projects/{id}
  - [x] 🟩 Add `deleteProject(id)` - DELETE /api/projects/{id}
  - [x] 🟩 Add `assignTaskProject(id, projectId)` - PATCH /api/tasks/{id}/project

- [x] 🟩 **Step 4: Sidebar + layout components** `[UI]` `[parallel]` → delivers: sidebar UI and layout structure (independent of Step 3 files)
  - [x] 🟩 Update `app/layout.tsx` - widen container from `max-w-3xl` to `max-w-6xl` on the main element; sidebar will sit inside content, not the shell
  - [x] 🟩 Create `components/ProjectSidebar.tsx` (Client Component):
    - Receives `projects`, `activeView`, `onSelectView`, `onCreateProject`, `onRenameProject`, `onDeleteProject` as props
    - Renders "All Tasks" and "Inbox" as fixed items at the top
    - Lists each project below with an edit icon (opens Edit Project dialog) and delete action
    - Highlights the active selection
  - [x] 🟩 Create `components/ProjectLayout.tsx` (Client Component):
    - Owns `activeView` state: `"all" | "inbox" | number` (number = project ID)
    - Fetches projects on mount (`getProjects`)
    - Handles create/rename/delete project actions (calls API, updates local state)
    - Renders `<ProjectSidebar />` and `<TasksClient />` side by side in a flex row
  - [x] 🟩 Update `app/page.tsx` - render `<ProjectLayout />` instead of `<TasksClient />`

- [x] 🟩 **Step 5: TasksClient integration** `[UI]` `[sequential]` → depends on: Steps 3, 4
  - [x] 🟩 Add `activeView: "all" | "inbox" | number` prop to `TasksClient`
  - [x] 🟩 Add filtering logic: All = no filter, Inbox = `projectId === null`, Project = `projectId === id`
  - [x] 🟩 Update `handleAdd` to pass `projectId` from `activeView` (null for All/Inbox views)
  - [x] 🟩 Update `createTask` call to include `projectId`
  - [x] 🟩 Add a "Project" column to the task table (All Tasks view only) showing project name or "Inbox"
  - [x] 🟩 Update `AddTaskForm.tsx` - added optional project dropdown, defaults to active project view
  - [x] 🟩 Update `tasks/[id]/page.tsx` - fetch projects server-side, pass to `AssignProjectButton.tsx`
  - [x] 🟩 Create `components/AssignProjectButton.tsx` (Client Component) - dropdown reassigns project, calls `router.refresh()`

## Outcomes

- All 5 steps completed as planned. No deviations from the architecture.
- `ProjectLayout` owns sidebar + task list, `TasksClient` stays focused on task CRUD.
- Project column only shown in "All Tasks" view to avoid redundant info in project/inbox views.
- `AddTaskForm` project dropdown defaults to the active view's project (auto-assigns on create).
- Task detail page fetches projects independently with a silent fallback to `[]` so a projects API failure doesn't 404 the task.
- `AssignProjectButton` uses `router.refresh()` to re-run the Server Component and reflect the updated project name immediately.
- `defaultProjectId` in `AddTaskForm` is a snapshot at render time - if the user switches views while the form is open, the dropdown won't auto-update (acceptable given the use pattern).
