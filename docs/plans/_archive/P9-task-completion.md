# Task Completion - Implementation Plan

**Overall Progress:** `100%`

## TLDR
Add an `IsCompleted` field to tasks. Users can check/uncheck tasks as done from the task list and detail page. Completed tasks hide after a short delay with a slide-out animation. A toggle on both views lets users show or hide completed tasks.

## Goal State

**Current State:** Tasks can only be deleted. There is no way to mark a task done without removing it.

**Goal State:** Tasks have a persistent `IsCompleted` state. Completed tasks disappear from the default view with a subtle animation. A toggle reveals them. Completion can be undone.

## Critical Decisions

- **PATCH /api/tasks/{id}/complete with `{ isCompleted: bool }`** - clean REST pattern for toggling a specific field without replacing the whole resource
- **New `CompleteTaskButton.tsx` Client Component** - follows the existing `DeleteTaskButton.tsx` pattern for adding interactivity to a Server Component page
- **API-confirmed before hiding** - call the API first, then start the hide timer. Avoids repeating the optimistic-update bug tracked in issue #2
- **`showCompleted` is local UI state** - resets on refresh, no persistence needed
- **Timer ref stored and cleared** - prevents the uncleaned-timer issue from #2 recurring

## Tasks

- [x] 🟩 **Step 1: Backend - model and migration** `[parallel]` → delivers: `IsCompleted` column in DB, updated `TaskModel`
  - [x] 🟩 Add `public bool IsCompleted { get; set; }` to `TaskModel.cs` (defaults to `false`)
  - [x] 🟩 Run `dotnet ef migrations add AddIsCompleted` from `backend/Tasklog.Api/`
  - [x] 🟩 Run `dotnet ef database update` to apply the migration

- [x] 🟩 **Step 2: Backend - PATCH endpoint** `[sequential]` → depends on: Step 1
  - [x] 🟩 Add `CompleteTaskRequest(bool IsCompleted)` record to `TasksController.cs`
  - [x] 🟩 Add `PATCH /api/tasks/{id}/complete` action: find task, set `IsCompleted`, save, return `Ok(task)`

- [x] 🟩 **Step 3: Frontend - API layer** `[parallel]` → delivers: typed `completeTask()` function and updated `Task` type
  - [x] 🟩 Add `isCompleted: boolean` to the `Task` interface in `api.ts`
  - [x] 🟩 Add `completeTask(id: number, isCompleted: boolean): Promise<Task>` function calling `PATCH /api/tasks/{id}/complete`

- [x] 🟩 **Step 4: Frontend - TasksClient** `[sequential]` → depends on: Steps 2, 3
  - [x] 🟩 Add `completingId` state (`number | null`) - tracks which task has an in-flight completion request
  - [x] 🟩 Add `hidingIds` state (`Set<number>`) - tracks tasks currently in their hide animation
  - [x] 🟩 Add `showCompleted` toggle state (default `false`)
  - [x] 🟩 Add `handleComplete(id, isCompleted)`: call API, on success add to `hidingIds`, set timer to remove from visible list after 1.5s; store timer ref and clear on unmount
  - [x] 🟩 Add checkbox column to the task table (before title). Checked state reflects `task.isCompleted`. Calls `handleComplete` on change
  - [x] 🟩 Add "Show completed" / "Hide completed" toggle button to the panel header
  - [x] 🟩 Filter: when `showCompleted` is false, hide tasks where `isCompleted` is true (except those in `hidingIds` which are mid-animation)
  - [x] 🟩 Apply slide-out animation to rows in `hidingIds`: `opacity-0 translate-y-1 transition-all duration-300`

- [x] 🟩 **Step 5: Frontend - CompleteTaskButton component** `[sequential]` → depends on: Steps 2, 3
  - [x] 🟩 Create `src/components/CompleteTaskButton.tsx` as a Client Component
  - [x] 🟩 Props: `taskId: number`, `taskTitle: string`, `isCompleted: boolean`
  - [x] 🟩 Button label: "Mark complete" / "Mark incomplete" based on current state
  - [x] 🟩 Loading state with spinner during request; error message on failure

- [x] 🟩 **Step 6: Frontend - task detail page** `[sequential]` → depends on: Step 5
  - [x] 🟩 Add a "Status" row to the detail card showing "Complete" or "Pending"
  - [x] 🟩 Include `<CompleteTaskButton>` below the status row (above the delete button)

- [x] 🟩 **Step 7: Backend - CompletedAt field** `[sequential]` → depends on: Step 2
  - [x] 🟩 Add `public DateTime? CompletedAt { get; set; }` to `TaskModel.cs`
  - [x] 🟩 Run `dotnet ef migrations add AddCompletedAt`
  - [x] 🟩 Run `dotnet ef database update`
  - [x] 🟩 Update `Complete` action: set `task.CompletedAt = DateTime.Now` when marking done, `null` when marking incomplete

- [x] 🟩 **Step 8: Frontend - CompletedAt in API layer and TasksClient** `[sequential]` → depends on: Step 7
  - [x] 🟩 Add `completedAt: string | null` to the `Task` interface in `api.ts`
  - [x] 🟩 Update `handleComplete` in `TasksClient.tsx` to use the returned task object from API (so `completedAt` is set from server, not guessed locally)
  - [x] 🟩 Add "Completed" column to the task table header and rows - shows formatted date when done, "--" otherwise

- [x] 🟩 **Step 9: Frontend - CompletedAt on detail page** `[sequential]` → depends on: Step 8
  - [x] 🟩 Add "Completed" row to the detail card (between Status and Deadline) - shows formatted date when done, "Not yet" otherwise

## Outcomes

All 6 steps completed as planned. No deviations from the plan.

- EF migration `20260312153101_AddIsCompleted` applied successfully - `IsCompleted INTEGER NOT NULL DEFAULT 0` column added to `Tasks` table
- `PATCH /api/tasks/{id}/complete` added alongside the existing GET/POST/DELETE endpoints
- `CompleteTaskButton.tsx` created following the `DeleteTaskButton.tsx` pattern exactly - `router.refresh()` used (not `router.push`) so the Server Component re-fetches without full navigation
- Detail page renders `CompleteTaskButton` and `DeleteTaskButton` side by side in the action footer
- Timer cleanup via `useRef<Map>` guards against the issue #2 uncleaned-timer bug pattern
