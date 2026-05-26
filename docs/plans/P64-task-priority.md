# Feature Implementation Plan: Task priority (Todoist P1-P4)

**Overall Progress:** `0%`

**Tracking issue:** [#64](https://github.com/hydraInsurgent/Tasklog/issues/64)
**Branch:** `feature/task-priority-#64`
**Target version:** v2.10.5 (Phase 5 of 5 - final - per [proposal-mcp-and-ui-additions.md](proposal-mcp-and-ui-additions.md))

## TLDR

Give tasks a priority using Todoist's P1-P4 scheme (P1 highest). Stored as a non-null int 1-4 defaulting to 4 (P4 = none) via a DB migration. Editable on create/update, filterable, surfaced in MCP responses, and shown as a small colored dot in the UI with a picker in the add/edit forms and a filter row.

## Goal State

**Current State:** Tasks have no priority. There is no way to mark a task urgent or to ask "what's P1 and due this week".

**Goal State:** Every task has a priority 1-4 (default P4 = none). Set it on create or edit, filter by it, see it as a colored dot, and query it via Claude.

## Critical Decisions

- **Decision 1: Todoist P1-P4 as a non-null int, default 4.** P1 = Urgent (red), P2 = High (orange), P3 = Medium (blue), P4 = None (default). P1 is the highest urgency, so ascending sort = most urgent first. Storing a non-null int with a default of 4 (rather than nullable with null = none) avoids a null-vs-4 ambiguity - P4 *is* the "no priority" state.
- **Decision 2: DB migration adds `Priority INTEGER NOT NULL DEFAULT 4`.** Additive and safe; existing rows get 4. Migrations auto-apply on startup (`Database.Migrate()` in Program.cs), so the deployed phone DB upgrades on restart with no data loss.
- **Decision 3: No "clear" semantics for priority.** Unlike deadline, priority is never null. On the PATCH, `priority` present must be 1-4 (validate, else 400); omitted = keep. There is no "set to none" beyond choosing P4.
- **Decision 4: UI filters client-side; the backend `priorities` query param serves the MCP.** Matches the existing split (the web UI filters in `TasksClient.filteredTasks`; the backend filter params + `list_tasks` exist for Claude). Within a `priorities` list the semantics are OR (matches the label/project filter pattern).
- **Decision 5: No bulk priority.** Phase 4 (bulk) is shipped with complete/move/deadline only; adding a bulk priority op is out of scope here. Can be a future follow-up.
- **Decision 6: Priority dot shown for P1-P3 only.** P4 (none) renders nothing, keeping the default view uncluttered.

## API contract

```
Tasks gain:  priority  int  1-4 (1=P1 urgent .. 4=P4 none/default). Always present.

POST /api/tasks      body adds optional `priority` (1-4; omitted/null -> 4). 400 if out of range.
PATCH /api/tasks/{id} body adds optional `priority` (1-4). Present-key: omit=keep, value=set. 400 if out of range.
GET /api/tasks       adds optional `priorities` filter (repeated key, e.g. ?priorities=1&priorities=2). OR within.

MCP: create_task / update_task gain a priority param (1-4). list_tasks gains a priorities filter.
     Task objects include `priority`.
```

## Tasks

- [ ] 🟥 **Step 1: Backend - model, migration, endpoints, filter** `[sequential]` → depends on: nothing
  - [ ] 🟥 1.1 Add `public int Priority { get; set; } = 4;` to `TaskModel` (default 4 in code too, so new entities are P4 even before SaveChanges).
  - [ ] 🟥 1.2 Create the EF migration `AddPriority` (`Priority INTEGER NOT NULL DEFAULT 4`). Install `dotnet-ef` (local tool) if missing. Verify the generated migration + snapshot.
  - [ ] 🟥 1.3 `CreateTaskRequest` gains `int? Priority`; Create validates 1-4 (else 400) and defaults null/omitted to 4.
  - [ ] 🟥 1.4 `Update` (JsonElement PATCH): handle a `priority` key - if present, must be a number 1-4 (else 400); set it. Omitted = keep.
  - [ ] 🟥 1.5 `TaskFilterQuery` gains `int[]? Priorities`; GetAll filters `query.Where(t => filter.Priorities.Contains(t.Priority))` (OR within).
  - [ ] 🟥 1.6 Tests: create default=4; create with priority; create out-of-range 400; update sets priority; update out-of-range 400; update omit keeps; GetAll priorities filter (single + multi, OR).

- [ ] 🟥 **Step 2: MCP - priority param + filter + type + descriptions** `[sequential]` → depends on: Step 1
  - [ ] 🟥 2.1 Add `priority: number` to the `Task` interface; `priority?` to `createTask`/`updateTask` bodies; `priorities?: number[]` to `TaskFilter` + `buildTaskQuery` (repeated keys).
  - [ ] 🟥 2.2 `create_task` + `update_task` gain a `priority` Zod param (int 1-4, optional) with a description of the P1-P4 meaning. `list_tasks` gains a `priorities` filter param. Update the relevant "Returns:" hints to mention priority.
  - [ ] 🟥 2.3 Tests: buildTaskQuery serializes priorities as repeated keys; create/update body includes priority; Task type carries priority.

- [ ] 🟥 **Step 3: Web UI - types, dot, picker, filter** `[sequential]` → depends on: Step 1 `[UI]`
  - [ ] 🟥 3.1 Add `priority` to the frontend `Task` type + fixtures. `createTask`/`updateTask` accept priority; `FilterState` gains `priorities: number[]` (+ EMPTY_FILTER, hasActiveFilters, activeFilterCount).
  - [ ] 🟥 3.2 `format.ts`: `priorityMeta(priority)` -> `{ label, dotColor }` for P1 (red) / P2 (orange) / P3 (blue) / P4 (none -> no dot). A small `PriorityDot` rendering, shown next to the title in TaskCard + the desktop table (P1-P3 only).
  - [ ] 🟥 3.3 Priority picker (a labeled `<select>` P1-P4, default P4) in `AddTaskForm` (thread through `onAdd`) and `EditTaskModal` (diff + send on change).
  - [ ] 🟥 3.4 Priority filter row in `FilterPanel` (toggle chips P1-P4); apply client-side in `TasksClient.filteredTasks`.
  - [ ] 🟥 3.5 Fixtures/tests: add `priority` to Task literals; a focused test for `priorityMeta` and the dot showing for P1-P3 / hidden for P4. Keep existing tests green; clean tsc + build.

- [ ] 🟥 **Step 4: Docs + CHANGELOG** `[sequential]` → depends on: Steps 1-3
  - [ ] 🟥 4.1 architecture.md: add `Priority` to the Tasks data model (real column, with the migration); note priority on create/update/filter; bump nothing else structural.
  - [ ] 🟥 4.2 product-design.md: note tasks now have a priority (P1-P4).
  - [ ] 🟥 4.3 CHANGELOG.md: v2.10.5 section. coverage.md: new counts + checklists.

- [ ] 🟥 **Step 5: Deploy + smoke test** `[sequential]` → depends on: Step 4
  - [ ] 🟥 5.1 `./scripts/deploy-phone.sh`. CONFIRM the migration applied on the live DB (check the startup log / that existing tasks now report priority 4) - this is the first schema change of the run, so verify no data loss.
  - [ ] 🟥 5.2 Live curl: create a task with priority 2 (verify), create without priority (verify default 4), PATCH a task to priority 1 (verify), PATCH out-of-range -> 400, GET ?priorities=1 returns only P1. Existing tasks report priority 4. Clean up throwaways.
  - [ ] 🟥 5.3 DEFERRED user spot-check (non-blocking): web UI priority picker + dot + filter; in Claude, "make this P1" / "what's P1".

## Outcomes

<!-- Fill in after execution: decision-relevant deltas only. What changed vs. planned? Key decisions made? Assumptions invalidated? -->
