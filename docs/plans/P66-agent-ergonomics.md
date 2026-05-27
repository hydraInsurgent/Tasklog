# Feature Implementation Plan: Agent ergonomics (bulk_set_priority + name resolution)

**Overall Progress:** `0%`

**Tracking issue:** [#66](https://github.com/hydraInsurgent/Tasklog/issues/66)
**Branch:** `feature/agent-ergonomics-#66`
**Target version:** v2.10.7 (patch) - second of [proposal-next-versions.md](proposal-next-versions.md)

## TLDR

Two agent-ergonomics wins that cut LLM round-trips. (A) `bulk_set_priority` closes the bulk asymmetry (complete/move/deadline have bulk variants, priority didn't). (B) Name-based resolution lets the agent act on "Work" or a label name directly instead of a `list_projects`/`list_labels` lookup first. No DB migration.

## Goal State

**Current State:** Bulk ops cover complete/assignProject/setDeadline but not priority. Project/label assignment is id-only, so the LLM must look up ids before acting on a name.

**Goal State:** Bulk priority works in one call; `assign_task_to_project`/`bulk_assign_to_project`/`set_task_labels` accept a name as an alternative to an id, resolved server-side.

## Critical Decisions

- **Decision 1: Name resolution is exact + case-insensitive; 0 or >1 matches → 400.** Deterministic, never guesses. Shared private helpers `ResolveProjectByName(name)` and `ResolveLabelsByName(names)` in the controller return either the id(s) or an error message the action turns into a 400 ("ambiguous name 'X' - use an id").
- **Decision 2: Name wins over id when both present.** If a `projectName`/`labelNames` field is provided (non-empty), resolve it and ignore the id field; otherwise use the id field (`projectId: null` = Inbox stays valid). Ids always remain accepted - this is purely additive.
- **Decision 3: Record shape.** `AssignProjectRequest(int? ProjectId, string? ProjectName = null)`; `BulkTaskData` gains `string? ProjectName`; `SetTaskLabelsRequest(int[]? LabelIds = null, string[]? LabelNames = null)` - `LabelIds` becomes nullable with a default so existing positional callers/tests compile, and an effective `int[]` is computed inside the action (names resolved, or `LabelIds ?? []`); empty/absent both clear labels (unchanged semantics).
- **Decision 4: bulk_set_priority mirrors the single-task priority validation.** `setPriority` case in the bulk switch validates `data.priority` is 1-4 (else 400), same rule as Create/Update.

<!-- GUIDELINES CHECK: no migration, no new pattern (resolve helpers are ordinary controller privates), no product-scope change. Additive + backwards-compatible. -->

## API contract

```
POST /api/tasks/bulk      operation "setPriority", data: { priority: 1-4 }  (400 if out of range)
PATCH /api/tasks/{id}/project   body adds optional projectName (resolved; wins over projectId)
POST  /api/tasks/bulk (assignProject)  data adds optional projectName
PATCH /api/tasks/{id}/labels    body adds optional labelNames[] (resolved; wins over labelIds)
  Name resolution: exact, case-insensitive. 0 or >1 match -> 400.

MCP: bulk_set_priority(taskIds, priority); assign_task_to_project + bulk_assign_to_project gain
     projectName; set_task_labels gains labelNames.
```

## Tasks

- [ ] 🟥 **Step 1: Backend - bulk_set_priority + name resolution** `[sequential]` → depends on: nothing
  - [ ] 🟥 1.1 Add `setPriority` case to the bulk switch: read `data.Priority`, validate 1-4 (else 400), set on all loaded tasks. Add `int? Priority` to `BulkTaskData`.
  - [ ] 🟥 1.2 Add `ResolveProjectByName(string)` -> `(int? id, string? error)` and `ResolveLabelsByName(string[])` -> `(List<int>? ids, string? error)` private helpers (case-insensitive exact, 0/>1 -> error).
  - [ ] 🟥 1.3 `AssignProjectRequest` gains `ProjectName`; AssignProject resolves it (name wins, else ProjectId incl null). `BulkTaskData` gains `ProjectName`; the assignProject case resolves it the same way (replacing/augmenting the existing exists-check).
  - [ ] 🟥 1.4 `SetTaskLabelsRequest` -> `(int[]? LabelIds = null, string[]? LabelNames = null)`; SetLabels computes an effective `int[]` (resolve names, else `LabelIds ?? []`), then runs the existing replace logic. Invalid label ids still 400; unresolvable names 400.
  - [ ] 🟥 1.5 Tests: bulk setPriority valid + out-of-range 400; assignProject by name (single), ambiguous -> 400, missing -> 400, name-wins-over-id; set_task_labels by name (incl. one unknown -> 400); existing id paths still pass.

- [ ] 🟥 **Step 2: MCP - tools + api-client** `[sequential]` → depends on: Step 1
  - [ ] 🟥 2.1 `api.bulkTasks` data type gains `priority?`; add a `bulk_set_priority(taskIds, priority)` tool (count 19 -> 20; header comment 11 -> 12 task tools). "Set priority" `setPriority` op.
  - [ ] 🟥 2.2 `api.setTaskProject` -> accept `{ projectId?, projectName? }`; `api.setTaskLabels` -> accept `{ labelIds?, labelNames? }`. Update `assign_task_to_project` + `bulk_assign_to_project` schemas to add `projectName` (id made optional); `set_task_labels` to add `labelNames` (labelIds made optional). Describe the "name OR id" contract + ambiguity-400.
  - [ ] 🟥 2.3 Tests: bulk_set_priority body contract; project-by-name + labelNames request bodies serialize as expected.

- [ ] 🟥 **Step 3: Web UI - bulk Set priority** `[sequential]` → depends on: Step 1 `[UI]`
  - [ ] 🟥 3.1 `frontend/src/lib/api.ts` `bulkTasks` data gains `priority?`. `BulkActionsBar` gets a "Set priority" action (a small P1-P4 popover, reusing `PRIORITY_OPTIONS`), wired to `handleBulk("setPriority", { priority })` in TasksClient.
  - [ ] 🟥 3.2 Fixtures/tests as needed; keep existing green. (Name resolution is MCP/API-only - no UI.)

- [ ] 🟥 **Step 4: Docs + CHANGELOG** `[sequential]` → depends on: Steps 1-3
  - [ ] 🟥 4.1 architecture.md: bulk endpoint setPriority + projectName/labelNames notes; MCP tool count 19 -> 20. product-design.md: bulk priority + name-friendly Claude line.
  - [ ] 🟥 4.2 CHANGELOG.md: v2.10.7 section. coverage.md: new counts + checklists.

- [ ] 🟥 **Step 5: Deploy + smoke test** `[sequential]` → depends on: Step 4
  - [ ] 🟥 5.1 Check phone reachable (dozes); if asleep, that is a user-action stop. Then stash the user's frontend WIP, `./scripts/deploy-phone.sh`, restore (pop) after.
  - [ ] 🟥 5.2 Live curl: bulk setPriority on N tasks; assign by projectName (+ ambiguous/missing -> 400); set labels by labelNames; clean up.
  - [ ] 🟥 5.3 DEFERRED user spot-check (non-blocking): web UI bulk "Set priority"; in Claude, "move these to Work", "make these P1", "tag these urgent".

## Outcomes

<!-- Fill in after execution: decision-relevant deltas only. What changed vs. planned? Key decisions made? Assumptions invalidated? -->
