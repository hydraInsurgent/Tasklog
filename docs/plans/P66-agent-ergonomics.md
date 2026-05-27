# Feature Implementation Plan: Agent ergonomics (bulk_set_priority + name resolution)

**Overall Progress:** `85%`

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

- [x] 🟩 **Step 1: Backend - bulk_set_priority + name resolution** `[sequential]` → depends on: nothing
  - [x] 🟩 1.1 `setPriority` case added (validates 1-4 else 400); `BulkTaskData` gained `Priority`.
  - [x] 🟩 1.2 `ResolveProjectByName` + `ResolveLabelsByName` private helpers (case-insensitive exact, 0/>1 -> error string -> 400).
  - [x] 🟩 1.3 `AssignProjectRequest` + `BulkTaskData` gained `ProjectName`; single + bulk assignProject resolve it (name wins; else id incl null=Inbox).
  - [x] 🟩 1.4 `SetTaskLabelsRequest` -> nullable LabelIds + LabelNames; SetLabels computes an effective `int[]` then runs the existing replace logic.
  - [x] 🟩 1.5 11 tests (bulk setPriority set/out-of-range/missing; assign by name resolve/ambiguous-400/missing-400/name-wins; setLabels by name resolve + unknown-400; bulk assign by name). 120 backend tests pass; existing id paths green.

- [x] 🟩 **Step 2: MCP - tools + api-client** `[sequential]` → depends on: Step 1
  - [x] 🟩 2.1 `bulkTasks` data gained `priority`/`projectName` + `setPriority` op; `bulk_set_priority` tool added (count 19 -> 20; header 12 task tools / 4 bulk).
  - [x] 🟩 2.2 `setTaskProject`/`setTaskLabels` now take body objects; `assign_task_to_project` + `bulk_assign_to_project` gained `projectName` (projectId optional), `set_task_labels` gained `labelNames` (labelIds optional), all with name-OR-id + ambiguity-error describe text.
  - [x] 🟩 2.3 4 tests (setPriority + assignProject-by-name bulk body; setTaskProject projectName + setTaskLabels labelNames bodies). Typecheck clean; 82 MCP tests pass.

- [x] 🟩 **Step 3: Web UI - bulk Set priority** `[sequential]` → depends on: Step 1 `[UI]`
  - [x] 🟩 3.1 `bulkTasks` data + `BulkOperation` gained `priority`/`setPriority`. `BulkActionsBar` got a "Set priority" P1-P4 dropdown (reusing `PRIORITY_OPTIONS` + a colored dot), wired through `onSetPriority` -> `handleBulk("setPriority", { priority })`. handleBulk data type extended.
  - [x] 🟩 3.2 56 frontend tests still green; clean tsc + next build. No new unit test - the bulk bar is presentational (integration candidate, as in #63), exercised by the live smoke. Name resolution is MCP/API-only, no UI.

- [x] 🟩 **Step 4: Docs + CHANGELOG** `[sequential]` → depends on: Steps 1-3
  - [x] 🟩 4.1 architecture.md: bulk endpoint setPriority + projectName/labelNames on the project/labels rows; MCP tool count 19 -> 20 (prose + tree). product-design.md: bulk priority + name-friendly Claude line.
  - [x] 🟩 4.2 CHANGELOG.md: v2.10.7 section. coverage.md: counts (120 backend / 82 MCP) + ergonomics checklists.

- [ ] 🟥 **Step 5: Deploy + smoke test** `[sequential]` → depends on: Step 4
  - [ ] 🟥 5.1 Check phone reachable (dozes); if asleep, that is a user-action stop. Then stash the user's frontend WIP, `./scripts/deploy-phone.sh`, restore (pop) after.
  - [ ] 🟥 5.2 Live curl: bulk setPriority on N tasks; assign by projectName (+ ambiguous/missing -> 400); set labels by labelNames; clean up.
  - [ ] 🟥 5.3 DEFERRED user spot-check (non-blocking): web UI bulk "Set priority"; in Claude, "move these to Work", "make these P1", "tag these urgent".

## Outcomes

<!-- Fill in after execution: decision-relevant deltas only. What changed vs. planned? Key decisions made? Assumptions invalidated? -->
