# Proposal: MCP tools + UI parity for v2.11+

**Status:** proposal - not an active plan, not yet sized into issues
**Date:** 2026-05-24
**Source:** observations from the first weeks of live MCP usage (post-P50 ship) + backlog "Someday/Maybe" items that naturally pair with MCP gaps

## TLDR

The MCP tool surface shipped in v2.10 covers the basics (CRUD on tasks / projects / labels) but is missing several capabilities I (as the LLM consuming the tools) need to be a useful assistant in practice. Several of those gaps **mirror gaps in the web UI itself** that are already sitting in the backlog Someday/Maybe section.

This proposal bundles both surfaces (MCP + UI) into one coherent set of additions so:
- The backend API only changes once per capability (both consumers get the new endpoint).
- The shape stays consistent between what the LLM can do and what the user can do directly.
- Sequencing decisions account for both surfaces, not just one.

Each section below would become its own GitHub issue + plan when sized for build. Read it as a menu, not a commitment.

---

## How to read this proposal

For each feature:
- **Why it's needed** - the actual user / LLM moment that surfaces the gap.
- **MCP surface** - new or modified tools, with signatures.
- **UI surface** - new or modified UI behaviour, if applicable.
- **Backend / data** - what changes in the .NET API or SQLite schema.
- **Effort estimate** - rough relative sizing (XS / S / M / L).
- **Backlog reference** - if this maps to an existing Someday/Maybe item.

At the end there's a **Sequencing recommendation** that picks the highest-leverage subset.

---

## Feature 1: Search + filter tasks (server-side)

**Why it's needed**

When you ask Claude "what's due this week?" or "what's in the Work project?", the only way I can answer today is `list_tasks` (returns everything) then filter the JSON in my head. That works for ~20 tasks; at 100+ it eats my context window and accuracy degrades. The web UI already has the filter panel (project + label + deadline range) - the MCP simply doesn't expose any of it.

**MCP surface**

New tool:
```
search_tasks({
  projectId?: number,
  inbox?: boolean,           // shorthand for projectId == null
  labelIds?: number[],       // OR semantics, matches web UI
  due_before?: ISO date,
  due_after?: ISO date,
  completed?: boolean,
  text?: string              // simple substring match on title
}) -> Task[]
```

All params optional. With no params, equivalent to `list_tasks`. (Could replace `list_tasks` outright but keep the alias for one release to be polite to existing connectors.)

**UI surface**

Filter panel already exists (v2.4). No UI change required - it'd just be a parity story. **Optional UI add:** a text-search box on the filter panel (currently filtering is dimension-based only; no full-text). Cheap if backend grows the `text` param.

**Backend / data**

Extend `GET /api/tasks` with query params (`?projectId=`, `?inbox=true`, `?labelIds=1,2,3`, `?due_before=`, `?due_after=`, `?completed=`, `?text=`). Each filter applied independently (AND across dimensions; OR within labelIds, matching the UI's current behaviour). No DB schema changes - all of these can be computed on the existing columns.

**Effort:** M (backend filter logic + MCP tool + optional UI text-search box)
**Backlog ref:** new; partly covered by existing filter panel

---

## Feature 2: Update task (title + deadline)

**Why it's needed**

- **MCP**: there's currently NO way to change a task's title or deadline. `complete_task`, `assign_task_to_project`, `set_task_labels` exist, but if you say "change task 42 title to 'review PR' and move the deadline to Friday", my only path is `delete_task` + `create_task` - which destroys created_at, completion history, and any cross-references the task has.
- **UI**: editing a task requires navigating away from the list view to `/tasks/[id]`. Friction enough that most users probably re-create instead of edit. Already noted in backlog Someday/Maybe.

**MCP surface**

```
update_task(id, {
  title?: string,
  deadline?: ISO date | null
}) -> Task
```

Returns the updated task.

**UI surface**

Inline edit modal triggered from the three-dot menu on each task card (or from the task title click on desktop). Modal contains title field, deadline picker, project dropdown, labels selector. Save closes the modal and refreshes the row. No page navigation.

**Backend / data**

`PATCH /api/tasks/{id}` accepting a partial body. The endpoint already exists for `/complete`, `/project`, `/labels` sub-resources; this is the root `/api/tasks/{id}` PATCH for the entity itself. No schema change.

**Effort:** M (backend PATCH + MCP tool + new UI modal component)
**Backlog ref:** "Task edit modal" in Someday/Maybe (UI), gap identified from MCP usage

---

## Feature 3: Bulk operations

**Why it's needed**

- **MCP**: reorganizing 20 inbox tasks into a project takes 20 separate `assign_task_to_project` calls. Each is a round-trip + my reasoning between them. Probably 30+ seconds for what should be one second.
- **UI**: same shape - to complete or delete multiple tasks you check / click / confirm 20 times.

**MCP surface**

Three new tools (or one with an operation param, less LLM-friendly):
```
bulk_complete(taskIds: number[]) -> Task[]
bulk_assign_to_project(taskIds: number[], projectId: number | null) -> Task[]
bulk_delete(taskIds: number[]) -> { deleted: number[] }
```

**UI surface**

Multi-select via checkbox column on the task list. A bulk-actions bar appears at the top (or bottom) when one or more rows are selected: "Complete N", "Move to project ▾", "Delete N". Hides when selection is cleared. Mobile gets the same via long-press to enter select mode.

**Backend / data**

Single new endpoint `POST /api/tasks/bulk` accepting `{ operation: 'complete'|'assignProject'|'delete', taskIds: number[], data?: { projectId?: number } }`. One transaction. Returns the affected tasks (or for delete, the ids).

**Effort:** M (backend bulk endpoint + 3 MCP tools + multi-select UI state)
**Backlog ref:** new on both sides

---

## Feature 4: Quick deadline edit / postpone

**Why it's needed**

Most-frequent task modification by far. Today the only path is "open task detail → edit deadline → save" (3+ clicks). Already in backlog Someday/Maybe.

**MCP surface**

Covered by `update_task` above (Feature 2). No new tool.

**UI surface**

Calendar popover on the task card's deadline pill - click the deadline to open a small calendar + quick presets: "Today", "Tomorrow", "This weekend", "Next week", "No deadline". Saves on click, closes popover.

**Backend / data**

Reuses `PATCH /api/tasks/{id}` from Feature 2.

**Effort:** S (UI-only after Feature 2 lands)
**Backlog ref:** "Editable deadline / postpone" in Someday/Maybe

---

## Feature 5: Task priority

**Why it's needed**

Combined with `search_tasks` (Feature 1), "what's P1 and due this week?" becomes a one-call query and a genuinely useful question. Already in backlog Someday/Maybe. Most subscribers to subscription todo apps cite priority as a feature they actually use.

**MCP + UI**

- Add `priority` field to tasks: integer 1-3 (1=high, 3=low) or null. Null = unprioritized (default).
- MCP: include in `create_task` params, `update_task` params, and `search_tasks` filter. Surface in the returned task object.
- UI: small colored badge or icon next to the task title (red dot for P1, amber for P2, no dot for P3/null). Priority picker in the add-task form and the new edit modal. Priority filter row on the filter panel.

**Backend / data**

DB migration: add `Priority` integer column (nullable) to `Tasks`. Backend: include in POST/PATCH; surface in GET. Default null on existing rows.

**Effort:** M (migration + 4 endpoint updates + 2 MCP tool updates + UI badge + picker + filter)
**Backlog ref:** "Task priority" in Someday/Maybe

---

## Feature 6: First-class inbox query

**Why it's needed**

"What's in my inbox?" is one of the most common natural questions. Currently the MCP has no concept of inbox - I'd have to `list_tasks` then filter for `projectId === null`.

**MCP surface**

Subsumed by `search_tasks({ inbox: true })` from Feature 1. No separate tool.

**UI surface**

Already first-class (sidebar Inbox view).

**Backend / data**

The `?inbox=true` query param on `GET /api/tasks` (from Feature 1) handles it.

**Effort:** XS (free if Feature 1 lands)
**Backlog ref:** new

---

## Feature 7: Lookup-by-name shortcuts

**Why it's needed**

When you say "add a task to the Work project", I currently need:
1. `list_projects` (get all)
2. Scan the array for `name === "Work"` (or fuzzy-match)
3. `create_task` with that id

Two round trips + string-matching logic. A name-aware path compresses to one call.

**MCP surface**

Option A (preferred - simpler):
```
create_task({
  title: string,
  deadline?: ISO date,
  projectId?: number,
  projectName?: string,    // resolved server-side
  labelNames?: string[]    // resolved or created server-side (?)
}) -> Task
```

Option B (alternative): separate `get_project_by_name(name)` and `get_label_by_name(name)` tools. More tools, but less coupling.

Recommend A. If projectName is provided and projectId isn't, server resolves (case-insensitive). If both, projectId wins. If projectName doesn't match, error.

**UI surface**

N/A - the UI already shows projects and labels by name in the sidebar / picker.

**Backend / data**

Backend: `POST /api/tasks` accepts optional `projectName` and resolves before insert. No schema change.

**Effort:** S
**Backlog ref:** new

---

## Feature 8: Tool description shape hints

**Why it's needed**

Some LLM clients (and future planning agents) reason about tool output shape before calling. Today the MCP tool descriptions tell the LLM when to call but not what comes back. Easy one-pass fix.

**MCP surface**

For each of the 16 tools, append a one-line "Returns:" sentence to the description. Examples:
- `list_tasks` - "Returns array of tasks: id, title, deadline (ISO date or null), isCompleted, completedAt, projectId, project, labels[]."
- `create_task` - "Returns the created task with assigned id."
- `delete_project` - "Returns { id, deleted: true }. Note: cascade-deletes all tasks in the project."

No code changes - just description string updates in `mcp/src/tools/*.ts`.

**Effort:** XS (one-hour docs pass)
**Backlog ref:** new

---

## Feature 9: Computed `dueStatus` field

**Why it's needed**

Tasks have a `deadline` field but I have to compute "overdue" / "due today" / "due this week" / "later" / "no deadline" client-side every time. The web UI does the same computation (deadline color coding). Centralizing it server-side means consistent semantics and one less thing for me to get wrong.

**MCP + UI**

Backend computes `dueStatus` per task on every read. Returns alongside `deadline`. Possible values: `"overdue"`, `"today"`, `"this_week"`, `"later"`, `"none"`.

MCP responses include the new field. UI can swap its inline color-class calculation for the server-provided value (or keep both - this is forward-compat).

**Backend / data**

Compute in the API layer (not the DB) so it's always relative to "now". No schema change. Adds ~16 bytes per task in the response.

**Effort:** S (one backend computation + threading it through serializer)
**Backlog ref:** new

---

## Feature 10: complete / uncomplete consolidation

**Why it's needed**

Cosmetic. Surface area minus one. Cleaner mental model: completion is a toggle, not two separate operations.

**MCP surface**

Replace `complete_task(id)` + `uncomplete_task(id)` with:
```
set_task_completion(id, isCompleted: boolean) -> Task
```

Keep the old tools for one release with a deprecation note in their descriptions.

**Effort:** XS
**Backlog ref:** new

---

## Sequencing recommendation

If you ship the **highest-leverage subset** as a single v2.11:

1. **Feature 1: search_tasks** - biggest single MCP UX win; modest UI bonus (text search)
2. **Feature 2: update_task + edit modal** - closes the biggest gap on both surfaces
3. **Feature 9: dueStatus field** - cheap, sharpens every list response

That's roughly a weekend of focused work. v2.11 ships.

If you want a **fuller product arc** over v2.11-2.13:

- **v2.11:** Features 1, 2, 9 (above)
- **v2.12:** Features 3 (bulk), 4 (deadline popover), 6 (inbox query - free with 1)
- **v2.13:** Feature 5 (priority) - this is a real product addition, deserves its own release with a thoughtful UI

Cosmetic / parking lot:
- Feature 7 (lookup by name) - nice but trivial workaround
- Feature 8 (tool descriptions) - one-hour docs pass any time
- Feature 10 (toggle consolidation) - aesthetic; do it during v2.11 if touching tools anyway

## Open questions for review

- **Bundle or split?** Three releases vs. one bigger one. One bigger ships sooner but is a more daunting plan.
- **Priority field shape:** 1-3 integer or High/Med/Low enum? Integer is cleaner in JSON, enum is more readable for the LLM ("priority: high" vs "priority: 1"). Lean toward integer for the API, with MCP tool descriptions translating to/from the friendly names.
- **Bulk endpoint API shape:** one polymorphic endpoint (`POST /api/tasks/bulk` with operation param) vs. three specific endpoints (`POST /api/tasks/bulk-complete`, `/bulk-assign`, `/bulk-delete`). Polymorphic is fewer routes; specific is easier to reason about and document. Recommend specific.
- **Anything to cut entirely?** Feature 10 (consolidation) is genuinely optional - keep if you care about tool-count parsimony, drop if you don't.
- **Anything missing?** The UI Someday/Maybe list has other items (project color codes, theme selection, rich task detail with description + subtasks + comments) that don't pair with MCP gaps. Worth considering for the same release window? Or save for a separate "UI polish" release?

## Not covered in this proposal

These came up in conversation but aren't bundled here because they're either separate concerns or already shipped:

- **Public-demo MCP on GCP** - tracked as #56, depends on rate limiting (#52).
- **Auth hardening / DCR caps / observability** - tracked as #51-#55 from the P50 code review.
- **Rich task detail** (description, subtasks, comments) - separate product direction. Worth its own proposal if the user wants to go that way.
- **Theme / dark mode** - UI-only, separate concern from MCP parity.
