# Feature Implementation Plan: Bulk task operations

**Overall Progress:** `80%`

**Tracking issue:** [#63](https://github.com/hydraInsurgent/Tasklog/issues/63)
**Branch:** `feature/bulk-operations-#63`
**Target version:** v2.10.4 (Phase 4 of 5 per [proposal-mcp-and-ui-additions.md](proposal-mcp-and-ui-additions.md))

## TLDR

Act on many tasks at once instead of one at a time. A single transactional `POST /api/tasks/bulk` endpoint handles complete/uncomplete, move-to-project, and set-deadline for a list of task ids; three MCP tools expose those so Claude can reorganize in one call; and the web UI gets a select mode with a bulk-actions bar. No bulk delete.

## Goal State

**Current State:** Every task action is single-target. Reorganizing 20 inbox tasks is 20 MCP calls or 20 UI clicks.

**Goal State:** One call / one bar action applies complete, move-to-project, or set-deadline to a whole selection.

## Critical Decisions

- **Decision 1: One backend endpoint with an `operation` param, three MCP tools.** `POST /api/tasks/bulk` keeps the transaction and validation in one place. On the MCP side, three named tools (`bulk_set_completion`, `bulk_assign_to_project`, `bulk_set_deadline`) read more clearly to an LLM than one tool with a mode discriminator.
- **Decision 2: Mirror single-task semantics.** complete -> IsCompleted + CompletedAt (DateTime.Now, matching the single Complete action); assignProject -> ProjectId (null = Inbox); setDeadline -> Deadline (null = clear, ISO string = set). No "omit = keep" ambiguity here because each bulk op sets one value for the whole selection, so plain typed fields suffice (no JsonElement needed).
- **Decision 3: assignProject validates the target project exists** (400 if not) - slightly stricter than the single-task endpoint (whose missing-project bug is tracked in #19). Bulk is higher-stakes, and validating once for the whole batch is cheap.
- **Decision 4: Non-existent task ids are skipped, not an error.** The endpoint operates on whatever ids exist and returns the affected tasks. A partial id list is a normal bulk case, not a failure.
- **Decision 5: No bulk delete.** Destructive action stays single-task (user decision).
- **Decision 6: Unified select-mode UI, not long-press.** A "Select" toggle in the header reveals selection checkboxes on both the desktop table and mobile cards, plus a sticky bulk-actions bar. Simpler and more reliable than a mobile long-press gesture.

## API contract

```
POST /api/tasks/bulk
  Body: {
    operation: "complete" | "assignProject" | "setDeadline",
    taskIds:   number[]   (non-empty),
    data?: {
      isCompleted?: boolean,        // required for "complete"
      projectId?:   number | null,  // for "assignProject"; null = Inbox
      deadline?:    string | null   // for "setDeadline"; null = clear, ISO date = set
    }
  }
  400 on: empty taskIds, unknown operation, missing/invalid data for the op
          (complete without isCompleted, unparseable deadline, assignProject to a
          non-existent project).
  Returns: array of the affected tasks (with labels + dueStatus). Unknown ids skipped.

MCP tools:
  bulk_set_completion(taskIds, isCompleted) -> Task[]
  bulk_assign_to_project(taskIds, projectId) -> Task[]   (projectId null = Inbox)
  bulk_set_deadline(taskIds, deadline)       -> Task[]   (deadline null = clear)
```

## Tasks

- [x] 🟩 **Step 1: Backend - `POST /api/tasks/bulk`** `[sequential]` → depends on: nothing
  - [x] 🟩 1.1 Added `BulkTaskRequest` + `BulkTaskData` records (deadline as string for explicit parse/validate).
  - [x] 🟩 1.2 `Bulk([FromBody] BulkTaskRequest)` action: validates non-empty ids + known op, loads matching tasks with labels, switch applies per-op, one SaveChanges, returns the affected tasks. assignProject validates target project exists.
  - [x] 🟩 1.3 12 tests (complete set/clear, missing isCompleted 400, assignProject move/inbox/missing-400, setDeadline set/clear/bad-date-400, empty-ids 400, unknown-op 400, unknown-ids skipped). 86 backend tests pass.

- [x] 🟩 **Step 2: MCP - three bulk tools** `[sequential]` → depends on: Step 1
  - [x] 🟩 2.1 `api.bulkTasks(operation, taskIds, data)` added to `mcp/src/api-client.ts` (POST /api/tasks/bulk, returns Task[]).
  - [x] 🟩 2.2 Registered `bulk_set_completion`, `bulk_assign_to_project`, `bulk_set_deadline` with shared taskIds schema (min 1, max 100) + "Returns:" hints. Header comment updated (11 task tools). Tool count 16 -> 19.
  - [x] 🟩 2.3 4 api-client body-contract tests (complete/assignProject-null/setDeadline set+clear). Typecheck clean; 70 MCP tests pass.

- [x] 🟩 **Step 3: Web UI - select mode + bulk-actions bar** `[sequential]` → depends on: Step 1 `[UI]`
  - [x] 🟩 3.1 `bulkTasks(operation, taskIds, data)` + `BulkOperation` type in `frontend/src/lib/api.ts`.
  - [x] 🟩 3.2 TasksClient: `selectionMode` + `selectedIds: Set<number>` + `bulkBusy` state; "Select"/"Done" header toggle; polling pauses in select mode; selection clears on exit and on activeView/filter change (useEffect).
  - [x] 🟩 3.3 Desktop: leading selection column + select-all header (only in select mode), with the completion column padding shifted. Mobile `TaskCard`: optional `selectionMode`/`selected`/`onToggleSelect` props (default off) render a square selection checkbox.
  - [x] 🟩 3.4 `BulkActionsBar` (sticky bottom): N selected, Complete, Reopen, Move to project (dropdown of Inbox + projects), Set deadline (reuses `DeadlinePopover`), Cancel. Calls `handleBulk` -> `bulkTasks`, merges returned tasks into state, exits select mode. Busy + error states.
  - [x] 🟩 3.5 +3 TaskCard tests (no checkbox by default; appears + toggles in select mode; reflects selected). 50 frontend tests pass; clean `next build`. Existing tests untouched (props optional).

- [x] 🟩 **Step 4: Docs + CHANGELOG** `[sequential]` → depends on: Steps 1-3
  - [x] 🟩 4.1 architecture.md: added `POST /api/tasks/bulk` to the endpoints table; tool count 16 -> 19 (prose + tree, 11 task tools); noted `BulkActionsBar`.
  - [x] 🟩 4.2 product-design.md: noted bulk actions (UI select mode + Claude), no bulk delete.
  - [x] 🟩 4.3 CHANGELOG.md: v2.10.4 section. coverage.md: counts (86/70/50) + Bulk + selection + bulk-body checklists.

- [ ] 🟥 **Step 5: Deploy + smoke test** `[sequential]` → depends on: Step 4
  - [ ] 🟥 5.1 `./scripts/deploy-phone.sh`.
  - [ ] 🟥 5.2 Live curl against the deployed backend: bulk complete N, bulk move N to a project (and to Inbox/null), bulk set + clear deadline, then verify and clean up. Confirm a bad operation/empty list returns 400 and a missing project returns 400.
  - [ ] 🟥 5.3 DEFERRED user spot-check (non-blocking): in the web UI, enter select mode, select a few tasks, run each bulk action; in Claude, "move these 3 tasks to Work" / "mark these done".

## Outcomes

<!-- Fill in after execution: decision-relevant deltas only. What changed vs. planned? Key decisions made? Assumptions invalidated? -->
