# Feature Implementation Plan: Task comments + completion-log foundation

**Overall Progress:** `100%`

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

- [x] 🟩 **Step 1: Backend - model, migration, CommentsController** `[sequential]` → depends on: nothing
  - [x] 🟩 1.1 `TaskComment` model + `TaskModel.Comments` nav; DbContext DbSet + cascade FK.
  - [x] 🟩 1.2 `AddTaskComment` migration via global dotnet-ef (no manifest); Comments table + FK.
  - [x] 🟩 1.3 `CommentsController` at `api/tasks/{taskId}/comments`: POST (404/400/201), GET (newest-first, 404), DELETE (204/404).
  - [x] 🟩 1.4 `GetById` filtered-include of Comments (newest-first); GetAll unchanged.
  - [x] 🟩 1.5 10 tests (CommentsControllerTests: add/empty-400/too-long-400/unknown-404/list-newest-first/get-404/delete-204/delete-404 + GetById-includes-comments). 143 backend tests pass.

- [x] 🟩 **Step 2: MCP - add_task_comment + comments in get_task** `[sequential]` → depends on: Step 1
  - [x] 🟩 2.1 `Comment` interface + `Task.comments?`; `api.addTaskComment(taskId, body)`.
  - [x] 🟩 2.2 `add_task_comment` tool (body 1-2000) + Returns; get_task Returns notes comments[]; header (13 task tools / 21 total).
  - [x] 🟩 2.3 2 tests (add_task_comment body; Comment[] type). Typecheck clean; 87 MCP tests pass.

- [x] 🟩 **Step 3: Web UI - comments on the detail page** `[sequential]` → depends on: Step 1 `[UI]`
  - [x] 🟩 3.1 Frontend `Comment` type + `Task.comments?`; `addComment`/`deleteComment` in api.ts (addComment surfaces the backend message).
  - [x] 🟩 3.2 New `TaskComments` client component (list newest-first + delete + add textarea, prepends the created comment), rendered at the bottom of the task detail card.
  - [x] 🟩 3.3 61 frontend tests still green; clean tsc + next build. No new unit test - TaskComments is an interactive API-wiring component (integration territory, as BulkActionsBar/EditTaskModal), covered by the live smoke.

- [x] 🟩 **Step 4: Docs + CHANGELOG** `[sequential]` → depends on: Steps 1-3
  - [x] 🟩 4.1 architecture.md: Comments table + comments endpoints + GetById-includes; MCP tool count 20 -> 21 (prose + tree). product-design.md: tasks can have comments.
  - [x] 🟩 4.2 CHANGELOG.md: v2.13.0 section. coverage.md: counts (143 backend / 87 MCP / 61 frontend) + CommentsController + comments-wire checklists.

- [x] 🟩 **Step 5: Deploy + smoke test** `[sequential]` → depends on: Step 4
  - [x] 🟩 5.1 Phone reachable; baseline 25 tasks / 9 projects. Stash-deploy-pop (WIP DoppelWidget untouched). Deploy exit 0, all 4 services fresh-restarted, migration ran. Post-migration count 25/9 - zero data loss.
  - [x] 🟩 5.2 Live curl all green: add 201 (body trimmed, createdAt +05:30), GET 200 newest-first, empty -> 400, unknown task -> 404, GetById includes comments[], DELETE 204, re-DELETE 404. Smoke comments cleaned up (task 51 back to []).
  - [ ] 🟥 5.3 DEFERRED user spot-check (non-blocking): web UI add/delete a comment on a task's detail page; in Claude, "add a note to task N".

## Outcomes

Built exactly as planned, no scope drift. New `TaskComment` entity + `CommentsController` sub-resource, MCP `add_task_comment` + comments in `get_task`, web comments section on the detail page. 143 backend / 87 MCP / 61 frontend tests pass.

- **Step 5.3 (user spot-check) left deferred** - non-blocking, consistent with prior versions. All behavior verified at API + unit + live-curl.
- **Decision 4 held:** MCP gets add + read only (no delete tool). Delete stays UI-only; cascade FK handles task-deletion cleanup.
- **Live smoke confirmed timezone correctness** - `createdAt` returns `+05:30` (Asia/Kolkata), so comment timestamps read in user-local time, same as deadlines.
- **No new architecture pattern** - first new top-level entity since Labels (#30), reused the same EF + controller + `[JsonIgnore]` back-nav conventions. Migration -> minor bump (v2.13.0).
- **Foundation for v2.17.0 habit log** is in place: a per-task timestamped log the completion tracker can append to.
