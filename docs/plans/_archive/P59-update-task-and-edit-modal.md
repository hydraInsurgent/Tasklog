# Feature Implementation Plan: Update task (title/deadline) + edit modal + quick deadline

**Overall Progress:** `100%` (engineering complete; Step 6.3 is a deferred post-ship user acceptance spot-check)

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

- [x] 🟩 **Step 1: Backend - `PATCH /api/tasks/{id}` partial update** `[sequential]` → depends on: nothing
  - [x] 🟩 1.1 `Update(int id, [FromBody] JsonElement body)` added. Present-key detection for title (non-empty, trimmed, else 400) and deadline (null=clear, ISO string via TryGetDateTime=set, else 400). 404 if missing; returns updated task with labels.
  - [x] 🟩 1.2 9 tests covering title-only, deadline set/clear, both, empty body (no-op), empty-title 400, malformed-date 400, unknown-id 404, trim. JsonElement built from JSON strings (Clone()) so present-key logic is exercised. 63 backend tests pass.
  - [x] 🟩 1.3 Live curl smoke after deploy - done in Step 6.2 (title/deadline set+clear, empty-title 400, bad-date 400, unknown-id 404 all verified against the deployed phone backend).

- [x] 🟩 **Step 2: MCP - `update_task` tool** `[sequential]` → depends on: Step 1
  - [x] 🟩 2.1 `api.updateTask(id, { title?, deadline? })` added.
  - [x] 🟩 2.2 `update_task` tool added (id required; title optional min-1; deadline optional nullable). Description covers omit=keep / null=clear + Returns hint.
  - [x] 🟩 2.3 5 contract tests in api-client.test.ts (JSON.stringify keep/clear/set). 65 MCP tests pass.
  - [x] 🟩 2.4 Header comment updated (8 tools).

- [x] 🟩 **Step 3: Web UI - `EditTaskModal` (full edit)** `[sequential]` → depends on: Step 1 `[UI]`
  - [x] 🟩 3.1 `api.updateTask` added to frontend api.ts.
  - [x] 🟩 3.2 `EditTaskModal.tsx` - title, deadline (clearable), project select, label toggle-chips. Diff-and-fire-changed on save (title/deadline → updateTask, project → assignTaskProject, labels → setTaskLabels), then getTask for the canonical result. **Deviation:** labels are toggle-chips (FilterPanel pattern) not AddTaskForm's autocomplete-with-create - cleaner for "adjust which labels apply"; creating new labels mid-edit stays on the add form / labels page.
  - [x] 🟩 3.3 Edit wired into TaskCard three-dot menu (mobile) + a Pencil action in the desktop table actions cell.
  - [x] 🟩 3.4 Error + loading states, empty-title blocked, Escape + backdrop close. Polling pauses while the modal is open.

- [x] 🟩 **Step 4: Web UI - `DeadlinePopover` (quick presets)** `[sequential]` → depends on: Steps 1, 3 `[UI]`
  - [x] 🟩 4.1 `DeadlinePopover.tsx` + `lib/deadlinePresets.ts` (pure `resolvePreset`). Presets: Today, Tomorrow, This weekend (upcoming Sat), Next week (upcoming Mon), None.
  - [x] 🟩 4.2 Deadline pill clickable in both the desktop table and the mobile card → popover → `handleDeadlineQuickSet` → `updateTask({deadline})` + local state update.
  - [x] 🟩 4.3 10 tests for `resolvePreset` (injected `now`, weekday/Sat/Sun/Mon, month rollover). 47 frontend tests pass. Production `next build` clean.

- [x] 🟩 **Step 5: Docs + CHANGELOG** `[sequential]` → depends on: Steps 1-4
  - [x] 🟩 5.1 architecture.md: added `PATCH /api/tasks/{id}` to the endpoints table; bumped MCP tool count 15 → 16 (prose + repo-tree comment, tasks: 7 → 8).
  - [x] 🟩 5.2 engineering-guidelines.md: recorded the `JsonElement` partial-PATCH pattern under "additions from v2.10.2".
  - [x] 🟩 5.3 CHANGELOG.md: v2.10.2 section added (PATCH endpoint, update_task tool, EditTaskModal, DeadlinePopover).
  - [x] 🟩 5.4 coverage.md: updated counts (63 backend / 65 MCP / 47 frontend) + per-test checklists for Update, update_task contract, and resolvePreset; refreshed frontend coverage table with real numbers.

- [x] 🟩 **Step 6: Deploy + smoke test** `[sequential]` → depends on: Step 5
  - [x] 🟩 6.1 `./scripts/deploy-phone.sh` ran clean (exit 0). All four services restarted with fresh code (216s uptime); built-in smoke passed (api 200, filter-400 check 400, frontend 200, mcp well-known 200).
  - [x] 🟩 6.2 Live curl against the phone backend (192.168.1.51:5115) on a throwaway task, then deleted it: title-only PATCH (deadline kept), set deadline (title kept), `deadline:null` clear, whitespace-title 400, malformed-deadline 400, unknown-id 404, delete 204. Present-key semantics confirmed at the real HTTP-binding layer.
  - [x] 🟩 6.3 DEFERRED to post-ship user spot-check (user decision 2026-05-27, autonomous run). The functional layer is fully verified without the connector/browser: live curl against the deployed backend (6.2), 63/65/47 unit tests, clean production build, and a clean deploy. What remains is acceptance-only - does claude.ai surface + pick `update_task`, and does the modal/popover feel right in the browser. Does not block ship. To check from Claude: "rename task N to X", "change/clear task N deadline". From the web UI: edit modal + deadline pill preset.

## Outcomes

Built as planned; no design assumptions invalidated.

- **All five decisions held.** True partial PATCH via `JsonElement` present-key detection, full-edit modal reusing the existing project/labels sub-resource PATCHes, clearable deadline, the four preset semantics, and both popover + modal. The live curl battery confirmed omit=keep / null=clear / value=set end to end against the deployed backend.
- **Deviation (Step 3.2): modal labels are toggle-chips, not autocomplete-with-create.** The `AddTaskForm` label control creates labels inline; for "adjust which labels apply to an existing task" the `FilterPanel` toggle-chip pattern is cleaner. Creating brand-new labels mid-edit stays on the add form / labels page. Recorded in the plan step.
- **EditTaskModal save = diff-and-fan-out, then `getTask` for the canonical result.** Only changed fields fire (title/deadline → `updateTask`, project → `assignTaskProject`, labels → `setTaskLabels`); a final `getTask` avoids the `assign-project` response's missing-labels quirk and gives the parent one authoritative object to swap into state.
- **First use of the `JsonElement` partial-PATCH pattern in the backend.** Recorded in `engineering-guidelines.md` (additions from v2.10.2). Unlike the query-string array binding that hid bugs in #57, present-key logic is directly unit-testable (build a `JsonElement` from a JSON string), so it carries no HTTP-binding blind spot - but it was still smoke-tested live to be sure.
- **Tests:** +9 backend (Update), +5 MCP (update_task PATCH body contract), +10 frontend (resolvePreset). Totals: 63 backend / 65 MCP / 47 frontend, all green.
- **Pending:** only the hands-on connector + web UI checks (Step 6.3), then commit Step 6, `/review`, `/document`, `/ship` as v2.10.2.
