# Feature Implementation Plan: Deadline time-of-day

**Overall Progress:** `80%`

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

- [x] 🟩 **Step 1: Backend - dueStatus considers time** `[sequential]` → depends on: nothing
  - [x] 🟩 1.1 Reworked `ComputeDueStatus(deadline, now)` with the hasTime/midnight rule; `DueStatus` getter passes `DateTime.Now`.
  - [x] 🟩 1.2 +4 tests (timed past-today -> overdue, timed future-today -> today, date-only-today all day, timed tomorrow -> this_week). All 129 existing tests still pass (date-only unaffected). 133 backend total.

- [x] 🟩 **Step 2: MCP - description note** `[sequential]` → depends on: Step 1
  - [x] 🟩 2.1 Added the datetime clause to `create_task` + `update_task` deadline describe text (date = end of day; datetime = specific moment). No code/schema change; existing deadline body tests already cover datetime serialization. 85 MCP tests pass.

- [x] 🟩 **Step 3: Web UI - time input + display** `[sequential]` → depends on: Step 1 `[UI]`
  - [x] 🟩 3.1 `format.ts`: added `hasTimeComponent(iso)` (HH:mm substring) + `formatDeadline(iso)` (date + locale time when timed). `formatDate` kept for created/completed.
  - [x] 🟩 3.2 `AddTaskForm`: optional `type=time` input beside the date (disabled w/o a date); combines on submit; resets both.
  - [x] 🟩 3.3 `EditTaskModal`: `toTimeInput` helper + time state prefilled; diff compares the canonical `YYYY-MM-DDTHH:mm:ss`/null form; Clear resets both.
  - [x] 🟩 3.4 Deadline pill (TaskCard + TasksClient desktop) + detail-page deadline row use `formatDeadline`.
  - [x] 🟩 3.5 +5 tests (hasTimeComponent x3, formatDeadline x2); fixed the TaskCard deadline test to a date-only fixture (the old one had a tz-dependent time). 61 frontend tests green; clean tsc + next build.

- [x] 🟩 **Step 4: Docs + CHANGELOG** `[sequential]` → depends on: Steps 1-3
  - [x] 🟩 4.1 architecture.md: Deadline-may-carry-time + dueStatus time rule. engineering-guidelines: midnight=date-only sentinel pattern. product-design.md: optional deadline time.
  - [x] 🟩 4.2 CHANGELOG.md: v2.12.0 section. coverage.md: counts (133 backend / 85 MCP / 61 frontend) + dueStatus-time + format checklists.

- [ ] 🟥 **Step 5: Deploy + smoke test** `[sequential]` → depends on: Step 4
  - [ ] 🟥 5.1 Check phone reachable (dozes); stash frontend WIP, `./scripts/deploy-phone.sh`, restore (pop) after. (No migration - no data-integrity check needed beyond the usual.)
  - [ ] 🟥 5.2 Live curl: create a task due later today with a time -> dueStatus "today"; create one due earlier today with a past time -> "overdue"; a date-only today -> "today". Clean up.
  - [ ] 🟥 5.3 DEFERRED user spot-check (non-blocking): web UI add/edit a deadline with a time + pill shows it; in Claude, "remind me Friday at 3pm".

## Outcomes

<!-- Fill in after execution: decision-relevant deltas only. What changed vs. planned? Key decisions made? Assumptions invalidated? -->
