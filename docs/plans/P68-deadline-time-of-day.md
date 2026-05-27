# Feature Implementation Plan: Deadline time-of-day

**Overall Progress:** `100%` (engineering complete; Step 5.3 is a deferred post-ship user spot-check)

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

- [x] 🟩 **Step 5: Deploy + smoke test** `[sequential]` → depends on: Step 4
  - [x] 🟩 5.1 Phone reachable; stashed frontend WIP, deployed clean (exit 0), pop after ship. No migration.
  - [x] 🟩 5.2 Live curl (server now 13:23 IST), throwaways then deleted: timed earlier-today (00:01) -> overdue; timed later-today (23:59) -> today; date-only today -> today. ALL PASSED.
  - [x] 🟩 5.3 DEFERRED user spot-check (non-blocking): web UI add/edit a timed deadline + pill shows it; in Claude, "remind me Friday at 3pm". Verified at API + unit + live-curl level.

## Outcomes

Built as planned; no migration needed (the deadline column was already a `DateTime`, so the entire feature was a `dueStatus` rework + UI).

- **The midnight = date-only sentinel worked cleanly** end to end: backend `TimeOfDay != 0` branch + frontend `hasTimeComponent` (HH:mm substring) agree, with no schema change. Live smoke confirmed all three buckets at a real server time (13:23 IST): a 00:01 deadline read overdue, a 23:59 deadline read today, and a date-only today read today.
- **Backwards-compatible:** all 129 prior dueStatus/backend tests passed untouched after the `today -> now` param change, because date-only deadlines hit the same date-comparison path.
- **One test fixture fix:** the existing TaskCard "shows the deadline" test used a deadline with a non-midnight UTC time, which `formatDeadline` now appends - and the local rendering is tz-dependent. Switched it to a date-only fixture so it stays deterministic.
- **Decided not to add** a timezone selector - deadlines are interpreted in server-local time (IST), consistent with the dueStatus TZ fix (#61). A multi-timezone user would need that, but this is a single-user self-hosted app.
- **Tests:** +4 backend (timed dueStatus), +5 frontend (hasTimeComponent/formatDeadline). Totals 133 backend / 85 MCP / 61 frontend; clean tsc + next build.
- **Pending:** only the hands-on spot-check (5.3), then ship as v2.12.0. After this, only recurring (v2.13.0 + v2.13.1) remains in the roadmap.
