# Feature Implementation Plan: Task description field

**Overall Progress:** `0%`

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

- [ ] 🟥 **Step 1: Backend - column, migration, create/update** `[sequential]` → depends on: nothing
  - [ ] 🟥 1.1 `TaskModel` gains `public string? Description { get; set; }`. (No DbContext config - nullable string maps and defaults to null.)
  - [ ] 🟥 1.2 Create migration `AddDescription` via a GLOBAL `dotnet-ef` install (NOT a local tool manifest - a committed `dotnet-tools.json` broke release CI in #65's tail). Verify it adds a nullable TEXT column with no default.
  - [ ] 🟥 1.3 `CreateTaskRequest` gains `string? Description = null`; Create normalises (trim; null/whitespace -> null) and 400s if > 2000 chars; sets it.
  - [ ] 🟥 1.4 `Update` handles a `description` key: null/empty/whitespace -> clear; string -> trimmed set (400 if > 2000); omitted -> keep. A small shared `NormalizeDescription(string?)` helper avoids duplicating the trim/cap between Create and Update.
  - [ ] 🟥 1.5 Tests: create with description / without (null) / >2000 -> 400; update set / clear (null + empty) / omit-keeps / >2000 -> 400.

- [ ] 🟥 **Step 2: MCP - param + type** `[sequential]` → depends on: Step 1
  - [ ] 🟥 2.1 `Task` interface gains `description: string | null`. `createTask`/`updateTask` bodies gain `description?: string | null`.
  - [ ] 🟥 2.2 `create_task` + `update_task` gain a `description` Zod param (string, optional; nullable on update for clearing) with describe text. Returns shape unchanged.
  - [ ] 🟥 2.3 Tests: description present in create/update body; update null clears.

- [ ] 🟥 **Step 3: Web UI - forms + detail render** `[sequential]` → depends on: Step 1 `[UI]`
  - [ ] 🟥 3.1 Frontend `Task` type gains `description: string | null`; `createTask`/`updateTask` accept it.
  - [ ] 🟥 3.2 `AddTaskForm`: optional multiline `<textarea>` (resets after submit). `EditTaskModal`: multiline `<textarea>` prefilled, diffed + sent on change (clear = null).
  - [ ] 🟥 3.3 Task detail page: render the description (`whitespace-pre-wrap`) as a block under the title, only when present. Optional: a subtle "has notes" indicator in the list/card.
  - [ ] 🟥 3.4 Fixtures: add `description` to Task literals; keep existing tests green; clean tsc + build.

- [ ] 🟥 **Step 4: Docs + CHANGELOG** `[sequential]` → depends on: Steps 1-3
  - [ ] 🟥 4.1 architecture.md: add `Description` to the Tasks data model + the POST/PATCH rows. product-design.md: tasks now have an optional description.
  - [ ] 🟥 4.2 CHANGELOG.md: v2.11.0 section. coverage.md: new counts + checklists.

- [ ] 🟥 **Step 5: Deploy + smoke test** `[sequential]` → depends on: Step 4
  - [ ] 🟥 5.1 Check phone reachable (dozes); capture live task count first. Stash frontend WIP, `./scripts/deploy-phone.sh`, restore (pop) after. CONFIRM the migration applied with zero data loss (count unchanged, existing rows report null description).
  - [ ] 🟥 5.2 Live curl: create with description (verify), create without (null), PATCH set / clear (null) / >2000 -> 400. Clean up.
  - [ ] 🟥 5.3 DEFERRED user spot-check (non-blocking): web UI add/edit description + detail page; in Claude, "add a note to task N".

## Outcomes

<!-- Fill in after execution: decision-relevant deltas only. What changed vs. planned? Key decisions made? Assumptions invalidated? -->
