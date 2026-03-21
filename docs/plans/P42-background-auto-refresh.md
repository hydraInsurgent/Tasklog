# Background Auto-Refresh Plan

**Overall Progress:** `83%`

## TLDR
Add background polling so the task list, projects, and labels stay in sync across devices without disrupting the user. A custom `usePolling` hook fetches fresh data on an interval, pauses when the tab is hidden, and skips updates when in-flight operations (deleting, completing) are active.

## Goal State
**Current State:** Data is fetched once on mount. Changes made on another device only appear after a manual page refresh.
**Goal State:** The app silently polls for changes every 30 seconds. New tasks, projects, and labels appear automatically. User interactions (open forms, active filters, animations) are never disrupted.

## Critical Decisions
- **Custom hook, no library** - use a `usePolling` hook with `setInterval` + Visibility API rather than adding SWR/React Query. Keeps the stack simple and matches the existing pattern of raw hooks.
- **Full fetch, not diffs** - poll the same endpoints (`GET /api/tasks`, `/api/projects`, `/api/labels`) and replace state. Diff-based optimization deferred to a future iteration.
- **Skip updates during in-flight operations** - if the user is mid-delete or mid-complete (tracked by `deletingId`, `completingId`, `hidingIds`), skip that poll cycle to avoid overwriting optimistic state.
- **Hybrid tab visibility** - poll on interval while tab is visible, stop polling when hidden, immediate fetch when tab becomes visible again. No wasted requests to a hidden tab.
- **30-second interval** - fast enough to feel responsive on a local network, slow enough to be invisible. Can be tuned later.
- **Last-write-wins for conflicts** - single-user app makes true conflicts extremely unlikely. If a poll returns data that was also modified locally, the last write wins silently. Log a console warning if detected. True conflict resolution deferred until multi-user or task editing becomes a real scenario.
- **New pattern: introduces `usePolling` hook** - first reusable polling hook in the codebase. Should be documented in engineering-guidelines.md.

## Tasks

- [x] :green_square: **Step 1: Create `usePolling` hook** `[parallel]` - delivers: reusable polling hook at `src/hooks/usePolling.ts`
  - [x] :green_square: Create `frontend/src/hooks/usePolling.ts`
  - [x] :green_square: Accept params: `fetchFn`, `intervalMs`, `enabled` (boolean to pause when in-flight)
  - [x] :green_square: Use `setInterval` to call `fetchFn` on the given interval
  - [x] :green_square: Use `document.visibilitychange` to pause/resume when tab is hidden/visible
  - [x] :green_square: Fire an immediate fetch when the tab becomes visible again (catch up after being hidden)
  - [x] :green_square: Clean up interval and event listener on unmount

- [x] :green_square: **Step 2: Integrate polling into TasksClient** `[sequential]` - depends on: Step 1
  - [x] :green_square: Import and call `usePolling` to refresh tasks + labels together (same `Promise.all` pattern as `loadTasks`)
  - [x] :green_square: Pass `enabled: false` when `deletingId`, `completingId`, or `hidingIds.length > 0` to skip updates during in-flight operations
  - [x] :green_square: On poll success, update `tasks` and `allLabels` state - filters and view remain unchanged since they operate on derived data

- [x] :green_square: **Step 3: Integrate polling into ProjectLayout** `[sequential]` - depends on: Step 1
  - [x] :green_square: Import and call `usePolling` to refresh projects
  - [x] :green_square: On poll success, update `projects` state - `activeView`, `filterState`, and `drawerOpen` remain unchanged

- [x] :green_square: **Step 4: Integrate polling into LabelsClient** `[sequential]` - depends on: Step 1
  - [x] :green_square: Import and call `usePolling` to refresh labels on the labels management page
  - [x] :green_square: Pass `enabled: false` when any label operation is in-flight (`creating`, `editingId`, `pendingIds`)

- [ ] :yellow_square: **Step 5: Test and verify** `[sequential]` - depends on: Steps 2, 3, 4
  - [ ] :red_square: Verify tasks added on one device appear on another within 30 seconds
  - [ ] :red_square: Verify open AddTaskForm is not cleared by a poll
  - [ ] :red_square: Verify active filters are preserved across polls
  - [ ] :red_square: Verify delete/complete animations are not interrupted
  - [ ] :red_square: Verify polling pauses when tab is hidden and resumes on focus
  - [ ] :red_square: Verify labels page also refreshes in background

- [x] :green_square: **Step 6: Update engineering guidelines** `[sequential]` - depends on: Step 5
  - [x] :green_square: Document the `usePolling` hook pattern in `docs/engineering-guidelines.md`

## Outcomes
<!-- Fill in after execution -->
