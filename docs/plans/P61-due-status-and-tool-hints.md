# Feature Implementation Plan: Computed dueStatus field + MCP tool-description shape hints

**Overall Progress:** `80%`

**Tracking issue:** [#61](https://github.com/hydraInsurgent/Tasklog/issues/61)
**Branch:** `feature/due-status-and-tool-hints-#61`
**Target version:** v2.10.3 (Phase 3 of 5 per [proposal-mcp-and-ui-additions.md](proposal-mcp-and-ui-additions.md))

## TLDR

Two clubbed items. (1) Every task gains a server-computed read-only `dueStatus` field (`overdue`/`today`/`this_week`/`later`/`none`) so the due-bucket logic lives in one place instead of being recomputed by each client. (2) Each of the 16 MCP tool descriptions gets a one-line "Returns: ..." shape hint so LLM clients know the output before calling.

## Goal State

**Current State:** Tasks expose `deadline` (ISO date or null). Every consumer (web UI color coding, Claude, any future agent) derives "overdue / due soon / later" itself. MCP tool descriptions say *when* to call a tool but not *what comes back*.

**Goal State:** The API returns `dueStatus` on every task, computed relative to the server's today. The MCP and web UI receive it for free. MCP tool descriptions each end with a "Returns:" sentence.

## Critical Decisions

- **Decision 1: Compute `dueStatus` as a `[NotMapped]` computed property on `TaskModel`.** A getter `public string DueStatus => ComputeDueStatus(Deadline, DateTime.Today);` plus a pure static `ComputeDueStatus(DateTime? deadline, DateTime today)`. `[NotMapped]` keeps EF Core from mapping it to a column; System.Text.Json still serializes the getter, so it flows through all 7 task-returning controller actions with zero per-action wiring. The static helper is unit-testable with an injected `today`. No DTO layer introduced (consistent with the project's no-DTO, models-are-simple convention).
- **Decision 2: Bucket semantics (date-only compare against server-local `DateTime.Today`).**
  - `none` - no deadline
  - `overdue` - deadline date < today
  - `today` - deadline date == today
  - `this_week` - today < deadline date <= upcoming Sunday (rest of the current week)
  - `later` - deadline date > upcoming Sunday
  - "Upcoming Sunday" = `today.AddDays((7 - (int)today.DayOfWeek) % 7)` (Sunday=0 -> 0 days, so on Sunday the this_week window is empty and tomorrow is `later`). Consistent with the Phase-2 preset model where "next week" begins Monday.
  - Server-local `DateTime.Today` is correct for this single-user self-hosted app: the server (phone/GCP) runs in the user's timezone and the deadline is a date, not an instant. Date-only comparison via `.Date`.
- **Decision 3: Do NOT swap the web UI's color logic onto `dueStatus`.** `deadlineColorClass` uses a 3-day threshold (yellow); `dueStatus.this_week` uses a calendar-week boundary. They are intentionally different. The UI adds `dueStatus` to its `Task` type (forward-compat + available for tooltips/labels) but keeps the existing color thresholds, so there is no visual regression.
- **Decision 4: Tool hints are description-string edits only.** Append "Returns: ..." to all 16 tool descriptions; no handler/logic changes. The task-returning tools' Returns lines mention the new `dueStatus` field.

## API contract

```
Every task object returned by the API now includes:
  dueStatus  string  one of: "overdue" | "today" | "this_week" | "later" | "none"
             read-only, computed server-side relative to today, never accepted as input.
No request shape changes. No new endpoints. No DB migration.
```

## Tasks

- [x] 🟩 **Step 1: Backend - computed `dueStatus`** `[sequential]` → depends on: nothing
  - [x] 🟩 1.1 Added the `Schema` using + pure static `ComputeDueStatus(DateTime? deadline, DateTime today)` to `TaskModel` (date-only compare, upcoming-Sunday boundary).
  - [x] 🟩 1.2 Added `[NotMapped] public string DueStatus => ComputeDueStatus(Deadline, DateTime.Today);`.
  - [x] 🟩 1.3 11 unit tests in `TaskModelTests.cs` (none/overdue/today/this_week+boundary/later, Sunday-tomorrow-is-later, Saturday-Sunday-is-this_week, date-only/time-ignored, property wiring). 74 backend tests pass. Live response check deferred to Step 5.2.

- [x] 🟩 **Step 2: MCP - `dueStatus` in type + "Returns:" hints on all 16 tools** `[sequential]` → depends on: Step 1
  - [x] 🟩 2.1 Added `dueStatus: 'overdue'|'today'|'this_week'|'later'|'none'` to the `Task` interface in `mcp/src/api-client.ts` (pass-through).
  - [x] 🟩 2.2 Appended "Returns: ..." to all 16 tool descriptions. The 7 task-returning tools cite the list_tasks shape including `dueStatus`; delete_* return `{ id, deleted: true, note }`; list/create/rename project + label tools spell their own field shapes.
  - [x] 🟩 2.3 Light contract test in api-client.test.ts asserting the `Task` type carries `dueStatus` as one of the five buckets. Typecheck clean; 66 MCP tests pass (had to `npm install` + `npm rebuild better-sqlite3` to restore host dev deps stripped by the last deploy).

- [x] 🟩 **Step 3: Frontend - `dueStatus` on the `Task` type + fixtures** `[sequential]` → depends on: Step 1 `[UI]`
  - [x] 🟩 3.1 Added the `dueStatus` union to the `Task` interface in `frontend/src/lib/api.ts`.
  - [x] 🟩 3.2 Updated the `baseTask` fixture in `TaskCard.test.tsx`. Typecheck confirmed no other full Task literals needed it (optimistic updates spread an existing task and preserve the field). Color logic untouched. 47 frontend tests pass.
  - [x] 🟩 3.3 SKIPPED deliberately. A dueStatus tooltip next to a pill colored by the 3-day rule would mislead (this_week is a calendar-week bucket, not 3 days). Field stays available in the type for forward-compat + MCP; no UI surfacing this release. No `[UI]` visual change shipped, so no design-spec check needed.

- [x] 🟩 **Step 4: Docs + CHANGELOG** `[sequential]` → depends on: Steps 1-3
  - [x] 🟩 4.1 architecture.md: added `dueStatus` as a response-only computed field under the Tasks data model.
  - [x] 🟩 4.2 engineering-guidelines.md: recorded the `[NotMapped]` computed-response-field + pure-static-helper pattern (additions from v2.10.3).
  - [x] 🟩 4.3 product-design.md: noted the server-computed dueStatus due bucket on tasks.
  - [x] 🟩 4.4 CHANGELOG.md: v2.10.3 section. coverage.md: counts (74/66/47) + ComputeDueStatus checklist + dueStatus shape test + better-sqlite3 rebuild note.

- [ ] 🟥 **Step 5: Deploy + smoke test** `[sequential]` → depends on: Step 4
  - [ ] 🟥 5.1 `./scripts/deploy-phone.sh`.
  - [ ] 🟥 5.2 Live curl against the deployed backend: confirm `dueStatus` appears and is correct for a no-deadline task, a past deadline, a today deadline, and a far-future deadline (create throwaway tasks, verify, delete).
  - [ ] 🟥 5.3 DEFERRED user spot-check (non-blocking): in Claude, confirm a task list shows dueStatus and the tool descriptions read sensibly.

## Outcomes

<!-- Fill in after execution: decision-relevant deltas only. What changed vs. planned? Key decisions made? Assumptions invalidated? -->
