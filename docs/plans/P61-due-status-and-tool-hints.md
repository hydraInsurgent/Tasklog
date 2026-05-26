# Feature Implementation Plan: Computed dueStatus field + MCP tool-description shape hints

**Overall Progress:** `0%`

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

- [ ] 🟥 **Step 1: Backend - computed `dueStatus`** `[sequential]` → depends on: nothing
  - [ ] 🟥 1.1 Add `using System.ComponentModel.DataAnnotations.Schema;` and a pure `public static string ComputeDueStatus(DateTime? deadline, DateTime today)` to `TaskModel` implementing the Decision-2 buckets (date-only compare, upcoming-Sunday boundary).
  - [ ] 🟥 1.2 Add `[NotMapped] public string DueStatus => ComputeDueStatus(Deadline, DateTime.Today);` so it serializes everywhere the model is returned.
  - [ ] 🟥 1.3 Unit tests for `ComputeDueStatus` with injected `today`: none (null deadline), overdue (yesterday), today, this_week (mid-week + boundary upcoming Sunday), later (just past Sunday), plus a weekday-sensitivity case (today==Sunday -> tomorrow is later). Confirm a GetAll/GetById response includes `dueStatus`.

- [ ] 🟥 **Step 2: MCP - `dueStatus` in type + "Returns:" hints on all 16 tools** `[sequential]` → depends on: Step 1
  - [ ] 🟥 2.1 Add `dueStatus: string;` to the `Task` interface in `mcp/src/api-client.ts` (flows through unchanged - the client returns the API JSON as-is).
  - [ ] 🟥 2.2 Append a one-line "Returns: ..." sentence to each of the 16 tool descriptions in `mcp/src/tools/{tasks,projects,labels}.ts`. Task-returning tools (`list_tasks`, `get_task`, `create_task`, `update_task`, `set_task_completion`, `assign_task_to_project`, `set_task_labels`) list the task fields including the new `dueStatus`. Non-task tools describe their own shapes (e.g. `delete_*` -> `{ id, deleted: true }`).
  - [ ] 🟥 2.3 Add/extend an MCP test asserting the `Task` shape includes `dueStatus` (or that the api-client passes it through). Keep it light - the field is pass-through.

- [ ] 🟥 **Step 3: Frontend - `dueStatus` on the `Task` type + fixtures** `[sequential]` → depends on: Step 1 `[UI]`
  - [ ] 🟥 3.1 Add `dueStatus: "overdue" | "today" | "this_week" | "later" | "none";` to the `Task` interface in `frontend/src/lib/api.ts`.
  - [ ] 🟥 3.2 Update test fixtures (`TaskCard.test.tsx` `baseTask`, any other Task literals) to include `dueStatus`. Keep `deadlineColorClass` and the deadline pill unchanged (Decision 3).
  - [ ] 🟥 3.3 (Optional, low-risk) Surface the human-readable due status as the deadline pill's `title`/tooltip so the computed value is visible without changing colors. Skip if it adds noise.

- [ ] 🟥 **Step 4: Docs + CHANGELOG** `[sequential]` → depends on: Steps 1-3
  - [ ] 🟥 4.1 architecture.md: note `dueStatus` on the Tasks data-model/response shape (computed, not a column).
  - [ ] 🟥 4.2 engineering-guidelines.md: record the `[NotMapped]` computed-property-as-serialized-field pattern (first use).
  - [ ] 🟥 4.3 product-design.md: note tasks now expose a computed due bucket; bump nothing else.
  - [ ] 🟥 4.4 CHANGELOG.md: v2.10.3 section. coverage.md: new test counts.

- [ ] 🟥 **Step 5: Deploy + smoke test** `[sequential]` → depends on: Step 4
  - [ ] 🟥 5.1 `./scripts/deploy-phone.sh`.
  - [ ] 🟥 5.2 Live curl against the deployed backend: confirm `dueStatus` appears and is correct for a no-deadline task, a past deadline, a today deadline, and a far-future deadline (create throwaway tasks, verify, delete).
  - [ ] 🟥 5.3 DEFERRED user spot-check (non-blocking): in Claude, confirm a task list shows dueStatus and the tool descriptions read sensibly.

## Outcomes

<!-- Fill in after execution: decision-relevant deltas only. What changed vs. planned? Key decisions made? Assumptions invalidated? -->
