# Feature Implementation Plan: Habit tracking

**Overall Progress:** `0%`

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

- [ ] 🟥 **Step 1: Backend - IsHabit + CheckIns + streak + endpoints** `[sequential]` → depends on: nothing
  - [ ] 🟥 1.1 `TaskModel`: add `bool IsHabit` (default false). `CheckIn` model (Id, TaskId, CheckInDate, CreatedAt, `[JsonIgnore] Task` back-nav). DbContext: `DbSet<CheckIn>`, cascade FK, `HasIndex(TaskId, CheckInDate).IsUnique()`. No `HasDefaultValue` needed for IsHabit (false = CLR zero).
  - [ ] 🟥 1.2 `AddHabitsAndCheckIns` migration via global dotnet-ef (IsHabit column + CheckIns table + unique index); verify no surprise defaults.
  - [ ] 🟥 1.3 `Services/HabitStreak.cs` pure helper: `CurrentStreak(IReadOnlyCollection<DateTime> dates, DateTime today)` - consecutive days back from today, grace through yesterday.
  - [ ] 🟥 1.4 `CheckInsController` at `api/tasks/{taskId}/checkins`: POST (idempotent, 200 existing / 201 new, 404 task), DELETE today or `/{date}` (204 / 404).
  - [ ] 🟥 1.5 `GET /api/habits` (a HabitsController or a TasksController action): habit tasks + recentCheckIns + currentStreak + doneToday. `Create`/`Update` accept `isHabit`.
  - [ ] 🟥 1.6 Tests: `HabitStreakTests` (run / gap-breaks / today-grace / empty=0 / single-today=1) + `CheckInsControllerTests` (idempotent 200, new 201, delete 204, delete-missing 404, task 404, list) + `TasksControllerTests` (IsHabit on create + update set/unset) + Habits endpoint (only IsHabit, streak+doneToday). All backend tests green.

- [ ] 🟥 **Step 2: MCP - check-in tool + isHabit** `[sequential]` → depends on: Step 1
  - [ ] 🟥 2.1 `api-client.ts`: `Task.isHabit`; `createTask`/`updateTask` carry `isHabit`; `addCheckIn(taskId, date?)`.
  - [ ] 🟥 2.2 `tools/tasks.ts`: `log_habit_checkin` tool (taskId + optional date; "mark a habit done"); `isHabit` param on `create_task`/`update_task`; refresh the header/tool-count comment.
  - [ ] 🟥 2.3 `api-client.test.ts`: check-in wire contract + isHabit on create/update + Task shape. Typecheck clean; MCP tests green.

- [ ] 🟥 **Step 3: Web UI - Habits view + check-ins + habit toggle** `[sequential]` → depends on: Step 1 `[UI]`
  - [ ] 🟥 3.1 `api.ts`: `Task.isHabit`; create/update carry `isHabit`; `addCheckIn`/`removeCheckIn`; `getHabits()` (each: task + recentCheckIns + currentStreak + doneToday).
  - [ ] 🟥 3.2 A "Habit" toggle on `AddTaskForm` + `EditTaskModal`.
  - [ ] 🟥 3.3 New `/habits` route (server component fetches `getHabits`) + a "Habits" sidebar link in `ProjectSidebar` (mirror the `/labels` link). `HabitsClient` + `HabitCard`: title, streak (flame + count), last-7-days dot row, big done-today toggle (optimistic add/remove check-in, updates streak/dots).
  - [ ] 🟥 3.4 Frontend tests green; clean tsc + next build. `HabitCard` (streak + 7 dots + done-today toggles) + `getHabits`/`addCheckIn` wire + the habit toggle, where practical.

- [ ] 🟥 **Step 4: Docs + CHANGELOG** `[sequential]` → depends on: Steps 1-3
  - [ ] 🟥 4.1 `architecture.md`: IsHabit column + CheckIns table + the checkin/habits endpoints + the new `/habits` view + HabitStreak helper. `product-design.md`: tasks can be habits with daily check-ins + streaks. `engineering-guidelines.md`: only if a new pattern emerges (none expected).
  - [ ] 🟥 4.2 `CHANGELOG.md`: v2.16.0 section. `coverage.md`: counts + checklists. `proposal-recurring-and-habits.md`: mark habit-tracking (v2.16.0) shipped → program complete.

- [ ] 🟥 **Step 5: Deploy + smoke test + ship** `[sequential]` → depends on: Step 4
  - [ ] 🟥 5.1 Check phone reachable + capture live task count. Stash-deploy-pop only if new uncommitted WIP (doppel is committed). Deploy. CONFIRM the migration applied with zero data loss (count unchanged; CheckIns table created).
  - [ ] 🟥 5.2 Live curl: create/flag a habit; POST checkin -> 201; POST same day -> 200 (idempotent); GET /api/habits shows it streak 1 + doneToday true; DELETE -> 204, streak 0. Clean up.
  - [ ] 🟥 5.3 DEFERRED user spot-check (non-blocking): on the phone, flag a task a habit, check it in on the Habits view, watch the streak/dots; in Claude, "mark my <habit> done".

## Outcomes

<!-- Fill in after execution: decision-relevant deltas only. What changed vs. planned? Key decisions made? Assumptions invalidated? -->
