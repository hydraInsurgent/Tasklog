# Feature Implementation Plan: Bulk task operations

**Overall Progress:** `0%`

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

- [ ] 🟥 **Step 1: Backend - `POST /api/tasks/bulk`** `[sequential]` → depends on: nothing
  - [ ] 🟥 1.1 Add `BulkTaskRequest(string Operation, List<int> TaskIds, BulkTaskData? Data)` + `BulkTaskData(bool? IsCompleted, int? ProjectId, string? Deadline)` records. Note: deadline as string so it can be parsed/validated explicitly (like the single PATCH).
  - [ ] 🟥 1.2 `Bulk([FromBody] BulkTaskRequest req)` action: validate non-empty taskIds + known operation; load matching tasks with `.Include(t => t.Labels)`; switch on operation applying the change to each; one `SaveChangesAsync`; return `Ok(tasks)`. Per-op validation per the contract.
  - [ ] 🟥 1.3 Unit tests: complete true/false sets+clears CompletedAt on all; assignProject moves all (and null = Inbox); assignProject to missing project -> 400; setDeadline sets + null clears on all; bad deadline -> 400; empty taskIds -> 400; unknown operation -> 400; unknown ids skipped (returns only existing); complete without isCompleted -> 400.

- [ ] 🟥 **Step 2: MCP - three bulk tools** `[sequential]` → depends on: Step 1
  - [ ] 🟥 2.1 `api.bulkTasks(operation, taskIds, data)` (or three thin wrappers) in `mcp/src/api-client.ts` POSTing to `/api/tasks/bulk`.
  - [ ] 🟥 2.2 Register `bulk_set_completion`, `bulk_assign_to_project`, `bulk_set_deadline` in `mcp/src/tools/tasks.ts` with Zod schemas (taskIds: non-empty int array, max ~100) + "Returns:" hints. Update the header comment (8 -> 11 task tools). Tool count 16 -> 19.
  - [ ] 🟥 2.3 Tests: api-client POST body contract for each op (operation + taskIds + data shape; deadline null vs value).

- [ ] 🟥 **Step 3: Web UI - select mode + bulk-actions bar** `[sequential]` → depends on: Step 1 `[UI]`
  - [ ] 🟥 3.1 `api.bulkTasks(...)` in `frontend/src/lib/api.ts`.
  - [ ] 🟥 3.2 TasksClient: `selectionMode` boolean + `selectedIds: Set<number>` state; a "Select" toggle in the list header; pause polling while in select mode. Clear selection on exit and on view/filter change.
  - [ ] 🟥 3.3 Desktop table: leading selection-checkbox column (square, distinct from the round completion toggle) + a select-all in the header. Mobile `TaskCard`: a selection checkbox shown only in select mode (new optional props, default off so existing tests pass).
  - [ ] 🟥 3.4 `BulkActionsBar` component (sticky bottom): "N selected", Complete, Mark incomplete, Move to project (dropdown reusing the project list), Set deadline (reuses `DeadlinePopover`), and Done. Calls `bulkTasks`, then updates local state with the returned tasks (or removes completed ones from the default view consistent with single-complete behavior). Error + loading states.
  - [ ] 🟥 3.5 Fixtures/tests: extend TaskCard props with the optional selection props (default off); add a focused test for the selection toggle + bar enable/disable if practical. Keep existing tests green.

- [ ] 🟥 **Step 4: Docs + CHANGELOG** `[sequential]` → depends on: Steps 1-3
  - [ ] 🟥 4.1 architecture.md: add `POST /api/tasks/bulk` to the endpoints table; bump MCP tool count 16 -> 19; note `BulkActionsBar`.
  - [ ] 🟥 4.2 product-design.md: note bulk actions on the task list + via Claude.
  - [ ] 🟥 4.3 CHANGELOG.md: v2.10.4 section. coverage.md: new counts + checklists.

- [ ] 🟥 **Step 5: Deploy + smoke test** `[sequential]` → depends on: Step 4
  - [ ] 🟥 5.1 `./scripts/deploy-phone.sh`.
  - [ ] 🟥 5.2 Live curl against the deployed backend: bulk complete N, bulk move N to a project (and to Inbox/null), bulk set + clear deadline, then verify and clean up. Confirm a bad operation/empty list returns 400 and a missing project returns 400.
  - [ ] 🟥 5.3 DEFERRED user spot-check (non-blocking): in the web UI, enter select mode, select a few tasks, run each bulk action; in Claude, "move these 3 tasks to Work" / "mark these done".

## Outcomes

<!-- Fill in after execution: decision-relevant deltas only. What changed vs. planned? Key decisions made? Assumptions invalidated? -->
