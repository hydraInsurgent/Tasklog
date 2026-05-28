# Feature Implementation Plan: Habit tracking

**Overall Progress:** `100%`

**Tracking issue:** [#74](https://github.com/hydraInsurgent/Tasklog/issues/74)
**Branch:** `feature/habit-tracking-#74`
**Target version:** v2.16.0 (minor - new capability + DB migration) - finale of [proposal-recurring-and-habits.md](proposal-recurring-and-habits.md)

## TLDR

Turn a task into a habit you check off each day. A task gets an `IsHabit` toggle; on a Habits view you tap "done today" to log a dated check-in; each habit shows its current streak (consecutive days) and a last-7-days dot row. Reuses the v2.13.0 completion-log idea as a dedicated `CheckIns` table. Claude can check a habit in over MCP. A calendar heatmap is a deliberate later add (the check-in data will power it).

## Goal State

**Current State:** Tasks are one-shot (complete/incomplete). Recurring tasks spawn occurrences, but there's no notion of an ongoing daily habit or a streak.
**Goal State:** Any task can be flagged a habit. The Habits view lists them with a streak + 7-day dots + a done-today toggle. Check-ins are per-day and idempotent. The streak is a pure, testable computation over check-in dates.

## Critical Decisions

All locked with the user.

- **Decision 1: A habit is a dedicated `IsHabit` flag on the task, not a "habit" label.**
  - **Options considered:** (a) a label literally named `"habit"` marks habits - reuses the label system but makes a magic string special (rename/delete breaks it) and conflates tags with a behavioral property; (b) a dedicated `IsHabit` boolean column.
  - **Chosen:** (b). Being a habit attaches behavior (check-ins, streaks, a view), so it's a first-class property, not a tag. We're already adding a migration for check-ins, so the extra column is ~free; no magic-string fragility; clean `WHERE IsHabit` queries and an honest `isHabit` MCP field.
  - **Trade-offs accepted:** a new task field + a toggle in the form (vs. reusing the label UI). Small.

- **Decision 2: Check-ins are a dedicated `CheckIns` table, one row per task per day.** A `UNIQUE (TaskId, CheckInDate)` index makes "done today" idempotent. Cleaner streak queries than flagging comments (which mixes notes with check-ins).

- **Decision 3: Streak is a pure static helper** (`HabitStreak.CurrentStreak(dates, today)`), mirroring the `RecurrenceRule`/`ComputeDueStatus` precedent - clock-free, unit-testable with an injected `today`. Consecutive days back from today; a grace rule counts through yesterday when today isn't checked in yet (so a not-yet-done habit still shows its run).

- **Decision 4: A dedicated `/api/habits` response shape** carries the per-habit check-in history + streak + `doneToday`, rather than bloating every task response. `IsHabit` itself is a normal serialized column on the task.

- **Decision 5: Heatmap deferred.** The `CheckIns` rows are the data a GitHub-style calendar heatmap needs; it's a clean later phase, out of scope now.

<!-- GUIDELINES CHECK: New entity (CheckIn) + a new CheckInsController - same EF + controller patterns as Comments (#69), no new architecture. IsHabit is a bool defaulting false = the CLR zero-value, so the generated migration's default 0 is correct and existing rows migrate fine WITHOUT HasDefaultValue (contrast Priority's non-zero default which needed HasDefaultValue(4) - see learnings/orm-migration-default-values). Streak reuses the pure-static-helper precedent. /habits view = the standalone-route pattern already used by /labels. Migration -> minor. product-design "Tasks" gains habits. No external spec/research. -->

## Data model + API

```
Tasks gains:  IsHabit  INTEGER not null default 0  (boolean)

CheckIns (new)
  Id          INTEGER primary key
  TaskId      INTEGER not null  FK -> Tasks.Id (cascade delete)
  CheckInDate TEXT    not null  (date-only, local midnight)
  CreatedAt   TEXT    not null
  UNIQUE (TaskId, CheckInDate)

POST   /api/tasks/{taskId}/checkins      body { date? } (default today). Idempotent: existing -> 200; new -> 201; 404 task missing
DELETE /api/tasks/{taskId}/checkins      undo today's check-in -> 204; 404 if none (also /checkins/{date})
GET    /api/habits                       tasks where IsHabit, each + recentCheckIns (last ~30d) + currentStreak + doneToday
POST   /api/tasks                         body adds isHabit?
PATCH  /api/tasks/{id}                    body adds isHabit (present-key)

MCP: log_habit_checkin(taskId, date?) ; isHabit on create_task/update_task + in the Task shape.
```

## Tasks

- [x] 🟩 **Step 1: Backend - IsHabit + CheckIns + streak + endpoints** `[sequential]` → depends on: nothing
  - [x] 🟩 1.1 `TaskModel`: add `bool IsHabit` (default false). `CheckIn` model (Id, TaskId, CheckInDate, CreatedAt, `[JsonIgnore] Task` back-nav). DbContext: `DbSet<CheckIn>`, cascade FK, `HasIndex(TaskId, CheckInDate).IsUnique()`. No `HasDefaultValue` needed for IsHabit (false = CLR zero).
  - [x] 🟩 1.2 `AddHabitsAndCheckIns` migration via global dotnet-ef (IsHabit column + CheckIns table + unique index); verified clean defaults.
  - [x] 🟩 1.3 `Services/HabitStreak.cs` pure helper: `CurrentStreak(IReadOnlyCollection<DateTime> dates, DateTime today)` - consecutive days back from today, grace through yesterday.
  - [x] 🟩 1.4 `CheckInsController` at `api/tasks/{taskId}/checkins`: POST (idempotent, 200 existing / 201 new, 404 task), DELETE (`?date=` or today; 204 / 404), GET list.
  - [x] 🟩 1.5 `HabitsController` `GET /api/habits` returns `HabitResponse` (task + recentCheckIns + currentStreak + doneToday). `Create`/`Update` accept `isHabit`.
  - [x] 🟩 1.6 Tests: `HabitStreakTests` (9) + `CheckInsControllerTests` (8) + `TasksControllerTests` IsHabit (7) + `HabitsControllerTests` (5). All 245 backend tests green (216 → 245).

- [x] 🟩 **Step 2: MCP - check-in tool + isHabit** `[sequential]` → depends on: Step 1
  - [x] 🟩 2.1 `api-client.ts`: `Task.isHabit` + `CheckIn` interface; `createTask`/`updateTask` carry `isHabit`; `addCheckIn(taskId, date?)`.
  - [x] 🟩 2.2 `tools/tasks.ts`: `log_habit_checkin` tool (taskId + optional date); `isHabit` param on `create_task`/`update_task`; header comment refreshed (13 → 14 tools, habits note).
  - [x] 🟩 2.3 `api-client.test.ts`: check-in wire contract + isHabit on create/update + Task shape. Typecheck clean; 97 MCP tests green (92 → 97).

- [x] 🟩 **Step 3: Web UI - Habits view + check-ins + habit toggle** `[sequential]` → depends on: Step 1 `[UI]`
  - [x] 🟩 3.1 `api.ts`: `Task.isHabit` + `CheckIn`/`Habit` types; create/update carry `isHabit`; `addCheckIn`/`removeCheckIn`; `getHabits()`.
  - [x] 🟩 3.2 A "Track as a daily habit" checkbox on `AddTaskForm` + `EditTaskModal` (diffed on save).
  - [x] 🟩 3.3 New `/habits` route (mirrors `/labels`) + a "Habits" sidebar link (Flame icon) in `ProjectSidebar`. `HabitsClient` (fetch + poll + optimistic toggle) + `HabitCard`: title, streak (flame + count), last-7-days dot row, big done-today toggle. `format.lastNDays` helper for the dots.
  - [x] 🟩 3.4 127 frontend tests green (118 → 127: +6 HabitCard, +3 lastNDays); tsc clean; new files lint-clean.

- [x] 🟩 **Step 4: Docs + CHANGELOG** `[sequential]` → depends on: Steps 1-3
  - [x] 🟩 4.1 `architecture.md`: IsHabit column + CheckIns table + checkin/habits endpoints + `/habits` route + HabitStreak helper + controllers/components. `product-design.md`: tasks can be habits with daily check-ins + streaks. `README.md`: recurring+habits feature group. `engineering-guidelines.md`: no new pattern (reused EF entity + pure-helper + standalone-route).
  - [x] 🟩 4.2 `CHANGELOG.md`: v2.16.0 section. `coverage.md`: counts (245/97/127) + checklists. `proposal-recurring-and-habits.md`: program marked COMPLETE (5/5).

- [x] 🟩 **Step 5: Deploy + smoke test + ship** `[sequential]` → depends on: Step 4
  - [x] 🟩 5.1 Phone reachable; baseline 25 tasks. Tree clean (only `.claude/*`; doppel committed) so no stash dance. Deployed; migration applied with zero data loss (still 25 tasks; `/api/habits` live 200 + []).
  - [x] 🟩 5.2 Live curl smoke passed: create habit (id 69) -> POST checkin 201 -> same-day 200 (idempotent) -> `/api/habits` streak 1 + doneToday true -> DELETE 204 -> streak 0 + doneToday false -> cleanup delete 204 -> back to 25 tasks.
  - [x] 🟩 5.3 DEFERRED user spot-check (non-blocking, same as v2.15.0): on the phone Habits view, flag a task a habit + tap done; in Claude "mark my <habit> done".

## Outcomes

**What changed vs. planned:** Built exactly as planned, no scope deviations. Two small refinements during execution:
- `HabitsController` returns a named `HabitResponse` record (not an anonymous type) so the endpoint is assertable from the test assembly. Cleaner anyway.
- Added `format.lastNDays` as a pure, testable helper for the 7-day dot model (the plan flagged it as "if useful" - it was).

**Key decisions held:** `IsHabit` bool needs NO `HasDefaultValue` (false = CLR zero, verified in the migration); `HabitStreak` is a pure static helper (clock injected); check-ins idempotent via unique `(TaskId, CheckInDate)`; a dedicated `/api/habits` shape keeps check-in data off ordinary task responses (`CheckIns` is `[JsonIgnore]`). Optimistic streak delta on the web toggle is always +/-1 (consequence of the grace rule).

**Tests:** backend 216 -> 245, MCP 92 -> 97, frontend 118 -> 127. All green. Live smoke confirmed the full cycle on the phone with zero data change.

**Deferred (by design):** GitHub-style calendar heatmap (the `CheckIns` rows already support it); the original sketch's schedule-derived skip detection / "did you do it?" prompts / completion-as-comment logging.

**Program complete:** this is the finale of the recurring + habits program (v2.13.0 comments -> v2.14.0 recurrence -> v2.14.1 advanced grammar -> v2.15.0 quick-add -> v2.16.0 habits).
