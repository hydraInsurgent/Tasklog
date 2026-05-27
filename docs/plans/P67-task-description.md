# Feature Implementation Plan: Task description field

**Overall Progress:** `100%` (engineering complete; Step 5.3 is a deferred post-ship user spot-check)

**Tracking issue:** [#67](https://github.com/hydraInsurgent/Tasklog/issues/67)
**Branch:** `feature/task-description-#67`
**Target version:** v2.11.0 (minor - DB migration) - third of [proposal-next-versions.md](proposal-next-versions.md)

## TLDR

Give tasks an optional free-text `Description`. Today titles double as metadata storage (a real task has a Medium URL crammed into its title); a description gives that context a home. Nullable column, threaded through create/update/MCP and shown in the add/edit forms + the task detail page. The smallest slice of the parked "Rich task detail" idea (subtasks/comments stay parked).

## Goal State

**Current State:** A task is title + deadline + project + labels + priority + completion. No place for notes/context.
**Goal State:** A task can carry an optional multiline description, set on create or edit, visible on its detail page, editable/queryable via Claude.

## Critical Decisions

- **Decision 1: Nullable `Description TEXT` column - no zero-value trap.** Unlike #64's priority (a non-null int that needed `HasDefaultValue(4)`), a nullable string's default is `null`, which IS the intended "no description". So the migration is the plain EF default and needs no model-config tweak. Existing rows migrate to null.
- **Decision 2: Clear semantics on PATCH (like deadline).** Update reads the body as `JsonElement`: `description` omitted = keep, present-and-`null`-or-empty/whitespace = clear (store null), present string = set (trimmed). Create: optional; null/whitespace = null.
- **Decision 3: 2000-char cap → 400.** Input hygiene, same spirit as the bulk 500-id cap. Applied on both Create and Update.
- **Decision 4: Plain multiline text, not markdown.** Rendered with `whitespace-pre-wrap` (preserves line breaks) - no rich-text/markdown parsing this release.

<!-- GUIDELINES CHECK: second use of the [NotMapped]-free real-column migration pattern (cf. #64 priority) and the JsonElement present-key PATCH (cf. #59). No new pattern. Migration -> minor bump. product-design "Tasks" rules gain a field. -->

## API contract

```
Tasks gain:  description  string | null  (optional free text, <= 2000 chars)

POST /api/tasks       body adds optional `description` (null/blank -> null; >2000 -> 400)
PATCH /api/tasks/{id} body adds optional `description` - present-key: omit=keep,
                      null/empty=clear, string=set (trimmed, <=2000 else 400)
MCP: create_task / update_task gain a `description` param; Task objects include it.
```

## Tasks

- [x] 🟩 **Step 1: Backend - column, migration, create/update** `[sequential]` → depends on: nothing
  - [x] 🟩 1.1 `TaskModel` gained nullable `Description`.
  - [x] 🟩 1.2 `AddDescription` migration via global dotnet-ef (no local manifest); verified nullable TEXT, no default.
  - [x] 🟩 1.3 `CreateTaskRequest` gained `Description = null`; Create normalises + 400 on >2000.
  - [x] 🟩 1.4 Update handles the `description` key (null/blank=clear, string=set trimmed, 400 on >2000, omit=keep) via the shared `NormalizeDescription` helper.
  - [x] 🟩 1.5 9 tests (create with/blank/none/too-long-400; update set/clear[null+blank]/omit-keeps/too-long-400). 129 backend tests pass.

- [x] 🟩 **Step 2: MCP - param + type** `[sequential]` → depends on: Step 1
  - [x] 🟩 2.1 `Task` gained `description`; createTask/updateTask bodies gained `description?`.
  - [x] 🟩 2.2 `create_task` (string max 2000) + `update_task` (nullable, for clearing) gained `description`; update description text + list_tasks Returns shape mention it.
  - [x] 🟩 2.3 3 tests (create/update set, update null clears); fixed the dueStatus Task literal. 85 MCP tests pass.

- [x] 🟩 **Step 3: Web UI - forms + detail render** `[sequential]` → depends on: Step 1 `[UI]`
  - [x] 🟩 3.1 Frontend `Task` type gained `description`; createTask/updateTask accept it.
  - [x] 🟩 3.2 `AddTaskForm`: full-width multiline `<textarea>` (maxLength 2000, resets after submit). `EditTaskModal`: prefilled textarea, diffed + sent on change (blank -> null clears).
  - [x] 🟩 3.3 Detail page renders the description (`whitespace-pre-wrap`) under the title, only when present. (Skipped the optional list indicator - keeps the list uncluttered.)
  - [x] 🟩 3.4 Added `description` to the TaskCard fixture; fixed the AddTaskForm onAdd-arg assertion. 56 frontend tests green; clean tsc + next build.

- [x] 🟩 **Step 4: Docs + CHANGELOG** `[sequential]` → depends on: Steps 1-3
  - [x] 🟩 4.1 architecture.md: `Description` in the Tasks data model + POST/PATCH rows. product-design.md: optional description on tasks.
  - [x] 🟩 4.2 CHANGELOG.md: v2.11.0 section. coverage.md: counts (129 backend / 85 MCP) + description checklists.

- [x] 🟩 **Step 5: Deploy + smoke test** `[sequential]` → depends on: Step 4
  - [x] 🟩 5.1 Deployed (twice - see Outcomes; a missed TasksClient commit needed a fix + re-deploy). Migration verified: 25 tasks before and after (zero data loss), all report a description field (null for existing rows).
  - [x] 🟩 5.2 Live curl on throwaways (then deleted): create with description (trimmed), create without (null), PATCH set, PATCH clear (null), PATCH >2000 -> 400. ALL PASSED.
  - [x] 🟩 5.3 DEFERRED user spot-check (non-blocking): web UI add/edit description + detail page; in Claude, "add a note to task N". Verified at API + unit + live-curl level.

## Outcomes

Built as planned. Nullable column, so the migration was the plain EF default (no `HasDefaultValue` needed, unlike #64) and applied to the live DB with zero data loss (25 tasks, existing rows -> null).

- **Process slip (caught + recovered):** the `TasksClient.handleAdd` edit (pass description to `createTask`) was made in the working tree but omitted from the v2.11.0 commit's explicit file list, then swept into the stash during deploy. Result: the committed code's web Add-form collected a description but dropped it (backend/MCP/edit-modal fine). Caught via a file-change notice, popped the stash, committed just `TasksClient.tsx`, and re-deployed. Cost: one extra deploy. Lesson: when staging explicit paths to dodge the user's WIP, double-check EVERY file the change touched - `git status` the staged set against the diff before committing.
- **Clear semantics mirror deadline:** present null/blank clears (stored null), string sets (trimmed), omit keeps. The EditTaskModal diff normalises blank->null on both sides so "still no description" isn't a spurious change.
- **2000-char cap** on both create and update (input hygiene, like the bulk 500-id cap). Plain text, `whitespace-pre-wrap` on the detail page - no markdown this release.
- **Tests:** +9 backend, +3 MCP. Totals 129 backend / 85 MCP / 56 frontend; clean tsc + next build.
- **Pending:** only the hands-on spot-check (5.3), then ship as v2.11.0 (the first minor of the new roadmap).
