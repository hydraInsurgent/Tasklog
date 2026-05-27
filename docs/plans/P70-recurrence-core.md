# Feature Implementation Plan: Recurrence core (recurring tasks)

**Overall Progress:** `30%`

**Tracking issue:** [#70](https://github.com/hydraInsurgent/Tasklog/issues/70)
**Branch:** `feature/recurrence-core-#70`
**Target version:** v2.14.0 (minor - DB migration) - second of [proposal-recurring-and-habits.md](proposal-recurring-and-habits.md)
**Research:** [rrule-rfc5545-2026-05-27.md](../research/rrule-rfc5545-2026-05-27.md)

## TLDR

Make tasks repeat. A task can carry a recurrence rule (an RRULE-shaped string built from a small typed structure) plus a `SeriesId` (Guid) that links all occurrences of the same repeating task. Completing a recurring task marks it done (kept as history) and spawns the next occurrence with its deadline advanced per the rule and its fields carried forward. The supported subset is daily / every-N-days / weekly-on-weekday(s) / monthly-on-day - grounded in RFC 5545 so later versions can extend the grammar without re-shaping storage.

## Goal State

**Current State:** A task is a one-shot thing. Completing it sets `IsCompleted`/`CompletedAt` and it disappears from the default view. There is no concept of repetition.
**Goal State:** A task can repeat. The recurrence is set on the add/edit forms (and via Claude). Completing the current occurrence leaves it as a completed history row and immediately creates the next open occurrence (same series, next deadline), with a completion comment logged on the one just finished.

## Critical Decisions

All locked during `/explore` (Todoist conventions). Recorded here so the rationale survives.

- **Decision 1: Storage = a typed structure serialized to an RRULE-shaped string, not literal free-form RRULE and not a bag of columns.**
  - **Options considered:** (a) literal RRULE string only - flexible but unvalidated and awkward to build/expand; (b) discrete columns (freq/interval/weekday/monthday) - rigid, a migration per grammar addition; (c) a typed struct that parses to/from an RRULE-shaped string stored in one column.
  - **Chosen:** (c). One nullable `Recurrence` string column holds the rule; a pure helper parses it into a typed struct for validation + expansion. The grammar can grow (v2.15.0/v2.16.0) without a new migration, and the stored shape stays spec-compatible.
  - **Trade-offs accepted:** parsing on every expansion (microsecond-scale, fine); the string can in principle hold grammar the core expander rejects - mitigated by validating on write (400) so we never persist a rule we cannot advance.
  - **Research citation:** [rrule-rfc5545-2026-05-27.md](../research/rrule-rfc5545-2026-05-27.md)

- **Decision 2: Separate row per occurrence, linked by `SeriesId` (Guid) - not one row whose deadline advances in place.** History (completed occurrences) is required for habit-tracking (v2.17.0). Completing spawns a new row and keeps the old one. Exactly one open occurrence exists per series at a time.

- **Decision 3: Advance from the scheduled deadline, not the completion timestamp.** Todoist's default. The next deadline is a pure function of the current deadline + the rule; the expander never reads the clock. Consequence: the `RecurrenceRule` helper sidesteps the `DateTime.Now`/`UtcNow` deviation (#18) and is trivially unit-testable. Time-of-day is preserved (v2.12.0 timed deadlines).

- **Decision 4: A recurrence requires a deadline (the anchor).** Setting recurrence on a task with no deadline is a 400. Without an anchor there is nothing to advance.

- **Decision 5: Spawn hooks into the single completion endpoint** `PATCH /api/tasks/{id}/complete`, the one path both the web checkbox and MCP `set_task_completion` use. Bulk-complete (`POST /api/tasks/bulk`) is deliberately NOT modified - bulk-completing recurring tasks does not spawn in the core (documented limitation; recurring tasks are completed individually).

- **Decision 6: Auto-log a completion comment** on the just-completed occurrence (e.g. "Completed 2026-05-27, next due 2026-05-28"), using the v2.13.0 comments table. This is the seam habit-tracking (v2.17.0) reads from.

- **Decision 7: The recurrence logic is a pure static helper** (`RecurrenceRule.cs`), not a DI service. Mirrors the DueStatus precedent (a pure static helper + `[NotMapped]` computed property). The completion endpoint just wires it in.

<!-- GUIDELINES CHECK: No new architecture - reuses the [NotMapped] computed (IsRecurring) + pure-static-helper (RecurrenceRule, like ComputeDueStatus) precedent. It is the first file under backend/Tasklog.Api/Services/ - note the folder in engineering-guidelines, but it is a static helper, NOT the "service layer" pattern (no DI, no state). Migration -> minor bump. product-design "Tasks" rules gain recurrence. No deviation resolved or introduced (the expander avoids #18 by being clock-free). -->

## API contract

```
Task gains:  recurrence (string|null, RRULE-shaped), seriesId (string/Guid|null), isRecurring (computed bool)

POST /api/tasks            body adds optional `recurrence`
                           400 if recurrence set but no deadline; 400 if rule unsupported/invalid
                           recurring task gets a fresh SeriesId
PATCH /api/tasks/{id}      body adds optional `recurrence` (present-key: omit=keep, null=clear, value=set)
                           set on a non-recurring task assigns a SeriesId; clear nulls Recurrence + SeriesId
                           400 if rule unsupported, or set with no deadline on the task
PATCH /api/tasks/{id}/complete   when completing a recurring task:
                           - the task is marked done (history) + a completion comment is added to it
                           - a new occurrence is created: deadline advanced per rule; Title/ProjectId/
                             Priority/Description/Recurrence/SeriesId + Labels carried; IsCompleted=false
                           - response is unchanged (the completed task)

Supported rule subset (RFC 5545):
  FREQ=DAILY                       every day
  FREQ=DAILY;INTERVAL=N            every N days
  FREQ=WEEKLY;BYDAY=MO,WE,FR       weekly on those weekdays
  FREQ=MONTHLY;BYMONTHDAY=D        monthly on day D (1..31; >days-in-month clamps to month end)
Rejected (400) in the core: SECONDLY/MINUTELY/HOURLY/YEARLY, BYSETPOS, COUNT, UNTIL,
  nth-weekday (e.g. 3TH), negative BYMONTHDAY, weekly/monthly INTERVAL>1.

MCP: create_task / update_task gain a `recurrence` string param (subset taught in the description);
     Task shape gains recurrence/seriesId/isRecurring. set_task_completion unchanged (spawn is server-side).
```

## Tasks

- [x] 🟩 **Step 1: Backend - model, migration, RecurrenceRule helper, controller** `[sequential]` → depends on: nothing
  - [x] 🟩 1.1 `TaskModel`: `string? Recurrence`, `Guid? SeriesId`, `[NotMapped] IsRecurring`. No `OnModelCreating` change.
  - [x] 🟩 1.2 `AddRecurrence` migration via global dotnet-ef. Two nullable columns (Recurrence TEXT, SeriesId TEXT/Guid), no default - existing rows -> NULL = non-recurring.
  - [x] 🟩 1.3 `Services/RecurrenceRule.cs` pure static helper: `TryParse` (validate subset, reject unsupported with a clear error), `Serialize` (canonical), `NextDeadline` (clock-free, preserves TimeOfDay, monthly clamps to month end). Freq enum Daily/Weekly/Monthly.
  - [x] 🟩 1.4 `Create`: `CreateTaskRequest` gained `string? Recurrence = null`; validates (deadline required, rule valid) and stamps SeriesId; stores canonical form.
  - [x] 🟩 1.5 `Update`: `recurrence` present-key (set validates + assigns SeriesId via `??=`; clear nulls both). Set respects a deadline set in the same PATCH.
  - [x] 🟩 1.6 `Complete`: open->completed transition guard (no double-spawn); spawns next occurrence (carries fields + labels, same SeriesId), logs a completion comment; returns the completed task. Bulk untouched.
  - [x] 🟩 1.7 Tests: `RecurrenceRuleTests` + `TasksControllerTests` recurrence cases. **190 backend tests pass** (was 143, +47).

- [ ] 🟥 **Step 2: MCP - recurrence on create/update + in the Task shape** `[sequential]` → depends on: Step 1
  - [ ] 🟥 2.1 `api-client.ts`: `Task` gains `recurrence: string | null`, `seriesId: string | null`, `isRecurring: boolean`; `createTask`/`updateTask` bodies gain `recurrence?: string | null`.
  - [ ] 🟥 2.2 `tools/tasks.ts`: add a `recurrence` string param to `create_task` and `update_task` schemas, with a description teaching the supported subset + examples + "completing a recurring task marks it done and creates the next occurrence." `set_task_completion` unchanged. Tool COUNT unchanged (no new tool) - refresh the header comment wording only if it references field coverage.
  - [ ] 🟥 2.3 `api-client.test.ts`: recurrence wire-contract tests (create/update send `recurrence`; `Task` type carries the new fields). Typecheck clean; MCP tests green.

- [ ] 🟥 **Step 3: Web UI - recurrence picker + recurring badge** `[sequential]` → depends on: Step 1 `[UI]`
  - [ ] 🟥 3.1 `api.ts`: `Task` type gains recurrence/seriesId/isRecurring; `createTask`/`updateTask` carry `recurrence`. `format.ts`: `describeRecurrence(rule)` -> human label ("Every day", "Every 3 days", "Weekly on Mon, Wed", "Monthly on the 15th").
  - [ ] 🟥 3.2 New `RecurrencePicker` component (None / Daily / Every N days / Weekly + weekday chips / Monthly + day-of-month) that builds the RRULE string; wire into `AddTaskForm` and `EditTaskModal` (a recurrence needs a deadline - surface that inline).
  - [ ] 🟥 3.3 Recurring badge (a repeat glyph + `describeRecurrence` label/tooltip) on `TaskCard`, the desktop table row, and the task detail page.
  - [ ] 🟥 3.4 `TasksClient.handleComplete`: after completing a recurring task, refetch the list so the freshly-spawned occurrence appears immediately (don't wait for the poll).
  - [ ] 🟥 3.5 Frontend tests still green; clean tsc + next build. `describeRecurrence` + `RecurrencePicker` (render/onChange) unit tests if practical.

- [ ] 🟥 **Step 4: Docs + CHANGELOG** `[sequential]` → depends on: Steps 1-3
  - [ ] 🟥 4.1 `architecture.md`: Recurrence + SeriesId columns in the data model; `RecurrenceRule` helper + the new `Services/` folder; recurrence on create/update + spawn-on-complete behavior. `engineering-guidelines.md`: note the pure-static-helper precedent extended (Services/ folder, still no DI service layer). `product-design.md`: tasks can recur.
  - [ ] 🟥 4.2 `CHANGELOG.md`: v2.14.0 section. `coverage.md`: new counts + RecurrenceRule + recurrence-contract checklists.

- [ ] 🟥 **Step 5: Deploy + smoke test** `[sequential]` → depends on: Step 4
  - [ ] 🟥 5.1 Phone reachable; capture live task count. Stash-deploy-pop (user WIP untouched). `./scripts/deploy-phone.sh`. CONFIRM the migration applied with zero data loss.
  - [ ] 🟥 5.2 Live curl: create a recurring task (daily, with a deadline) -> 201 with `recurrence`/`seriesId`/`isRecurring`; complete it -> verify a new open occurrence exists with the deadline advanced +1 day, the same `seriesId`, and a completion comment on the original; create recurrence-without-deadline -> 400; bad rule -> 400. Clean up the smoke rows.
  - [ ] 🟥 5.3 DEFERRED user spot-check (non-blocking): set a recurrence in the web add form, complete it, watch the next occurrence appear; in Claude, "make task N repeat every weekday".

## Outcomes

<!-- Fill in after execution: decision-relevant deltas only. What changed vs. planned? Key decisions made? Assumptions invalidated? -->
