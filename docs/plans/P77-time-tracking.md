# Time Tracking - Plan (#77)

**Overall Progress:** `0%`

## TLDR
Toggl-style time tracking tied to each task. A per-task play/stop control logs work intervals; a floating bar shows the running timer with live elapsed time; a timeline dashboard (`/time`) renders those intervals as project-colored blocks on a vertical hour axis, with a day/week toggle, date navigation, and click-to-add / click-to-edit. Time entries are stored as start/stop intervals (one row each), and projects gain a color so blocks are colored.

## Goal State
**Current State:** Tasks have no notion of time spent. There is no timer, no time log, and projects have no color.
**Goal State:** You can start/stop a timer on any task (one runs at a time; starting a new one auto-stops the old), log/edit/delete time manually, and review your time as a Toggl-like day/week timeline plus per-day and per-task totals. Projects have a color used to tint timeline blocks.

## Critical Decisions

- **Decision 1: Interval data model (one row per start/stop), not an accumulated duration.**
  - **Options considered:** (a) one `TimeEntry` row per start->stop interval with `EndedAt` null while running; (b) a single accumulated `secondsSpent` column per task.
  - **Chosen:** (a) intervals - it's the only shape that powers the timeline (each block IS an interval), history, and manual edit/delete. Total-per-task = sum of intervals.
  - **Trade-offs accepted:** more rows; totals are computed not stored (fine - pure math, cheap).
  - **Research citation:** `docs/research/toggl-timeline-design-2026-06-08.md`; mirrors Tasklog Business's `WorkSession`.

- **Decision 2: Single running timer, auto-stop-on-start.** Starting a timer first stops any currently-running one (closing its interval), enforced server-side. Personal-friendlier than rejecting; matches the "you do one thing at once" reality.

- **Decision 3: Store timestamps in local time (`DateTime.Now`), bucket days by `.Date`.** Consistent with the rest of the app; avoids timezone conversion for a single-user app ("today" = `StartedAt.Date`). Trade-off: historical day attribution would shift if the user changes timezones - acceptable for a personal app. (Related: open deviation #18 `DateTime.Now` vs `UtcNow` - we deliberately stay on local here for consistency.)

- **Decision 4: No service layer - controller + pure helper.** Timer logic lives in a new `TimeEntriesController`; duration/day-grouping math lives in a pure static `Services/TimeSummary.cs` (clock-free, parameterized), exactly like `RecurrenceRule`/`HabitStreak`. No DI service-layer pattern is introduced (Business uses one; we don't need it).

- **Decision 5: Add a `Color` to `Project` (sub-feature) for block colors.** Timeline blocks are colored per project (Toggl colors by project). Our projects had no color, so this adds a `Project.Color` column + a curated palette picker on project create/edit. Inbox/no-project uses a neutral default. A custom-hex picker (`react-colorful`, ~3KB zero-dep) is an optional upgrade to settle at `/ui-spec`.

- **Decision 6: Timeline = absolutely-positioned blocks in an hour grid; no chart library.** `top = minutesFromMidnight * pxPerMin`, `height = durationMinutes * pxPerMin`. Day/week toggle (single column vs Mon-Sun columns). Click an empty slot -> add-entry form; click a block -> edit/delete. No drag-create/resize/move in v1. A midnight-crossing interval is split across the two day columns (each day counts only its own minutes).

- **Decision 7: A 1-second-tick React context for live elapsed.** New small frontend pattern (distinct from `usePolling`'s 30s background refresh): a context holds the active timer + a `nowMs` that ticks once/second ONLY while a timer runs, and rehydrates the running timer from the server on load. Drives the floating bar + any live block.

- **Decision 8: MCP/Claude time tools deferred** to a follow-up (not in v1).

<!-- GUIDELINES CHECK: New table (TimeEntry) + new column (Project.Color) - migrations follow existing precedents. New pure helper TimeSummary follows the RecurrenceRule/HabitStreak precedent (no new pattern). NEW frontend pattern: a 1s-tick context (documented in Decision 7) - to be added to engineering-guidelines at /document. NO service layer introduced. PRODUCT SCOPE: time tracking + project colors expand product-design.md (a new capability + a dashboard) - flagged; to be documented at /document. -->

## Tasks

- [ ] 🟥 **Step 1: Backend schema - TimeEntry + Project.Color + migration** `[sequential]` → delivers: the data model both backend slices build on
  - [ ] 🟥 `Models/TimeEntry.cs`: `Id`, `TaskId` (FK, cascade), `StartedAt`, `EndedAt` (nullable = running), `CreatedAt`; nav back to task. `[NotMapped] DurationSeconds` getter (EndedAt ?? now - StartedAt) for response convenience
  - [ ] 🟥 Add `Color` (string, nullable hex like `#RRGGBB`) to `Models/Project.cs`
  - [ ] 🟥 DbContext: `DbSet<TimeEntry>`; index on `EndedAt` (active lookup) + `TaskId`
  - [ ] 🟥 One EF migration (`AddTimeTrackingAndProjectColor`); verify nullable column + new table, existing rows unaffected; apply to dev DB

- [ ] 🟥 **Step 2: Backend - TimeEntriesController + TimeSummary helper** `[parallel]` → delivers: the time-tracking API (depends on Step 1; independent file from Step 3)
  - [ ] 🟥 `Services/TimeSummary.cs` (pure): duration of an interval (open => to `now`), group intervals into per-day totals over a date range, split a midnight-crossing interval into per-day minutes
  - [ ] 🟥 `TimeEntriesController`: `POST /api/time-entries/start {taskId}` (auto-stops any running entry first, then opens a new one), `POST /api/time-entries/{id}/stop`, `POST /api/time-entries` (manual add `{taskId, startedAt, endedAt}`, 400 if end<=start), `PATCH /api/time-entries/{id}` (edit start/end), `DELETE /api/time-entries/{id}`, `GET /api/time-entries?from&to` (range, for the timeline), `GET /api/time-entries/active` (the running one or null)
  - [ ] 🟥 Validation: task must exist; only one running entry ever; edit/manual require end>start

- [ ] 🟥 **Step 3: Backend - Project color** `[parallel]` → delivers: project create/edit carries a color (depends on Step 1; independent file from Step 2)
  - [ ] 🟥 `ProjectsController` create + update accept optional `color` (validate `#RRGGBB` or null); responses include it
  - [ ] 🟥 Confirm project responses everywhere serialize `Color`

- [ ] 🟥 **Step 4: Frontend - api layer + duration helper** `[sequential]` → depends on: Steps 2, 3
  - [ ] 🟥 `lib/api.ts`: `TimeEntry` type; `startTimer(taskId)`, `stopTimer(id)`, `addTimeEntry(...)`, `updateTimeEntry(id, {startedAt?, endedAt?})`, `deleteTimeEntry(id)`, `getTimeEntries(from, to)`, `getActiveTimeEntry()`; add `color` to `Project` + thread through `createProject`/`renameProject`
  - [ ] 🟥 `lib/format.ts`: `formatDuration(seconds)` -> "1h 23m" / "12m" / "0:42"; `formatClock(seconds)` -> "H:MM:SS" for the live bar

- [ ] 🟥 **Step 5: Frontend - live timer (context + bar + per-task control)** `[parallel]` → delivers: start/stop anywhere + a live floating bar (depends on Step 4; parallel with Step 6)
  - [ ] 🟥 `TimeTrackingContext`: holds the active entry + `nowMs` (1s `setInterval`, runs only while active); `start(taskId)` (optimistic, calls api, auto-stop handled server-side), `stop()`; rehydrates via `getActiveTimeEntry()` on mount
  - [ ] 🟥 `TimerControl` component (play when idle / stop + live elapsed when running) wired into the task list rows, `TaskCard`, board card, and the task detail page
  - [ ] 🟥 `TrackingBar` (fixed bottom): running task title + live `formatClock` elapsed + stop button; renders nothing when idle; mount the provider + bar in the app layout

- [ ] 🟥 **Step 6: Frontend - project color UI + nav** `[parallel]` → delivers: pick a project color + reach the timeline (depends on Step 4; parallel with Step 5)
  - [ ] 🟥 Curated color palette + a small swatch picker on project create + the Edit Project modal (`ProjectSidebar`); show a project color dot in the sidebar and on the board/grouping
  - [ ] 🟥 A "Time" nav link (sidebar) to `/time`

- [ ] 🟥 **Step 7: Frontend - timeline dashboard `/time`** `[sequential]` → depends on: Steps 4, 5, 6
  - [ ] 🟥 `/time` page: day ⇄ week toggle, date arrows + a date jump, "today" reset
  - [ ] 🟥 Hour-grid timeline: vertical 00:00-23:00 axis, day column(s), project-colored blocks (`top`/`height` from interval math), description + time on the block, today tint, red "now" line, the running entry as a live-growing block; midnight-crossing intervals split across columns
  - [ ] 🟥 Click empty slot -> add-entry form (pick task; start/end prefilled from the slot); click a block -> edit start/end/task or delete
  - [ ] 🟥 Per-day total header + a per-task breakdown for the visible range (via `TimeSummary`-shaped client math)

- [ ] 🟥 **Step 8: Tests + verification** `[sequential]` → depends on: Steps 1-7
  - [ ] 🟥 Backend: `TimeSummary` (duration of open interval, per-day grouping, midnight split) + `TimeEntriesController` (auto-stop-on-start, single-running invariant, manual end<=start 400, edit/delete) + project-color validation
  - [ ] 🟥 Frontend: `formatDuration`/`formatClock`; timeline block-position math; a context start/stop test
  - [ ] 🟥 All suites green; browser smoke (Playwright): start a timer (bar appears + ticks), start a second task (first auto-stops), open `/time` and see the blocks in day + week, add + edit + delete an entry

## Outcomes
<!-- Fill in after execution: decision-relevant deltas only. -->
