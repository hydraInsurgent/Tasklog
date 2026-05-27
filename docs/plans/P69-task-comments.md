# Feature Implementation Plan: Task comments + completion-log foundation

**Overall Progress:** `0%`

**Tracking issue:** [#69](https://github.com/hydraInsurgent/Tasklog/issues/69)
**Branch:** `feature/task-comments-#69`
**Target version:** v2.13.0 (minor - DB migration) - first of [proposal-recurring-and-habits.md](proposal-recurring-and-habits.md)

## TLDR

Add timestamped free-text comments to tasks. The smallest standalone win (the parked "Rich task detail: comments" slice) AND the substrate the later habit-tracking per-completion log (v2.17.0) needs. New `TaskComment` table, a `CommentsController` sub-resource, an MCP `add_task_comment` tool with comments surfaced in `get_task`, and a comments section on the task detail page.

## Goal State

**Current State:** A task has title/description/deadline/project/labels/priority. No way to log notes/progress over time.
**Goal State:** Any task carries a list of timestamped comments - add/list/delete in the UI, add (+ read via get_task) over MCP, and a clean foundation for logging completions later.

## Critical Decisions

- **Decision 1: A dedicated `TaskComment` entity + `CommentsController` sub-resource** (`api/tasks/{taskId}/comments`), not fields on the task. Comments are 1-to-many and time-ordered; a separate table is the natural shape and keeps `TasksController` (already large) focused. Mirrors the `Label`/`Project` model conventions (`[JsonIgnore]` on the back-nav to avoid serialization cycles).
- **Decision 2: Comments are included in `GetById` only, not `GetAll`.** The detail page and `get_task` need them; the list view and `list_tasks` do not, and including them on every row would bloat list payloads. `GetById` adds `.Include(t => t.Comments)`.
- **Decision 3: Body required, trimmed, capped at 2000 chars** (consistent with the description cap). Empty/whitespace or too-long -> 400; unknown task -> 404. Newest-first ordering.
- **Decision 4: MCP gets add + read, not delete (yet).** `add_task_comment` covers the LLM's real need ("log a note"); comments are read via `get_task`. Delete is UI-only for now (rarely needed by the agent; can add later). Cascade-delete via the FK so deleting a task removes its comments.

<!-- GUIDELINES CHECK: first new top-level entity since Labels (#30) - same EF + controller patterns, no new architecture. Migration -> minor. product-design "Tasks" rules gain comments. -->

## API contract

```
TaskComment: { id, body, createdAt }  (taskId implied by the route)

POST   /api/tasks/{taskId}/comments        body { body: string }  -> 201 the created comment
                                            400 empty/whitespace or > 2000; 404 unknown task
GET    /api/tasks/{taskId}/comments         -> the task's comments, newest first; 404 unknown task
DELETE /api/tasks/{taskId}/comments/{id}    -> 204; 404 if the comment (under that task) is missing
GET    /api/tasks/{id}                       now includes `comments[]`
MCP: add_task_comment(taskId, body) -> the created comment; get_task includes comments[].
```

## Tasks

- [ ] 🟥 **Step 1: Backend - model, migration, CommentsController** `[sequential]` → depends on: nothing
  - [ ] 🟥 1.1 `TaskComment` model (Id, required Body, CreatedAt, TaskId, `[JsonIgnore]` Task nav). `TaskModel` gains `ICollection<TaskComment> Comments`. DbContext: `DbSet<TaskComment>` + the Task->Comments relationship (cascade delete).
  - [ ] 🟥 1.2 Migration `AddTaskComment` via GLOBAL dotnet-ef (no local manifest). Verify it creates the table + FK, no other changes.
  - [ ] 🟥 1.3 `CommentsController` (`[Route("api/tasks/{taskId:int}/comments")]`): POST (404 if task missing; body trim, non-empty + <=2000 else 400; 201 with the created comment), GET (newest-first; 404 if task missing), DELETE `{id:int}` (204; 404 if not found under that task).
  - [ ] 🟥 1.4 `GetById` adds `.Include(t => t.Comments)` so the single-task response carries them (GetAll unchanged).
  - [ ] 🟥 1.5 Tests: add returns 201 + persists; add empty/whitespace -> 400; add > 2000 -> 400; add to unknown task -> 404; GET lists newest-first; DELETE removes (204) + unknown -> 404; GetById includes comments.

- [ ] 🟥 **Step 2: MCP - add_task_comment + comments in get_task** `[sequential]` → depends on: Step 1
  - [ ] 🟥 2.1 `Comment` interface (`{ id, body, createdAt }`); `Task` interface gains `comments?: Comment[]` (present on get_task). `api.addTaskComment(taskId, body)`.
  - [ ] 🟥 2.2 `add_task_comment` tool (taskId + body, body min 1 / max 2000) with describe + "Returns:" the created comment. `get_task` Returns line notes it includes comments[]. Header/tool count update (labels family stays; task tools 12 -> 13).
  - [ ] 🟥 2.3 Tests: add_task_comment body contract; Comment shape in the Task type.

- [ ] 🟥 **Step 3: Web UI - comments on the detail page** `[sequential]` → depends on: Step 1 `[UI]`
  - [ ] 🟥 3.1 Frontend `Comment` type + `Task.comments?`. `api.ts`: `addComment(taskId, body)` + `deleteComment(taskId, id)` (getTask already returns comments).
  - [ ] 🟥 3.2 New `TaskComments` client component (initial comments + taskId props): list newest-first with delete buttons + an add textarea (optimistic-ish; refresh from response). Rendered on the task detail page below the detail rows.
  - [ ] 🟥 3.3 Fixtures/tests: keep existing green; a focused TaskComments test if practical (add calls api, renders list). Clean tsc + build.

- [ ] 🟥 **Step 4: Docs + CHANGELOG** `[sequential]` → depends on: Steps 1-3
  - [ ] 🟥 4.1 architecture.md: `TaskComment` table + the comments endpoints + GetById-includes-comments; MCP tool count. product-design.md: tasks can have comments. engineering-guidelines: (nothing new) .
  - [ ] 🟥 4.2 CHANGELOG.md: v2.13.0 section. coverage.md: new counts + checklists.

- [ ] 🟥 **Step 5: Deploy + smoke test** `[sequential]` → depends on: Step 4
  - [ ] 🟥 5.1 Check phone reachable (dozes); capture live task count. Stash frontend WIP, `./scripts/deploy-phone.sh`, restore (pop) after. CONFIRM the migration applied with zero data loss (count unchanged).
  - [ ] 🟥 5.2 Live curl: add a comment (201), GET lists it, add empty -> 400, add to unknown task -> 404, DELETE (204), get_task/{id} includes comments. Clean up.
  - [ ] 🟥 5.3 DEFERRED user spot-check (non-blocking): web UI add/delete a comment on a task's detail page; in Claude, "add a note to task N".

## Outcomes

<!-- Fill in after execution: decision-relevant deltas only. What changed vs. planned? Key decisions made? Assumptions invalidated? -->
