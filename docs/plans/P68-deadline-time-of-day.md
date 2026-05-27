# Feature Implementation Plan: Deadline time-of-day

**Overall Progress:** `0%`

**Tracking issue:** [#68](https://github.com/hydraInsurgent/Tasklog/issues/68)
**Branch:** `feature/deadline-time-of-day-#68`
**Target version:** v2.12.0 (minor) - fourth of [proposal-next-versions.md](proposal-next-versions.md)

## TLDR

Let deadlines carry an optional time-of-day ("due Friday at 3pm"); date-only deadlines still work exactly as before. No DB migration - `Deadline` is already a `DateTime` and the API already binds ISO datetimes. The real work is reworking `dueStatus` to consider the time, and the UI to set/show it. Sequenced before recurring (v2.13.0) so recurrence inherits times.

## Goal State

**Current State:** Deadlines are date-only (stored `T00:00:00`); `dueStatus` compares dates only, so "overdue" means past the calendar day. No way to say 3pm.
**Goal State:** A deadline can optionally include a time. A timed deadline goes `overdue` the moment it passes; a date-only deadline keeps today's all-day behaviour. The forms let you add a time, and the pill shows it.

## Critical Decisions

- **Decision 1: midnight (00:00:00) = "date-only" sentinel - no schema change.** A deadline with `TimeOfDay == 0` is treated as date-only (overdue when the calendar day passes); a non-midnight time is "timed" (overdue when that instant passes). This avoids a separate `HasTime` column/migration. Trade-off: a literal midnight deadline behaves as date-only - rare, and "end of the day" is the sensible reading. Accepted.
- **Decision 2: `ComputeDueStatus` takes full `now` (not just today).** `overdue = hasTime ? deadline < now : deadline.Date < now.Date`. Then `today` if same calendar date, else `this_week`/`later` by `now.Date` (unchanged week logic). The `DueStatus` property passes `DateTime.Now`. Existing date-only dueStatus tests still pass (midnight deadline + the same date math); the param is just renamed `today` -> `now`.
- **Decision 3: `hasTimeComponent(iso)` checks the `HH:mm` substring, not `Date` parsing.** `iso.length > 10 && iso.slice(11,16) !== "00:00"`. Timezone-safe (avoids `new Date("YYYY-MM-DD")` parsing as UTC and shifting the hour in local time).
- **Decision 4: optional `type="time"` input beside the existing date input** (blank time = date-only). Keeps the common date-only flow one field; time is purely additive. `DeadlinePopover` presets stay date-only (quick date sets). No timezone selector - deadlines are interpreted in server-local time, consistent with the dueStatus TZ fix (#61).

<!-- GUIDELINES CHECK: no migration, no new backend pattern (just richer dueStatus). product-design "deadlines are informational" stance softens slightly - flag in /document. -->

## API contract

```
No request shape change. Deadline already binds an ISO datetime:
  date-only:  "2026-06-01"           -> stored 2026-06-01T00:00:00 (date-only / end-of-day)
  timed:      "2026-06-01T15:00:00"  -> stored as-is (overdue once 3pm passes)
dueStatus now reflects the time for "overdue" on timed deadlines.
```

## Tasks

- [ ] 🟥 **Step 1: Backend - dueStatus considers time** `[sequential]` → depends on: nothing
  - [ ] 🟥 1.1 Rework `TaskModel.ComputeDueStatus(DateTime? deadline, DateTime now)`: `hasTime = deadline.Value.TimeOfDay != TimeSpan.Zero`; overdue via the Decision-2 rule; then today/this_week/later on `now.Date`. `DueStatus` getter passes `DateTime.Now`.
  - [ ] 🟥 1.2 Tests: timed deadline earlier-today -> overdue; timed deadline later-today -> today; timed deadline tomorrow -> this_week/later; date-only today -> today (all day); date-only yesterday -> overdue. Existing dueStatus tests (date-only) still pass after the `today`->`now` rename.

- [ ] 🟥 **Step 2: MCP - description note** `[sequential]` → depends on: Step 1
  - [ ] 🟥 2.1 No code change (deadline params already accept datetimes). Add a clause to `create_task`/`update_task` deadline descriptions: "include a time for a specific moment (e.g. 2026-06-01T15:00); date-only = end of day." A light test asserting a datetime deadline serializes unchanged (already covered by existing update body tests - extend only if useful).

- [ ] 🟥 **Step 3: Web UI - time input + display** `[sequential]` → depends on: Step 1 `[UI]`
  - [ ] 🟥 3.1 `format.ts`: add `hasTimeComponent(iso)` + `formatDeadline(iso)` (date, plus ", h:mmaaa" when timed). Keep `formatDate` for created/completed.
  - [ ] 🟥 3.2 `AddTaskForm`: add an optional `type="time"` input beside the date; on submit combine `date` (+ optional `time`) into the deadline string (date-only or `YYYY-MM-DDTHH:mm:ss`); reset both.
  - [ ] 🟥 3.3 `EditTaskModal`: date + optional time inputs prefilled (time only if non-midnight via `hasTimeComponent`); diff compares the canonical `YYYY-MM-DDTHH:mm:ss` (or null) form; send that.
  - [ ] 🟥 3.4 Deadline pill (TaskCard + TasksClient desktop) uses `formatDeadline` so the time shows when present. Detail page deadline row too.
  - [ ] 🟥 3.5 Tests: `hasTimeComponent` (midnight vs timed vs date-only string), `formatDeadline` (with/without time); fixtures unchanged (date-only); keep green; clean tsc + build.

- [ ] 🟥 **Step 4: Docs + CHANGELOG** `[sequential]` → depends on: Steps 1-3
  - [ ] 🟥 4.1 architecture.md: note Deadline may carry a time + the dueStatus time rule. engineering-guidelines: the midnight=date-only sentinel convention. product-design.md: deadlines can have an optional time.
  - [ ] 🟥 4.2 CHANGELOG.md: v2.12.0 section. coverage.md: new counts + checklists.

- [ ] 🟥 **Step 5: Deploy + smoke test** `[sequential]` → depends on: Step 4
  - [ ] 🟥 5.1 Check phone reachable (dozes); stash frontend WIP, `./scripts/deploy-phone.sh`, restore (pop) after. (No migration - no data-integrity check needed beyond the usual.)
  - [ ] 🟥 5.2 Live curl: create a task due later today with a time -> dueStatus "today"; create one due earlier today with a past time -> "overdue"; a date-only today -> "today". Clean up.
  - [ ] 🟥 5.3 DEFERRED user spot-check (non-blocking): web UI add/edit a deadline with a time + pill shows it; in Claude, "remind me Friday at 3pm".

## Outcomes

<!-- Fill in after execution: decision-relevant deltas only. What changed vs. planned? Key decisions made? Assumptions invalidated? -->
