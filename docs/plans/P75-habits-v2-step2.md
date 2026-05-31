# Habits v2 Step 2 - Plan (#75)

**Overall Progress:** `100%`

## TLDR
Two intertwined habit-scheduling improvements, shipped together.
**Part 1 (foundation):** a habit can carry a schedule with no deadline - relax the "recurrence requires a deadline" rule for habits only, hide the Due chip and un-gate the recurrence picker when a task is a habit.
**Part 2 (frequency):** a habit's schedule becomes one of two modes - **specific days** (the existing "every Tue & Thu" recurrence, unchanged) OR **x times a week** (new weekly-target count, calendar week Mon-Sun). Frequency habits get a week-based streak (green = target met, yellow = showed up under target, grey = nothing; streak = consecutive green-or-yellow weeks, grey breaks) and a progress card.

## Goal State
**Current State:** A habit can only schedule itself via a recurrence rule, and that rule requires a deadline (the deadline-anchor rule meant for recurring *tasks*). There is no "x times a week" model; the only streak is consecutive-scheduled-days.

**Goal State:** A habit's schedule is deadline-free and has two selectable modes. Specific-days habits behave exactly as today. Frequency habits track a weekly target with a week-streak and a green/yellow/grey progress view. Non-habit recurring tasks are unchanged (still require a deadline anchor).

## Critical Decisions

- **Deadline relaxation is habits-only.** Non-habit recurring tasks keep the "needs a deadline" rule because the deadline is the anchor that advances on completion (spawn-on-complete). Habits never hit that path (they are checked in, never completed/respawned), so the deadline is dead weight for them.
- **New column `WeeklyTarget` (`int?`, nullable).** `null` = not a frequency habit (uses day-pattern recurrence, or daily if no recurrence). `1..7` = frequency mode. Nullable `int?` has CLR default `null`, so existing rows migrate to `null` with **no `HasDefaultValue`** needed (same reasoning as `IsHabit`). One column only - period is fixed to weekly, so no period column.
- **Two distinct modes, mutually exclusive.** A habit is day-pattern (`Recurrence` set, `WeeklyTarget` null) OR frequency (`WeeklyTarget` set, `Recurrence` null) OR plain daily (both null). Setting `WeeklyTarget` clears `Recurrence`+`SeriesId`; setting `Recurrence` on a habit clears `WeeklyTarget`. Combined "count among chosen days" is parked in the backlog.
- **Period = calendar week, Monday-Sunday.** Matches the app's existing "this week = through upcoming Sunday" convention. Pure helper takes a `weekStartsMonday`-style boundary so it stays clock-free and testable.
- **Frequency streak ignores the target for length; target only colours weeks.** Streak length = consecutive weeks with `>= 1` check-in (bare-minimum showing up keeps it alive), with current-week grace (an in-progress week that is still 0 does not break the run). Green (`>= target`) vs yellow (`1..target-1`) is purely visual for the week cells.
- **`CurrentStreak` is unit-aware.** For a frequency habit `CurrentStreak` holds the **week** streak; for a day-pattern/daily habit it holds the **day** streak. `WeeklyTarget != null` signals the unit. Avoids a redundant parallel field; documented for MCP/Claude consumers.
- **Pure helper precedent.** Frequency math lives in a new `Services/HabitFrequency.cs` - a pure, parameterized static class like `RecurrenceRule` / `HabitStreak` / `ComputeDueStatus`. No new pattern introduced.
- **Frequency habits are "due" every day.** They have `Recurrence = null`, so the existing `occursOn(null, today) = true` already makes the check-in control appear every day and the "not due today" hint never shows. No special-casing in the list path.

<!-- GUIDELINES CHECK: No new pattern. New column follows the IsHabit nullable-default precedent; new streak helper follows the RecurrenceRule/HabitStreak pure-helper precedent. Product scope: "x times a week frequency" is already listed as "Deferred" in product-design.md, so this fulfils anticipated roadmap, not new scope. No deviation from the deviations table is touched. -->

## Tasks

- [x] 🟩 **Step 1: Backend data model + migration** `[sequential]` → delivers: `WeeklyTarget` column
  - [x] 🟩 Add `public int? WeeklyTarget { get; set; }` to `Models/TaskModel.cs` (with an XML comment: null = not a frequency habit; 1-7 = times per calendar week)
  - [x] 🟩 Generate the EF migration (`AddHabitWeeklyTarget`); verified nullable column, NO default (existing rows → null)
  - [x] 🟩 Applied the migration clean against the dev DB

- [x] 🟩 **Step 2: Backend TasksController - decouple deadline + frequency validation** `[sequential]` → depends on: Step 1
  - [x] 🟩 POST create: deadline check now only fires when `!isHabit`; a habit may set `recurrence` with no deadline
  - [x] 🟩 POST create: accept `weeklyTarget`; validates habits-only, range `1..7`, and rejects both `weeklyTarget` + `recurrence` (400)
  - [x] 🟩 PATCH update: same deadline relaxation; `isHabit` moved BEFORE recurrence so the effective habit state gates it (turning habit off clears WeeklyTarget)
  - [x] 🟩 PATCH update: present-key `weeklyTarget` (omit=keep, null=clear, value=set); each mode clears the other; both-in-one-PATCH → 400; non-habit / out of 1-7 → 400
  - [x] 🟩 Spawn-on-complete untouched (still requires deadline + recurrence, which a frequency habit never has)

- [x] 🟩 **Step 3: Backend frequency streak helper + HabitsController** `[parallel]` → delivers: frequency-aware habit responses
  - [x] 🟩 New `Services/HabitFrequency.cs` (pure): `WeekStart` (Monday), `ThisWeekCount`, `WeekStreak` (consecutive weeks >= 1 check-in, current-week grace), `RecentWeeks` -> `WeekStatus { weekStart, count, status }` met/partial/none
  - [x] 🟩 Extended `HabitResponse` with `WeeklyTarget`, `ThisWeekCount`, `RecentWeeks` (null for non-frequency habits); `CurrentStreak` is unit-aware
  - [x] 🟩 HabitsController branches on `task.WeeklyTarget`: week-streak + frequency fields for frequency habits, existing day-streak path otherwise. Backend builds clean.

- [x] 🟩 **Step 4: MCP - weeklyTarget on create/update** `[sequential]` → depends on: Step 2
  - [x] 🟩 Added optional `weeklyTarget` (1-7) to `create_task` / `update_task` Zod schemas + `api-client.ts` (Task interface, createTask, updateTask bodies)
  - [x] 🟩 Tool descriptions note the two mutually-exclusive habit modes. MCP builds clean (tsc).

- [x] 🟩 **Step 5: Frontend - api types + Part 1 decouple UI** `[sequential]` → depends on: Steps 2, 3
  - [x] 🟩 `lib/api.ts`: added `weeklyTarget` to `Task`; added `WeekStatus` + frequency fields to `Habit`; threaded `weeklyTarget` through `createTask`/`updateTask`
  - [x] 🟩 `TaskSheet.tsx`: Due chip hidden when `isHabit` is on
  - [x] 🟩 `RecurrencePicker.tsx`: added `isHabit` prop -> `scheduleEnabled = hasDeadline || isHabit` un-gates controls + hides the deadline hint for habits

- [x] 🟩 **Step 6: Frontend - Part 2 frequency picker + card** `[sequential]` → depends on: Step 5
  - [x] 🟩 `TaskSheet.tsx`: habit schedule chip is a two-mode picker (Specific days / x-times-a-week stepper); save sends `recurrence` XOR `weeklyTarget` so the backend both-mode guard never trips
  - [x] 🟩 `HabitCard.tsx`: frequency branch renders "n/x this week", a week-streak flame, and the coloured week strip (success/warning/border tokens); day-pattern view unchanged
  - [x] 🟩 `TaskDoneControl.tsx`: confirmed no change needed - frequency habit has null recurrence so `occursOn` = true makes check-in interactive every day; existing `isDoneForToday` filter removes it once checked in

- [x] 🟩 **Step 7: Tests + verification** `[sequential]` → depends on: Steps 1-6
  - [x] 🟩 Backend: new `HabitFrequencyTests` (7) + `TasksControllerTests` validation (13) - deadline-free habit recurrence, weeklyTarget range, mode exclusivity, non-habit rejection, turn-off clears target
  - [x] 🟩 MCP `weeklyTarget` wire-contract block (4); frontend HabitCard frequency tests (2)
  - [x] 🟩 All suites green: backend 270, frontend 138, MCP 101. API smoke: created a deadline-free 3x/week habit, checked in, `/api/habits` returned weeklyTarget/thisWeekCount/currentStreak(week)/recentWeeks correctly

## Outcomes

Built as planned, no deviations from the design.

- **Data model:** one nullable `WeeklyTarget` column (migration `AddHabitWeeklyTarget`); existing rows -> null, no `HasDefaultValue` needed.
- **Backend contract:** deadline gate relaxed for habits only (POST + PATCH); `weeklyTarget` validated habits-only, 1-7, mutually exclusive with recurrence; PATCH processes `isHabit` before recurrence/weeklyTarget so the effective habit state gates the deadline rule, and each mode clears the other (the both-in-one-PATCH case 400s). Spawn-on-complete untouched.
- **Streak:** new pure `Services/HabitFrequency.cs` (WeekStart Monday, ThisWeekCount, WeekStreak with current-week grace, RecentWeeks met/partial/none). `HabitResponse.CurrentStreak` is unit-aware (weeks for frequency, days otherwise); added `WeeklyTarget`/`ThisWeekCount`/`RecentWeeks` (null for non-frequency habits).
- **Frontend:** Due chip hidden for habits; `RecurrencePicker` gains `isHabit` to un-gate without a deadline; `TaskSheet` schedule chip is a two-mode picker (Specific days / x-times-a-week stepper) whose save sends recurrence XOR weeklyTarget; `HabitCard` frequency branch shows "n/x this week" + a coloured week strip (success/warning/border tokens) + a week-streak. `TaskDoneControl` needed no change (frequency habit has null recurrence -> `occursOn` true -> checkable daily).
- **MCP:** `create_task`/`update_task` gained `weeklyTarget` (1-7).
- **Decision held:** combined "count + chosen days" and "x per month" stayed out of scope (backlogged). No new engineering pattern; new column and helper follow existing precedents.
- **Tests:** backend 250 -> 270, frontend 136 -> 138, MCP 97 -> 101. Live API smoke confirmed the deadline-free frequency-habit flow.
