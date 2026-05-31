# Habits v2 Step 2 - Plan (#75)

**Overall Progress:** `0%`

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

- [ ] 🟥 **Step 1: Backend data model + migration** `[sequential]` → delivers: `WeeklyTarget` column
  - [ ] 🟥 Add `public int? WeeklyTarget { get; set; }` to `Models/TaskModel.cs` (with an XML comment: null = not a frequency habit; 1-7 = times per calendar week)
  - [ ] 🟥 Generate the EF migration (`dotnet ef migrations add AddHabitWeeklyTarget`); verify it adds a nullable column with NO default (existing rows → null)
  - [ ] 🟥 Apply / verify the migration runs clean against the dev DB

- [ ] 🟥 **Step 2: Backend TasksController - decouple deadline + frequency validation** `[sequential]` → depends on: Step 1
  - [ ] 🟥 POST create: relax the "recurring task needs a deadline" check so it only fires when `!IsHabit`; a habit may set `recurrence` with no deadline (parse + serialize as today)
  - [ ] 🟥 POST create: accept `weeklyTarget`; validate `IsHabit` is true when set, range `1..7`, and reject setting both `weeklyTarget` and `recurrence` (400); setting `weeklyTarget` leaves `Recurrence`/`SeriesId` null
  - [ ] 🟥 PATCH update: same deadline relaxation, computing the EFFECTIVE `IsHabit` (apply the body's `isHabit` first so a same-PATCH habit toggle is respected)
  - [ ] 🟥 PATCH update: present-key handling for `weeklyTarget` (omit=keep, `null`=clear, value=set); setting a value clears `Recurrence`+`SeriesId`; setting `recurrence` clears `WeeklyTarget`; `weeklyTarget` on a non-habit / out of 1-7 → 400
  - [ ] 🟥 Confirm spawn-on-complete is untouched (it already requires both a deadline and a recurrence, which a frequency habit never has)

- [ ] 🟥 **Step 3: Backend frequency streak helper + HabitsController** `[parallel]` → delivers: frequency-aware habit responses (independent file from Step 2; both depend only on Step 1)
  - [ ] 🟥 New `Services/HabitFrequency.cs` (pure, parameterized by `today`): `WeekStart(date)` (Monday), `ThisWeekCount(checkIns, today)`, `WeekStreak(checkIns, today)` (consecutive weeks with >= 1 check-in, current-week grace), `RecentWeeks(checkIns, today, target, n)` -> list of `{ weekStart, count, status }` where status = met/partial/none
  - [ ] 🟥 Extend `HabitResponse` with `WeeklyTarget` (int?), `ThisWeekCount` (int?), `RecentWeeks` (list?, null for non-frequency habits)
  - [ ] 🟥 In `HabitsController`: when `task.WeeklyTarget` is set, compute `CurrentStreak` via `HabitFrequency.WeekStreak` and populate the frequency fields; otherwise keep the existing `HabitStreak.CurrentStreak` path and leave frequency fields null

- [ ] 🟥 **Step 4: MCP - weeklyTarget on create/update** `[sequential]` → depends on: Step 2
  - [ ] 🟥 Add optional `weeklyTarget` to the `create_task` / `update_task` Zod schemas (1-7) and to `api-client.ts` request bodies
  - [ ] 🟥 Update tool descriptions to note the two habit modes (specific-days recurrence vs weeklyTarget) and that they are mutually exclusive

- [ ] 🟥 **Step 5: Frontend - api types + Part 1 decouple UI** `[sequential]` → depends on: Steps 2, 3
  - [ ] 🟥 `lib/api.ts`: add `weeklyTarget: number | null` to `Task`; add the frequency fields to `Habit` (`weeklyTarget`, `thisWeekCount`, `recentWeeks`); thread `weeklyTarget` through `createTask`/`updateTask`
  - [ ] 🟥 `TaskSheet.tsx`: hide the Due chip when `isHabit` is on
  - [ ] 🟥 `RecurrencePicker.tsx`: un-gate controls when it is a habit (controls disabled only when `!hasDeadline && !isHabit`); hide the "Set a deadline to make this task repeat" hint for habits

- [ ] 🟥 **Step 6: Frontend - Part 2 frequency picker + card** `[sequential]` → depends on: Step 5
  - [ ] 🟥 `TaskSheet.tsx`: when `isHabit`, the schedule picker offers two modes - "Specific days" (existing RecurrencePicker) and "x times a week" (a 1-7 stepper); selecting one clears the other (send `recurrence`/`weeklyTarget` accordingly on save)
  - [ ] 🟥 `HabitCard.tsx`: when `weeklyTarget != null`, render the frequency view - "n/x this week", a week-streak flame, and a row of recent-week cells coloured green/yellow/grey (reuse `--color-success/warning` + a muted token); otherwise the existing day-pattern view
  - [ ] 🟥 `TaskDoneControl.tsx`: confirm a frequency habit (recurrence null) shows the interactive check-in every day and leaves the day's list after today's check-in (should already hold via `occursOn(null)` = true; add a label "n/x this week" if helpful)

- [ ] 🟥 **Step 7: Tests + verification** `[sequential]` → depends on: Steps 1-6
  - [ ] 🟥 Backend unit tests: `HabitFrequency` (week boundary, this-week count, streak grace, green/yellow/grey classification) + TasksController validation (deadline-free habit recurrence, weeklyTarget range, mode exclusivity, non-habit rejection)
  - [ ] 🟥 MCP test for the new `weeklyTarget` field; frontend test for the two-mode picker + frequency HabitCard
  - [ ] 🟥 Run all three suites green; manual smoke: create a frequency habit, check in, see progress + streak; create a deadline-free specific-days habit

## Outcomes
<!-- Fill in after execution: decision-relevant deltas only. -->
