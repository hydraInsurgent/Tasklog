# Feature Implementation Plan: Advanced recurrence grammar

**Overall Progress:** `0%`

**Tracking issue:** [#71](https://github.com/hydraInsurgent/Tasklog/issues/71)
**Branch:** `feature/advanced-recurrence-grammar-#71`
**Target version:** v2.15.0 (minor - NO migration) - third of [proposal-recurring-and-habits.md](proposal-recurring-and-habits.md)
**Research:** [rrule-rfc5545-2026-05-27.md](../research/rrule-rfc5545-2026-05-27.md) (v2.15.0 table)

## TLDR

Extend the v2.14.0 recurrence core to the harder RFC 5545 forms it currently rejects: nth-weekday-of-month ("3rd Thursday", "last Friday"), day-from-month-end ("last day"), end conditions (`UNTIL` a date / `COUNT` N times), and `INTERVAL>1` for weekly/monthly ("every other Monday", "every 2 months"). This is mostly turning the parser's existing reject-branches into accept-branches, extending the `NextDeadline` expander, and adding one new seam: an end-condition gate in the spawn-on-complete path so a series can stop.

## Goal State

**Current State:** Recurrence supports daily / every-N-days / weekly-on-weekday(s) / monthly-on-day, and repeats forever. Everything else is a 400.
**Goal State:** The same plus nth-weekday / last-day / negative month-day / weekly+monthly intervals, and an optional end (a date or a count) after which the series stops spawning. No new storage - it all lives in the RRULE string and the existing SeriesId history.

## Critical Decisions

All locked in `/explore` (RFC 5545 / Todoist conventions).

- **Decision 1: No new DB column; end conditions live in the rule string.** `UNTIL` is a date compared to the next deadline; `COUNT` is evaluated at spawn time by counting rows with the same `SeriesId`. Completing occurrence #k sees exactly k rows, so it spawns iff `k < COUNT` → exactly `COUNT` occurrences. Keeps v2.15.0 migration-free. Trade-off: deleting a mid-series occurrence skews the `COUNT` tally (acceptable - deletion is rare and destructive; documented).

- **Decision 2: nth-weekday via `BYDAY` ordinal, not `BYSETPOS`.** `BYDAY=3TH` / `-1MO` is the simpler canonical form for every case Tasklog supports, so raw `BYSETPOS` is unnecessary and stays rejected. Only one ordinaled weekday allowed; ordinals `+1..+4` and `-1`; a non-existent `+5` clamps to the last occurrence.

- **Decision 3: `INTERVAL>1` weekly is week-anchored.** A candidate day is valid when its week (Sunday-start, matching `ComputeDueStatus`) is `weekDiff % INTERVAL == 0` from the current deadline's week. This unifies single- and multi-weekday at any interval and reduces to "next matching weekday" at `INTERVAL=1`. Monthly advances `AddMonths(INTERVAL)`.

- **Decision 4: The end-condition gate is the one new control-flow seam.** `RecurrenceRule.ShouldSpawn(next, existingSeriesCount)` returns whether to spawn; `TasksController.Complete` counts the series and calls it. When the series ends, the task is still completed and a "series complete" comment is logged - just no new occurrence.

<!-- GUIDELINES CHECK: No new pattern - extends the pure static RecurrenceRule helper (v2.14.0). No migration (minor bump). product-design recurrence line gains the advanced forms. Research file already carries the v2.15.0 semantics. The end-condition gate in Complete is the only new seam; create/update accept the new grammar automatically once TryParse does. -->

## API contract (unchanged shape; grammar widened)

```
recurrence (string) now also accepts:
  FREQ=MONTHLY;BYDAY=3TH            3rd Thursday each month  (ordinal +1..+4, or -1 = last)
  FREQ=MONTHLY;BYMONTHDAY=-1        last day of the month    (-1..-28)
  FREQ=WEEKLY;INTERVAL=2;BYDAY=MO   every other Monday
  FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=1   every 3 months on the 1st
  ...;UNTIL=20261231               stops after that date
  ...;COUNT=5                      stops after 5 occurrences   (UNTIL/COUNT mutually exclusive)

Still rejected (400): BYSETPOS, BYWEEKNO, BYYEARDAY, SECONDLY/MINUTELY/HOURLY/YEARLY,
  >1 ordinaled weekday, ordinal outside {+1..+4,-1}, BYMONTHDAY beyond ±28..31 range, UNTIL+COUNT together.

Completing a recurring task whose end condition is reached: marks it done + logs
"Completed {date} - recurrence series complete." and does NOT spawn a new occurrence.
```

## Tasks

- [ ] 🟥 **Step 1: Backend - extend RecurrenceRule + end-condition gate** `[sequential]` → depends on: nothing
  - [ ] 🟥 1.1 `RecurrenceRule` fields: add `int? Ordinal`, `DateTime? Until`, `int? Count`; allow negative `MonthDay`; honor `Interval` for weekly + monthly. Update the constructor.
  - [ ] 🟥 1.2 `TryParse` accept-branches: `BYDAY` ordinal token (`3TH`/`-1MO`) → `Ordinal` + single weekday (reject >1 ordinaled day, ordinal outside {+1..+4,-1}); negative `BYMONTHDAY` (-1..-28); weekly/monthly `INTERVAL>1`; `UNTIL` (YYYYMMDD or ISO) → DateTime; `COUNT` (>=1) → int; reject `UNTIL`+`COUNT` together. Keep rejecting `BYSETPOS`/`BYWEEKNO`/`BYYEARDAY`/sub-daily/`YEARLY`.
  - [ ] 🟥 1.3 `Serialize` round-trips all new parts in canonical order (`FREQ;INTERVAL;BYDAY|BYMONTHDAY;UNTIL|COUNT`).
  - [ ] 🟥 1.4 `NextDeadline`: monthly nth-weekday (first-of-target-month → first matching weekday → `+7*(N-1)`, clamp `+5`→last; `-1`→last); negative `BYMONTHDAY` (`daysInMonth+1+value`, clamp); weekly `INTERVAL>1` (week-anchored, `weekDiff%Interval==0`); monthly `INTERVAL>1` (`AddMonths(Interval)`). Time-of-day preserved.
  - [ ] 🟥 1.5 New `bool ShouldSpawn(DateTime next, int existingSeriesCount)` → `(Until==null || next.Date<=Until) && (Count==null || existingSeriesCount<Count)`.
  - [ ] 🟥 1.6 `TasksController.Complete`: in the recurring branch, `existingCount = CountAsync(SeriesId)`, spawn only if `rule.ShouldSpawn(next, existingCount)`; when the series ends, mark complete + log "Completed {date} - recurrence series complete." (no spawn). Spawning path keeps the existing "next occurrence due" comment.
  - [ ] 🟥 1.7 Tests: `RecurrenceRuleTests` (nth-weekday +1..+4/-1/clamp-5th; negative month-day/-1/clamp; weekly INTERVAL=2 single+multi; monthly INTERVAL=2; UNTIL/COUNT round-trip; reject >1 ordinaled / UNTIL+COUNT / bad ordinal; `ShouldSpawn` truth table) + `TasksControllerTests` (COUNT stops at the Nth; UNTIL stops past the date; series-complete comment; nth-weekday/interval spawn advances right). All backend tests green.

- [ ] 🟥 **Step 2: MCP - teach the new grammar** `[sequential]` → depends on: Step 1
  - [ ] 🟥 2.1 Extend `RECURRENCE_DESCRIPTION` in `tools/tasks.ts` with the new forms + 1-2 examples (3rd-Thursday, last-day, every-other-week, UNTIL, COUNT). No api-client signature change (recurrence is already a string).
  - [ ] 🟥 2.2 `api-client.test.ts`: 1-2 wire-contract cases for the new rule strings (they're strings, so mostly documentation). Typecheck clean; MCP tests green.

- [ ] 🟥 **Step 3: Web UI - picker + labels for the new forms** `[sequential]` → depends on: Step 1 `[UI]`
  - [ ] 🟥 3.1 `format.ts` `describeRecurrence`: new labels ("Monthly on the 3rd Thursday", "Monthly on the last day", "Every 2 weeks on Mon", append "until 31 Dec 2026" / "for 5 times").
  - [ ] 🟥 3.2 `RecurrencePicker`: monthly sub-choice (day-of-month | nth-weekday with ordinal+weekday dropdowns | last day); weekly + monthly interval input ("every N weeks/months"); a shared "Ends" control (never | on date | after N times) appending `UNTIL`/`COUNT`. `parseRule` reads the new parts back so editing shows the right controls.
  - [ ] 🟥 3.3 Frontend tests green; clean tsc + next build. `describeRecurrence` + the new picker controls unit-tested.

- [ ] 🟥 **Step 4: Docs + CHANGELOG** `[sequential]` → depends on: Steps 1-3
  - [ ] 🟥 4.1 `architecture.md`: widen the recurrence grammar note + the spawn-on-complete end-condition behavior. `product-design.md`: recurrence line gains the advanced forms + end conditions. (engineering-guidelines: no new pattern - skip unless something emerges.)
  - [ ] 🟥 4.2 `CHANGELOG.md`: v2.15.0 section. `coverage.md`: counts + new checklists.

- [ ] 🟥 **Step 5: Deploy + smoke test** `[sequential]` → depends on: Step 4
  - [ ] 🟥 5.1 Phone reachable; capture live task count. Stash-deploy-pop (user WIP untouched). Deploy. No migration, but confirm the count is unchanged (no accidental data change).
  - [ ] 🟥 5.2 Live curl: `COUNT=2` daily task → complete twice → the 2nd completion does NOT spawn a 3rd (series ends, comment says so); a `FREQ=MONTHLY;BYDAY=3TH` task → complete → next deadline is the 3rd Thursday of next month; an `every other week` task advances 14 days; an `UNTIL` in the past doesn't spawn. Clean up the smoke rows.
  - [ ] 🟥 5.3 DEFERRED user spot-check (non-blocking): build a "3rd Thursday, ends after 5" in the web picker; in Claude, "repeat every other Monday until July".

## Outcomes

<!-- Fill in after execution: decision-relevant deltas only. What changed vs. planned? Key decisions made? Assumptions invalidated? -->
