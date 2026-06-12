# Time Tracking - Plan (#77)

**Overall Progress:** `100%`

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

## UI Decisions

> Design tokens and global rules inherited from [UI-SPEC.md](../../UI-SPEC.md). Light mode only (dark deferred). Only feature-specific decisions are recorded here. Visual reference: `docs/research/toggl-timeline-design-2026-06-08.md`.

### Timeline dashboard (`/time`)
- **Geometry:** absolutely-positioned blocks in an hour grid. `pxPerMin = 0.8` (1 hour = 48px), so `top = startMinutesFromMidnight * 0.8`, `height = max(18, durationMin * 0.8)`. The 18px floor is the tiny-block min height.
- **Hour axis:** left gutter ~48px; hour labels (`00:00`-`23:00`) in `text-muted` 12px at each hour line; 1px `border-muted` gridline per hour. Opens scrolled to ~07:00; the full 24h scrolls inside its own container (NOT the page).
- **Blocks:** fill = project color at low alpha + a 3px saturated left edge in the full color (inline `style` with the project hex: `borderLeftColor: hex`, `backgroundColor: hex + '22'`). No-project/Inbox = neutral `border`/`text-muted`. Show description (bold `text-primary`) + `start-end` time; blocks under ~32px show title only with full detail on **hover tooltip**. Click -> the entry popover (edit) with Delete.
- **Today tint:** today's column background `surface-raised`. **Now line:** 2px `danger` line + a 6px `danger` dot at the left, today column only.
- **Day/week toggle:** segmented control reusing the #73 list/board toggle style. Week = Mon-Sun columns; Day = single column. **Mobile (<640px) forces Day** with left/right day arrows. Date nav: `< >` arrows + "Today" reset + a date label that opens a date jump.
- **Midnight-crossing entry:** split into per-day segments, each column clamped to 00:00/24:00.

### Per-task play/stop control (`TimerControl`)
- **Placement:** hover-reveal on the **right** of a list row near edit/delete; persistent on the currently-running task. Also on `TaskCard`, board card, detail page.
- **Idle:** Lucide `Play`, `text-muted` -> `accent` on hover, 44px tap target, `aria-label="Start timer for <task>"`.
- **Running:** Lucide `Square` in `success` green + live `mm:ss` text beside it (icon + text + color), `aria-label="Stop timer"`. Spinner + disabled during the request.

### Floating tracking bar (`TrackingBar`)
- Fixed bottom; **mobile** full-width with safe-area padding, **desktop** floating pill bottom-right. Clock icon + running task title (truncated) + live `H:MM:SS` (`formatClock`) + a `danger` stop button. Nothing when idle. 150ms fade-in; respects `prefers-reduced-motion`.

### Project color picker
- **Palette + custom:** popover with ~16 curated muted swatches (not the 10-color label VIBGYOR) + a **Custom** swatch opening **`react-colorful`** (`HexColorPicker`, ~3KB zero-dep) for any hex. Selected = a dot. On project create + Edit Project modal.
- Project color dot in sidebar project rows + board group headers/cards. Default (none) = neutral.

### Add / edit entry (inline popover)
- Click empty slot -> popover at the slot: searchable **task** select, **start** + **end** time inputs (prefilled clicked-hour -> +30m), Save / Cancel. Inline `end > start` validation below the field. Click a block opens the same popover prefilled + **Delete**. `<label>`s on all fields.

### UX Rules in scope for this feature
- [ ] `color-contrast` (CRITICAL) - block text on pastel fill, muted hour labels, elapsed text all >= 4.5:1.
- [ ] `focus-states` (CRITICAL) - play/stop, toggle, arrows, swatches, popover fields, focusable blocks show the accent ring.
- [ ] `touch-targets` (CRITICAL) - play/stop, bar-stop, arrows, swatches >= 44px.
- [ ] `aria-labels` (CRITICAL) - icon-only play/stop/arrows/now get labels.
- [ ] `loading-states` (HIGH) - timeline fetch + start/stop feedback.
- [ ] `form-labels` (HIGH) - add-entry popover task/start/end have labels.
- [ ] `error-placement` (HIGH) - `end <= start` shows inline in the popover.
- [ ] `color-not-only-indicator` (HIGH) - running = icon + elapsed text, not color alone; blocks carry text.
- [ ] `no-horizontal-scroll` (HIGH) - week columns scroll inside the timeline container, never the page.
- [ ] `disable-during-async` (MEDIUM) - start/stop/save disabled in flight.
- [ ] `cursor-pointer` (MEDIUM) - blocks, swatches, slots clickable.
- [ ] `animation-duration` (MEDIUM) - 150ms hover/fade; the 1s elapsed tick is data, not animation.
- [ ] `responsive-breakpoints` (MEDIUM) - timeline at 320/640/768/1024; week->day collapse at 640.
- [ ] `consistent-icon-sizing` (MEDIUM) - 16px inline (block/bar), 20px buttons.

## Tasks

- [x] 🟩 **Step 1: Backend schema - TimeEntry + Project.Color + migration** `[sequential]` → delivers: the data model both backend slices build on
  - [x] 🟩 `Models/TimeEntry.cs`: Id, TaskId (FK cascade), StartedAt, EndedAt (null=running), CreatedAt, [JsonIgnore] back-nav, `[NotMapped] DurationSeconds`
  - [x] 🟩 Added nullable `Color` to `Models/Project.cs`
  - [x] 🟩 DbContext: `DbSet<TimeEntry>` + cascade config + index on EndedAt + TaskId
  - [x] 🟩 Migration `AddTimeTrackingAndProjectColor` (new table + nullable Color column) applied to dev DB

- [x] 🟩 **Step 2: Backend - TimeEntriesController** `[parallel]` → delivers: the time-tracking API
  - [x] 🟩 DEVIATION: dropped the backend `TimeSummary` helper - the timeline is the only consumer and it needs raw entries to render blocks anyway, so per-day/split math lives FRONTEND (`lib/time.ts`, Step 7). Backend stays thin (CRUD + range query); no dead code.
  - [x] 🟩 `TimeEntriesController`: `start` (auto-stops any running, then opens), `{id}/stop` (idempotent), `POST` manual add (400 end<=start), `PATCH {id}` (edit bounds, present-key), `DELETE {id}`, `GET ?from&to` (OVERLAP filter so overnight timers show), `GET /active`. Responses projected with taskTitle + projectColor (self-contained timeline)
  - [x] 🟩 Validation: task exists (404); single running invariant via StopAllRunning on start; edit/manual require end>start

- [x] 🟩 **Step 3: Backend - Project color** `[parallel]` → delivers: project create/edit carries a color
  - [x] 🟩 `ProjectsController` create + rename accept optional `color` (validated `#RRGGBB` or null); `Project.Color` serializes on all project responses. Backend builds clean.

- [x] 🟩 **Step 4: Frontend - api layer + duration helper** `[sequential]` → depends on: Steps 2, 3
  - [x] 🟩 `lib/api.ts`: `TimeEntry` type + `startTimer`/`stopTimer`/`addTimeEntry`/`updateTimeEntry`/`deleteTimeEntry`/`getTimeEntries`/`getActiveTimeEntry`; `color` on `Project` + threaded through `createProject`/`renameProject`
  - [x] 🟩 `lib/format.ts`: `formatDuration(seconds)` ("1h 23m"/"23m") + `formatClock(seconds)` ("H:MM:SS"); project-literal test fixtures updated for the new `color` field; typecheck clean

- [x] 🟩 **Step 5: Frontend - live timer (context + bar + per-task control)** `[UI]` `[parallel]` → delivers: start/stop anywhere + a live floating bar
  - [x] 🟩 `contexts/TimeTrackingContext.tsx`: active entry + `nowMs` (1s interval only while active) + start/stop (auto-stop server-side) + rehydrate via `getActiveTimeEntry()` on mount; an in-flight ref guards double-clicks
  - [x] 🟩 `TimerControl` (hover-reveal Play / green Stop + live `formatClock`; `alwaysVisible` for the detail page) wired into list rows (tr now `group`), `TaskCard`, `BoardCard`, detail page
  - [x] 🟩 `TrackingBar` (mobile full-width / desktop pill) mounted with the provider in `layout.tsx`; nothing when idle

- [x] 🟩 **Step 6: Frontend - project color UI + nav** `[UI]` `[parallel]` → delivers: pick a project color + reach the timeline
  - [x] 🟩 `ProjectColorPicker` (16 curated swatches + None + `react-colorful` custom hex) on project create + Edit Project modal; color dot in sidebar rows + board project-column headers (`BoardColumn.accentColor`)
  - [x] 🟩 "Time" nav link (Clock) to `/time` in the sidebar; create/edit handlers thread `color` through. Typecheck clean.

- [x] 🟩 **Step 7: Frontend - timeline dashboard `/time`** `[UI]` `[sequential]` → depends on: Steps 4, 5, 6
  - [x] 🟩 `app/time/page.tsx` (shell) + `TimelineView`: day/week toggle (mobile forces day), `< Today >` + date jump
  - [x] 🟩 Hour-grid timeline: 00:00-23:00 axis, day column(s), project-colored blocks (top/height from `lib/time` math; pastel fill + 3px saturated edge), description + time, today tint, red now-line, running entry grows live (off the context tick), midnight split per column
  - [x] 🟩 Click empty slot -> inline add popover (task picker + start/end prefilled +30m); click a block -> edit/delete (running entry is bar-controlled)
  - [x] 🟩 Per-range total header + "By task" breakdown via `lib/time` (`dayTotalSeconds`/`perTaskTotals`)

- [x] 🟩 **Step 8: Tests + verification** `[sequential]` → depends on: Steps 1-7
  - [x] 🟩 Backend: `TimeEntriesControllerTests` (auto-stop-on-start, single-running, manual end<=start 400, edit/delete, overlap range) + project-color validation tests. 285 pass (was 270).
  - [x] 🟩 Frontend: `lib/time` math (`daySegment`/split/min-height/`secondsOnDay`/`perTaskTotals`/`mondayOf`/`dayColumns`) + `formatDuration`/`formatClock`. 155 pass (was 143). MCP untouched (101).
  - [x] 🟩 Browser smoke (Playwright): start timer -> bar; start 2nd task -> 1st auto-stops (server confirmed single running); `/time` renders blocks in week + day; add popover opens prefilled; stop clears the bar; 0 console errors. Screenshots captured.

## Outcomes

Built as planned. Deltas/decisions made during execution:

- **Backend `TimeSummary` helper dropped** - the timeline (the only consumer) needs raw entries to render blocks anyway, so the per-day/split/total math lives in the **frontend `lib/time.ts`** (pure, unit-tested). Backend stays thin: CRUD + an overlap range query. No dead code.
- **`/api/time-entries/active` returns 204 when idle** (ASP.NET serializes `Ok(null)` as No Content); `getActiveTimeEntry` handles 204/empty body -> null.
- **`useTimeTracking` degrades to a no-op default outside its provider** (instead of throwing) so component unit tests (TaskCard/BoardCard) render in isolation. The provider is mounted at the app root, so real usage always gets the live value.
- **TrackingBar desktop pill moved to bottom-LEFT** - the browser smoke caught it colliding with the user's Doppel widget (bottom-right), which intercepted the stop click. Mobile stays full-width bottom.
- **New runtime dep `react-colorful`** (~3KB, zero-dep) for the project color custom-hex picker - 2nd frontend runtime dep after chrono-node; scoped to the picker.
- **`Project.Color` sub-feature** shipped alongside (needed for block colors): nullable column, curated 16-swatch palette + custom hex, sidebar/board color dots.
- **New frontend pattern:** a 1-second-tick context (`TimeTrackingContext`) distinct from `usePolling`'s 30s background refresh - to note in engineering-guidelines at `/document`.
- **Tests:** backend 270 -> 285, frontend 143 -> 155; MCP untouched at 101 (time tools deferred). Browser smoke verified start/auto-stop/bar + timeline (week+day) + add popover + stop, 0 console errors.
- **Carries the unreleased #76 sidebar commit** (this branch was cut after it), so they ship together.

### Post-plan addition: quick-start tracking (persistent bar)
On user request, the tracking bar is now **always present** (Toggl-style): when idle it shows a "What are you working on?" input + Start; submitting **quick-creates an Inbox task** with that title and starts its timer in one step (`TimeTrackingContext.quickStart` -> `createTask` + `startTimer`). The new task then behaves like any other - it appears in the list (a `tasklog:tasks-changed` window event makes `TasksClient` refetch immediately) and accrues further sessions via its normal per-task play control. No schema change (it's a real task, not a task-less entry - the user's chosen model). Browser-verified: type a title -> created + tracking + shows in the list with a running row -> stop returns the idle composer.
