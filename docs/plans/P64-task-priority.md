# Feature Implementation Plan: Task priority (Todoist P1-P4)

**Overall Progress:** `80%`

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

- [x] 🟩 **Step 1: Backend - model, migration, endpoints, filter** `[sequential]` → depends on: nothing
  - [x] 🟩 1.1 Added `public int Priority { get; set; } = 4;` to `TaskModel`.
  - [x] 🟩 1.2 Migration `AddPriority` created (installed dotnet-ef local tool). First gen defaulted to 0 (CLR default); fixed by `HasDefaultValue(4)` in the DbContext + regenerating, so the column is `NOT NULL DEFAULT 4` and existing rows migrate to P4.
  - [x] 🟩 1.3 `CreateTaskRequest` gained `int? Priority = null`; Create validates 1-4 (400) and defaults to 4.
  - [x] 🟩 1.4 `Update` handles a `priority` key (number 1-4 else 400; omitted = keep). No clear (P4 is none).
  - [x] 🟩 1.5 `TaskFilterQuery` gained `int[]? Priorities = null`; GetAll filters OR-within. (Record params defaulted so existing positional call sites still compile.)
  - [x] 🟩 1.6 10 tests (create default 4 / set / out-of-range 400 x2; update set / omit-keeps / bad x3; priorities filter single + multi-OR). 97 backend tests pass.

- [x] 🟩 **Step 2: MCP - priority param + filter + type + descriptions** `[sequential]` → depends on: Step 1
  - [x] 🟩 2.1 Added `priority: number` to `Task`; `priority?` to createTask/updateTask bodies; `priorities?: number[]` to `TaskFilter` + `buildTaskQuery` (repeated keys).
  - [x] 🟩 2.2 `create_task` + `update_task` gained a `priority` Zod param (int 1-4) with P1-P4 descriptions; `list_tasks` gained a `priorities` filter; Returns hint + descriptions mention priority. Tool count stays 19 (params, not new tools).
  - [x] 🟩 2.3 +4 tests (create/update priority body, priorities repeated-key serialization + empty-array omit; updated the dueStatus shape test for the new field). Typecheck clean; 74 MCP tests pass.

- [x] 🟩 **Step 3: Web UI - types, dot, picker, filter** `[sequential]` → depends on: Step 1 `[UI]`
  - [x] 🟩 3.1 `priority` on the frontend `Task` type + fixtures; createTask/updateTask accept priority; `FilterState` gained `priorities` (+ EMPTY_FILTER / hasActiveFilters / activeFilterCount).
  - [x] 🟩 3.2 `format.ts`: `priorityMeta` + `PRIORITY_OPTIONS`. New `PriorityDot` component (P1 red / P2 orange / P3 blue; P4 = nothing) with an accessible label, shown next to the title in TaskCard + the desktop table.
  - [x] 🟩 3.3 Priority `<select>` (P1-P4, default P4) in `AddTaskForm` (threaded through `onAdd`) and `EditTaskModal` (diff + send only on change).
  - [x] 🟩 3.4 Priority filter row (toggle chips) in `FilterPanel`; applied client-side in `TasksClient.filteredTasks` (OR within).
  - [x] 🟩 3.5 +6 tests (priorityMeta/PRIORITY_OPTIONS, dot shown P1 / hidden P4); fixed 2 AddTaskForm tests for the new onAdd arg + the second combobox. 56 frontend tests pass; clean tsc + next build.

- [x] 🟩 **Step 4: Docs + CHANGELOG** `[sequential]` → depends on: Steps 1-3
  - [x] 🟩 4.1 architecture.md: added `Priority` column to the Tasks data model + the create/update/filter endpoint notes + `PriorityDot` in the tree.
  - [x] 🟩 4.2 product-design.md: noted the P1-P4 priority capability.
  - [x] 🟩 4.3 CHANGELOG.md: v2.10.5 section. coverage.md: counts (97/74/56) + priority checklists.

- [ ] 🟥 **Step 5: Deploy + smoke test** `[sequential]` → depends on: Step 4
  - [ ] 🟥 5.1 `./scripts/deploy-phone.sh`. CONFIRM the migration applied on the live DB (check the startup log / that existing tasks now report priority 4) - this is the first schema change of the run, so verify no data loss.
  - [ ] 🟥 5.2 Live curl: create a task with priority 2 (verify), create without priority (verify default 4), PATCH a task to priority 1 (verify), PATCH out-of-range -> 400, GET ?priorities=1 returns only P1. Existing tasks report priority 4. Clean up throwaways.
  - [ ] 🟥 5.3 DEFERRED user spot-check (non-blocking): web UI priority picker + dot + filter; in Claude, "make this P1" / "what's P1".

## Outcomes

<!-- Fill in after execution: decision-relevant deltas only. What changed vs. planned? Key decisions made? Assumptions invalidated? -->
