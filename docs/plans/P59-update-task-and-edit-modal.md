# Feature Implementation Plan: Update task (title/deadline) + edit modal + quick deadline

**Overall Progress:** `0%`

**Tracking issue:** [#59](https://github.com/hydraInsurgent/Tasklog/issues/59)
**Branch:** `feature/update-task-and-edit-modal-#59`
**Target version:** v2.10.2 (Phase 2 of 5 per [proposal-mcp-and-ui-additions.md](proposal-mcp-and-ui-additions.md))

## TLDR

Give tasks a real edit path. Title and deadline currently have NO edit capability - they're set only at creation. Add a partial `PATCH /api/tasks/{id}` for title+deadline, an `update_task` MCP tool, a full-edit modal (title, deadline, project, labels) on the task three-dot menu, and a quick-deadline popover on the deadline pill.

## Goal State

**Current State:** After creation, you cannot change a task's title or deadline anywhere (UI or API/MCP) - only delete + recreate, which loses created_at and completion history. Project/labels/completion each have a sub-resource PATCH; title/deadline have none.

**Goal State:** Title and deadline are editable via a new root PATCH, surfaced through an MCP `update_task` tool, a full-edit modal, and quick deadline presets. Deadlines can be cleared.

## Critical Decisions

- **Decision 1: True partial PATCH with present-key detection (`JsonElement`).**
  - **Options considered:** (a) Full-field PATCH ("set title+deadline to exactly these"; MCP does read-modify-write). (b) True partial PATCH detecting which keys were sent.
  - **Chosen:** (b). Omit=keep, `null`=clear, value=set. More RESTful, and the MCP side needs no read-modify-write because `JSON.stringify` naturally omits `undefined` and keeps `null`.
  - **Trade-offs accepted:** Backend reads the body as `JsonElement` and checks `TryGetProperty` rather than binding to a typed record - slightly more manual, but unit-testable directly (construct a `JsonElement` from JSON), unlike query-string binding.
  - **Guidelines note:** First use of `JsonElement` partial-PATCH in the codebase. Worth recording in engineering-guidelines at /document time.

- **Decision 2: Full-edit modal, reusing existing endpoints for project + labels.**
  - The modal edits title, deadline, project, labels. Title+deadline → new root PATCH; project → existing `PATCH /project`; labels → existing `PATCH /labels`. Only changed fields fire. Avoids a mega-endpoint and reuses what works.

- **Decision 3: Deadline is clearable.** `deadline: null` clears it on both the API and the modal/popover ("None").

- **Decision 4: Preset semantics.** Today = today; Tomorrow = +1 day; This weekend = upcoming Saturday; Next week = upcoming Monday; None = clear.

- **Decision 5: Both popover and modal.** Popover on the deadline pill for one-tap reschedule; modal for full edit.

## API contract

```
PATCH /api/tasks/{id}
  Body (JSON, partial - only include fields to change):
    title     string   - non-empty; omitted = keep, present = set
    deadline  string?  - ISO date; omitted = keep, null = clear, value = set
  Semantics: present-key detection via JsonElement.
  400 on empty/whitespace title or unparseable deadline. 404 if task not found.
  Returns the updated task (with labels).

update_task (MCP tool):
  update_task({ id, title?, deadline? }) -> Task
  Sends only provided keys; deadline: null clears.
```

## Tasks

- [ ] 🟥 **Step 1: Backend - `PATCH /api/tasks/{id}` partial update** `[sequential]` → depends on: nothing
  - [ ] 🟥 1.1 Add `Update(int id, [FromBody] JsonElement body)` action to `TasksController`. Present-key detection: `title` (non-empty, trim, else 400), `deadline` (null = clear, value = parse via `TryGetDateTime` else 400). Load task with `.Include(Labels)`, 404 if missing, save, return updated task.
  - [ ] 🟥 1.2 Tests in `TasksControllerTests.cs`: title-only update, deadline-only update, clear deadline (null), set deadline, both fields, empty-title 400, malformed-date 400, unknown-id 404, omitted-fields-keep (construct `JsonElement` from JSON strings so the present-key logic is actually exercised).
  - [ ] 🟥 1.3 Smoke check via curl after deploy (Step 6) - clear a deadline, change a title, confirm 400s.

- [ ] 🟥 **Step 2: MCP - `update_task` tool** `[sequential]` → depends on: Step 1
  - [ ] 🟥 2.1 `api.updateTask(id, { title?, deadline? })` in `mcp/src/api-client.ts` - PATCH with `JSON.stringify(body)` (omits undefined, keeps null).
  - [ ] 🟥 2.2 `update_task` tool in `mcp/src/tools/tasks.ts`: Zod `id` (required), `title` (optional, min 1), `deadline` (optional, nullable - string or null). Description explains omit=keep / null=clear, with a "Returns:" hint.
  - [ ] 🟥 2.3 Tests in `mcp/src/api-client.test.ts` (or a focused helper): body serialization - title-only omits deadline, `deadline:null` survives, value sets, all-undefined → empty body.
  - [ ] 🟥 2.4 Update `tools/tasks.ts` header comment (7 → 8 tools).

- [ ] 🟥 **Step 3: Web UI - `EditTaskModal` (full edit)** `[sequential]` → depends on: Step 1 `[UI]`
  - [ ] 🟥 3.1 `api.updateTask(id, { title?, deadline? })` in `frontend/src/lib/api.ts`.
  - [ ] 🟥 3.2 `EditTaskModal.tsx` - controlled inputs for title, deadline (date input with clear), project dropdown, label multiselect. Reuse the dropdown/multiselect patterns from `AddTaskForm`. Pre-populate from the task. On Save, diff against original and fire only changed: title/deadline → `updateTask`, project → `assignTaskProject`, labels → `setTaskLabels`.
  - [ ] 🟥 3.3 Wire an "Edit" entry into the task three-dot menu in `TaskCard.tsx` (mobile) and the equivalent action in the desktop table (`TasksClient.tsx`). Opening sets the modal's task; Save closes + refreshes the list.
  - [ ] 🟥 3.4 Error + loading states; validation (empty title blocked client-side). Modal closes on Escape / backdrop click (match `FilterPanel`/`ColorPicker` patterns).

- [ ] 🟥 **Step 4: Web UI - `DeadlinePopover` (quick presets)** `[sequential]` → depends on: Steps 1, 3 (shares `api.updateTask`) `[UI]`
  - [ ] 🟥 4.1 `DeadlinePopover.tsx` - preset buttons: Today, Tomorrow, This weekend (upcoming Sat), Next week (upcoming Mon), None. Date math in a small pure helper (testable).
  - [ ] 🟥 4.2 Make the deadline pill on the task card clickable to open the popover; on select, `updateTask(id, { deadline })` (null for None), close, refresh.
  - [ ] 🟥 4.3 Unit-test the preset date helper (deterministic with an injected "now").

- [ ] 🟥 **Step 5: Docs + CHANGELOG** `[sequential]` → depends on: Steps 1-4
  - [ ] 🟥 5.1 architecture.md: add `PATCH /api/tasks/{id}` to the endpoints table; bump MCP tool count 15 → 16; note `EditTaskModal` + `DeadlinePopover` components.
  - [ ] 🟥 5.2 engineering-guidelines.md: record the `JsonElement` partial-PATCH pattern (first use).
  - [ ] 🟥 5.3 CHANGELOG.md: v2.10.2 section.
  - [ ] 🟥 5.4 coverage.md: new backend + MCP + frontend test counts.

- [ ] 🟥 **Step 6: Deploy + smoke test** `[sequential]` → depends on: Step 5
  - [ ] 🟥 6.1 `./scripts/deploy-phone.sh` (now with the fixed restart logic from #57).
  - [ ] 🟥 6.2 Live curl: PATCH a title, clear a deadline (null), set a deadline, confirm empty-title 400. Verify on the phone backend.
  - [ ] 🟥 6.3 USER ACTION: from Claude, "rename task N to X" and "change task N deadline to Friday" / "clear task N's deadline" → `update_task`. From the web UI: open a task's edit modal, change fields, save; click a deadline pill, pick a preset.

## Outcomes

<!-- Fill in after execution: decision-relevant deltas only. What changed vs. planned? Key decisions made? Assumptions invalidated? -->
