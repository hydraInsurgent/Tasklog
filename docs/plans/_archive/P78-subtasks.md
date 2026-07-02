# Subtasks Implementation Plan

**Overall Progress:** `100%`

## TLDR

Add lightweight subtasks: one-line checklist items nested under a parent task, each with a title, a done state, an optional deadline, and a manual order. The parent shows progress (2/5) so long-running work stays visible on one card. A subtask that gets a deadline also surfaces as its own card in the list/due views, breadcrumbed back to its parent. Modeled as a small dedicated `Subtask` table (mirrors `TaskComment`/`CheckIn`), not full self-referencing child tasks.

## Goal State

**Current State:** A task is a flat entity. Long-running work (a task with many steps) has no way to track internal progress except free-text description/comments. Nothing nests under a task.

**Goal State:** A task can hold an ordered list of subtasks. Subtasks are tickable inline on the card and fully editable in the detail modal. Dated subtasks appear in the main list as their own cards. Completing a parent prompts a choice (complete-all vs pull-remaining-out). Recurring parents reset their subtasks each occurrence. claude.ai can manage subtasks via MCP.

## Critical Decisions

- **Lightweight dedicated table, not child tasks** - `Subtask` mirrors the `TaskComment`/`CheckIn` pattern (cascade FK, `[JsonIgnore]` back-nav). Subtask fields are title + done + optional deadline only. Project/labels are inherited from the parent for filtering. Rationale: Simplicity First; a subtask graduates to a real task only on demand via the completion "pull out" path.
- **Counts via `[NotMapped]` getters** - `SubtaskCount` / `CompletedSubtaskCount` are computed getters on `TaskModel` (mirroring `DueStatus`), serialized on every task. Full subtask rows load only on `GetById` (like comments), keeping the list payload lean. To make the counts available in the list without loading rows, `GET /api/tasks` uses a lightweight projection of counts (see Step 3).
- **Dated subtasks projected as synthetic rows** - `GET /api/tasks` projects incomplete, deadline-bearing subtasks into the response as task-shaped rows (`isSubtask=true`, `parentTaskId`, `parentTitle`, inherited `projectId`+`labels`, own `deadline`/`dueStatus`). They flow through the existing client-side filter/sort unchanged. The parent's own `dueStatus` is derived only from its own deadline.
- **Parent completion modes** - `PATCH /api/tasks/{id}/complete` accepts `subtaskMode: "completeAll" | "pullOut"`. `completeAll` marks all open subtasks complete; `pullOut` converts remaining open subtasks into standalone tasks (parent's project, keep title/deadline, a comment referencing the parent) then removes them from the parent. Recurring parents show the same dialog, then spawn the next occurrence with subtasks reset to unchecked.
- **Reorder via `@dnd-kit`** - first drag-and-drop dependency. Approved as a clear-benefit dependency (touch-friendly reorder on phone), same reasoning that admitted `chrono-node`. New entry for engineering-guidelines.
- **MCP parity in v1** - subtask tools (add/list/toggle/delete/reorder) ship with the feature, matching the project's full-API-coverage convention.
- **`DateTime.Now` (not `UtcNow`)** - match the existing controller convention (issue #18 deviation), so subtask timestamps/comparisons are consistent with tasks/comments.

<!-- GUIDELINES CHECK:
  - New pattern: @dnd-kit is the first drag-and-drop library -> add to engineering-guidelines.md at /document.
  - New pattern: synthetic projected rows in a list response (mixed-shape array with an isSubtask discriminator) -> document as a decision.
  - Product scope: product-design.md gains "subtasks" as a task capability. Note at /document.
  - No known deviation is resolved; DateTime.Now (#18) is deliberately followed for consistency.
-->

## Tasks

- [x] 🟩 **Step 1: Subtask model + migration + DbContext** `[sequential]` → depends on: none (foundation)
  - [x] 🟩 Add `Models/Subtask.cs`: `Id`, `Title` (required), `IsCompleted`, `Position` (int), `Deadline` (nullable DateTime), `CreatedAt`, `TaskId` (FK), `[JsonIgnore] TaskModel? Task`. Mirror `TaskComment.cs`.
  - [x] 🟩 `TaskModel.cs`: `[JsonIgnore] ICollection<Subtask> Subtasks`; `[NotMapped]` settable `SubtaskCount`/`CompletedSubtaskCount` (controller-populated); `[NotMapped]` projected-row fields `IsSubtask`, `ParentTaskId`, `ParentTitle`.
  - [x] 🟩 `TasklogDbContext.cs`: `DbSet<Subtask> Subtasks`; cascade config + index on `TaskId`.
  - [x] 🟩 Generate EF migration `AddSubtasks` (verified cascade + nullable Deadline + index). Applied to dev DB.

- [x] 🟩 **Step 2: Subtask CRUD + reorder endpoints** `[sequential]` → depends on: Step 1
  - [x] 🟩 `SubtasksController` (route `api/tasks/{taskId}/subtasks`): `POST` create (title required <=500, optional deadline; Position = max+1); `PATCH {id}` present-key `JsonElement` update of `title`/`deadline`/`isCompleted`; `DELETE {id}` (204); `POST reorder` (ordered id array, validated as a permutation of the task's subtask ids).
  - [x] 🟩 `GetById`: `.Include(t => t.Subtasks.OrderBy(s => s.Position))`; sets the two counts from the loaded collection.
  - [x] 🟩 Return shapes consistent with existing controllers (404 task/subtask missing, 400 bad input).

- [x] 🟩 **Step 3: List projection + counts** `[sequential]` → depends on: Step 2
  - [x] 🟩 `GET /api/tasks`: `SubtaskCount`/`CompletedSubtaskCount` stitched from a single grouped count query (no full rows loaded).
  - [x] 🟩 Project incomplete, dated subtasks as synthetic `TaskModel` rows (`IsSubtask`, `ParentTaskId`, `ParentTitle`, inherited `ProjectId`/`Labels`/`Priority`, own `Id`+`Deadline`). **Gated behind a new `includeSubtasks` query flag** so MCP's `list_tasks` stays pure tasks; skipped when `completed=true`.
  - [x] 🟩 Projected rows carry the subtask id (frontend disambiguates via `isSubtask`); counts computed on real tasks before projection so no double-count.

- [x] 🟩 **Step 4: Parent completion modes + recurrence reset** `[sequential]` → depends on: Step 2
  - [x] 🟩 `CompleteTaskRequest` gains `string? SubtaskMode` (`completeAll` default | `pullOut`).
  - [x] 🟩 On complete with open subtasks: `completeAll` ticks all; `pullOut` creates a standalone `TaskModel` per open subtask (parent's `ProjectId`, keep `Title`/`Deadline`, back-reference comment) and removes it from the parent.
  - [x] 🟩 Recurrence spawn block: next occurrence copies a pre-mutation snapshot of the subtasks reset to unchecked (Title + Position carried; **per-occurrence deadlines dropped** to avoid an instantly-overdue copy - deviation from plan, see Outcomes).
  - [x] 🟩 No subtasks -> unchanged behaviour. Fixed a pre-existing unrelated test-suite compile break (`TimeEntriesControllerTests` `List` call). 285 tests green.

- [x] 🟩 **Step 5: MCP subtask tools** `[parallel]` → delivers: claude.ai subtask management
  - [x] 🟩 `api-client.ts`: `Subtask` type + `addSubtask`/`listSubtasks`/`updateSubtask`/`deleteSubtask`/`reorderSubtasks`; `Task` gains `subtaskCount`/`completedSubtaskCount`/`subtasks?`.
  - [x] 🟩 New `tools/subtasks.ts`: `add_subtask`, `list_subtasks`, `set_subtask_completion`, `update_subtask`, `delete_subtask`, `reorder_subtasks`, Zod-schema'd, registered in `registry.ts`. Build clean, 101 MCP tests pass.

- [x] 🟩 **Step 6: Frontend data layer** `[sequential]` → depends on: Step 3
  - [x] 🟩 `lib/api.ts` `Task` type: added `subtaskCount`, `completedSubtaskCount`, `subtasks?`, `parentTaskId?`, `isSubtask?`, `parentTitle?`; new `Subtask` type. `getTasks` now passes `?includeSubtasks=true`.
  - [x] 🟩 `lib/api.ts` functions: `createSubtask`, `updateSubtask`, `toggleSubtask`, `deleteSubtask`, `reorderSubtasks`; `completeTask` gained the `subtaskMode` arg.

- [x] 🟩 **Step 7: TaskCard inline subtasks + dated-subtask card** `[sequential]` → depends on: Step 6
  - [x] 🟩 New `SubtaskChecklist.tsx` (tickable circles, cap 6 + "+N more"); `TaskCard.tsx` renders it + a "2/5" footer chip; card grows.
  - [x] 🟩 Projected-subtask rendering: TaskCard shows a "↳ parentTitle" breadcrumb + routes its toggle to the subtask; the desktop table mirrors it (breadcrumb, progress chip, action/selection guards). `rowKey` disambiguates colliding ids.
  - [x] 🟩 `TasksClient.tsx`: `handleToggleSubtask` (optimistic + revert); completion routing; projected rows excluded from board + multi-select.
  - [x] 🟩 `BoardCard.tsx`: "2/5" progress indicator in row 2.

- [x] 🟩 **Step 8: Detail modal subtask section + drag reorder** `[sequential]` → depends on: Step 6
  - [x] 🟩 Added `@dnd-kit/core` + `/sortable` + `/utilities`.
  - [x] 🟩 New `SubtaskSection.tsx`: add / toggle / edit-deadline (DeadlinePopover) / delete / drag-reorder; optimistic with revert; bubbles counts up. Mounted in `TaskDetailModal` and the standalone `/tasks/[id]` page (handler optional for the Server Component).

- [x] 🟩 **Step 9: Parent-completion confirmation dialog** `[sequential]` → depends on: Step 7
  - [x] 🟩 New `CompleteWithSubtasksDialog.tsx` (DeleteProjectDialog overlay pattern): "Complete all N" vs "Move them out"; wires `subtaskMode` into `completeTask`.
  - [x] 🟩 Hooked into `handleComplete` (defers to the dialog when a parent has open subtasks); recurring tasks get it too. Frontend typechecks + production-builds clean.

- [x] 🟩 **Step 10: Unit tests** `[sequential]` → depends on: Steps 1-4, 6-9
  - [x] 🟩 Backend: `SubtasksControllerTests` (CRUD + reorder + validation) and `SubtaskTasksIntegrationTests` (counts, projection incl./excl. rules, completeAll, default mode, pullOut, recurrence reset-copy). 305 tests green (20 new).
  - [x] 🟩 MCP: subtask wire-contract tests added to `api-client.test.ts`. 105 tests green.

- [x] 🟩 **Step 11: Review, screenshot verification, docs** `[sequential]` → depends on: Step 10
  - [x] 🟩 Independent diff review: no high-sev bugs. Fixed [med] projection now projects from already-loaded parent subtasks so it respects all parent filters + limit (and drops a redundant query); tidied helper placement; hardened the pull-out/recurrence reconcile against projected-row id collisions. Added a projection-respects-project-filter test (306 green).
  - [x] 🟩 Screenshots verified: desktop list "2/5" chip, mobile inline tickable checklist, detail modal + standalone page subtask sections (drag handles + dated pill), projected dated-subtask card with "↳ parent" breadcrumb in the list.
  - [x] 🟩 `/document`: synced README, CHANGELOG (v2.20.0 draft), architecture (data model + endpoints + flags + 35 MCP tools + components), product-design (subtasks capability), engineering-guidelines (projected-rows + @dnd-kit patterns). Issue #78 commented, ready for /ship.

## Outcomes

Delivered as planned across backend, MCP, and frontend. Decision-relevant deltas:

- **`subtasks[]` in the list, not just counts.** The plan said keep the list lean (counts only, full rows on GetById). But the user explicitly wanted tickable subtask circles *on the card*, which needs the rows. Subtasks are tiny (unlike comments), so `Subtasks` lost its `[JsonIgnore]` and the list loads them only when `includeSubtasks=true` (the web flag). MCP's `list_tasks` stays pure (`subtasks: []`). Counts are still always populated (cheap; MCP benefits).
- **`includeSubtasks` query flag.** Introduced so the projection of dated subtasks is web-only; MCP never sees synthetic rows. Not in the original plan sketch but fell out naturally.
- **Recurrence reset drops the subtask deadline.** Plan said carry Title/Position/Deadline. Carrying a past per-occurrence deadline would render the next occurrence's subtask instantly overdue, so the reset-copy carries Title + Position only (deadline null). Snapshot is taken *before* completeAll/pullOut mutate the current occurrence, so pull-out + recurrence in one call still spawns a correct fresh checklist.
- **Card-surface split.** Inline tickable checklist lives on the card-based surfaces (mobile card, board "2/5", detail modal, detail page). The desktop *table* shows a "2/5" chip that opens the modal (a table row can't grow a checklist cleanly). Projected dated-subtask rows appear across list views with a "↳ parent" breadcrumb and no task-level actions.
- **Projection projects from already-loaded parent subtasks** (review fix) - so it inherently respects every filter + `limit` applied to parents and avoids a second query.
- **Pre-existing test breakage fixed:** `TimeEntriesControllerTests` `List(...)` call was missing the `taskId` arg added in v2.19.0; corrected so the suite compiles. Unrelated to subtasks but blocked the run.
- **New dependency:** `@dnd-kit/core` + `/sortable` + `/utilities` (first drag-and-drop lib) for touch-friendly reorder. New `.config/dotnet-tools.json` pins the local `dotnet-ef` tool.
- Tests: backend 306 (21 new), MCP 105. Verified in-app via screenshots on desktop + mobile widths.
