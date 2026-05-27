# Proposal: next six versions (v2.10.6 -> v2.13.1)

**Status:** MOSTLY SHIPPED / partly superseded. v2.10.6, v2.10.7, v2.11.0, v2.12.0 all shipped. The recurring rows (v2.13.0/.1) were re-scoped on 2026-05-27 into a multi-version program - see [proposal-recurring-and-habits.md](proposal-recurring-and-habits.md). This doc is kept for history.
**Date:** 2026-05-27
**Source:** gaps surfaced during live MCP testing after the v2.10.1-v2.10.5 roadmap shipped (LLM-as-consumer feedback) + the closest backlog Someday/Maybe items. Supersedes the forward-looking parts of `proposal-mcp-and-ui-additions.md` (whose Features 1/2/3/5/8/9/10 have now shipped).

## TLDR

The v2.10.x roadmap delivered the core MCP + UI parity. Living with it surfaced a tight set of follow-on gaps - the headline one (`createdAt` filtering) failed the very first "what did I add today" query. This proposal sequences those gaps into **six versions**. Each becomes its own `/start-feature` + plan when built, exactly like the last run.

**Versioning is a deliberate mix** (decided 2026-05-27): `minor` bump when a version changes the DB schema OR gives a person a new thing they can do; `patch` when it extends/completes/exposes an existing capability with no migration. This matches how v2.10.1/.3 were patched (additive MCP surface) while v2.10.5 (priority + migration) was a real feature.

| Ver | Theme | Bump | Migration | Depends on |
|---|---|---|---|---|
| **v2.10.6** | `list_tasks` query completeness | patch | no | - |
| **v2.10.7** | Agent ergonomics | patch | no | - |
| **v2.11.0** | Task description field | minor | yes | - |
| **v2.12.0** | Deadline time-of-day | minor | no | - (precedes v2.13.0) |
| ~~v2.13.0/.1~~ Recurring | **EXPANDED** | - | - | see below |

v2.10.6, v2.10.7, v2.11.0, v2.12.0 are **shipped**. The recurring rows were re-scoped on 2026-05-27: the user chose full Todoist-level recurrence + habit-tracking, which is a multi-version program now tracked in [proposal-recurring-and-habits.md](proposal-recurring-and-habits.md) (v2.13.0 -> v2.17.0). The original v2.13.0/.1 sketches below are superseded by that doc.

## How to read this

Each version below is a coherent, independently shippable, live-testable unit (the same discipline as the last roadmap: build -> unit-test -> review -> deploy -> live curl smoke -> ship). Order is mostly free except where "Depends on" says otherwise. Read it as a menu with a recommended order, not a fixed commitment.

---

## v2.10.6 - `list_tasks` query completeness `[patch]`

**Why:** `createdAt` is returned on every task but cannot be filtered, so "what did I add today" forces pulling everything and eyeballing dates - it failed in practice on the first session. `list_tasks` also returns everything in an arbitrary-ish order with no cap, which is fine at ~20 tasks and wasteful at a few hundred (it eats LLM context). These are all extensions of the existing `list_tasks` / `TaskFilterQuery` surface, so they share one test pass.

**Scope:**
- Backend: add `CreatedAfter` / `CreatedBefore` to `TaskFilterQuery` + `GetAll` (same `query.Where` pattern as the existing `DueBefore` / `DueAfter`). Add a `sort` param (by `created` / `deadline` / `priority`, `asc` / `desc`; default keeps today's newest-first). Add a `limit` (most-recent N; simple count cap, not cursor pagination - that is overkill for a single-user app).
- MCP: surface `createdAfter` / `createdBefore`, `sort`, `limit` on `list_tasks`; serialize the date params like the other ISO filters; update the tool description.
- UI: none required (the web UI filters client-side; these are MCP-facing). Optionally a "sort by" control later.

**Decision - range, not a bucket:** do `createdAfter` / `createdBefore` rather than an "added today / this_week" bucket mirroring `dueStatus`. The range is more flexible AND sidesteps re-introducing the timezone trap - a server-computed "added today" bucket would inherit the same UTC-vs-local issue `dueStatus` had (now handled via `TZ`), whereas an explicit range the caller passes is timezone-neutral. Note `CreatedAt` is stored via `DateTime.Now` (IST after the TZ fix), so range filtering on it is internally consistent.

**Effort:** S (XS + XS + S). No migration.
**Source:** AI feedback P1 (createdAt) + P2 (limit) + P3 (sort).

---

## v2.10.7 - Agent ergonomics `[patch]`

**Why:** Two cheap wins that remove round-trips for the LLM. `bulk_set_priority` closes an asymmetry - bulk complete / move / set-deadline exist, but not priority (it was scoped out of v2.10.4 because priority did not exist yet). Name-based resolution lets the agent act on "Work" or a label name directly instead of a `list_projects` / `list_labels` lookup first.

**Scope:**
- Backend: add a `"setPriority"` case to the existing `POST /api/tasks/bulk` switch (data: `{ priority: 1-4 }`, validated like the single-task path). Optionally accept a project/label *name* on the relevant endpoints, resolving server-side.
- MCP: new `bulk_set_priority(taskIds, priority)` tool (sibling of the other three). For name resolution, let `assign_task_to_project` / `bulk_assign_to_project` / `set_task_labels` accept a name as an alternative to an id.
- UI: add a "Set priority" action to the bulk-actions bar (the bar already has Complete / Reopen / Move / Set deadline - this is a 5th button reusing the priority picker).

**Decision - ambiguity rule:** name resolution must be deterministic. If a name matches zero or more than one project/label, return a clear 400 ("ambiguous name 'X' - use an id") rather than guessing. Ids always remain accepted.

**Effort:** S (XS bulk_set_priority + S name resolution). No migration.
**Source:** AI feedback P2 (bulk_set_priority) + P3 (name resolution).

---

## v2.11.0 - Task description field `[minor]`

**Why:** Tasks are title-only, so titles are doing double duty as metadata storage (a real task already has a full Medium URL crammed into its title). A `description` gives somewhere to put context and stops title-stuffing. This is the smallest, highest-value slice of the existing "Rich task detail" Someday idea (description first; subtasks + comments stay parked).

**Scope:**
- Backend: migration adds a nullable `Description TEXT` column (no default needed - null = no description, so no zero-value trap like priority had). Create + Update (PATCH, present-key) accept it; surfaced in responses.
- MCP: `description` param on `create_task` + `update_task`; included in the returned task shape + descriptions.
- UI: description field in `AddTaskForm` (optional, multiline) + `EditTaskModal`; render it on the task detail page; optionally a truncated preview / indicator in the list.

**Effort:** M. **Migration: yes** (nullable column - additive, safe; existing rows get null).
**Source:** AI feedback P1 (description) + Someday "Rich task detail" (slice 1).

---

## v2.12.0 - Deadline time-of-day `[minor]`

**Why:** Deadlines are stored date-only (`T00:00:00`), so "due at 3pm" is not representable. The AI feedback flagged this as a design fork worth a conscious decision rather than an accident. It is sequenced before recurring because a recurring "daily 3pm study slot" wants a time - doing this first means recurrence inherits it.

**Scope:**
- Decision first: deadlines gain an *optional* time (date-only stays valid). Likely no migration - `Deadline` is already a `DateTime`; the change is to stop forcing midnight and to carry the time through.
- Backend: accept a time component on create/update; **rework `dueStatus`** - the current date-only comparison must decide how a timed deadline buckets (e.g. compare the date for the bucket, but "overdue" should account for a past time today). This is the ripple to get right.
- MCP: accept an optional time on the deadline param; document the date-or-datetime shape.
- UI: a time input alongside the date picker (optional); show the time on the deadline pill when present.

**Effort:** M. Migration: probably none (re-uses the `DateTime` column), but confirm. **Closest semver call** - patch-able since no migration, but it is a genuine new capability + reworks `dueStatus`, so: minor.
**Source:** AI feedback nice-to-have (time-of-day) - promoted because it gates recurring.

---

## v2.13.0 - Recurring tasks - core `[minor]`

**Why:** The largest gap and a genuine product capability. There is already a one-off "set a fixed daily slot and start a study session" task sitting in the list - that is a habit, not a task. Recurrence serves it.

**Scope (core, no UI yet):**
- Decide the recurrence model - start simple: daily / weekly / every-N-days (an RRULE-lite), not a full iCal RRULE engine.
- Migration: a recurrence definition on the task (or a small `Recurrence` table) - schema change.
- Behavior: completing a recurring task **spawns the next instance** (the key decision - generate-on-complete vs materialize-ahead; recommend generate-on-complete for simplicity).
- Backend + MCP: create/update accept a recurrence; `list_tasks` and the task shape expose it. No UI in this version.

**Effort:** L. **Migration: yes.**
**Depends on:** v2.12.0 (recurrence benefits from time-of-day).
**Source:** AI feedback nice-to-have (recurring) + the live "study slot" task.

---

## v2.13.1 - Recurring tasks - UX `[patch]`

**Why:** Surfaces the capability v2.13.0 introduced. Patch (not minor) because it adds no new capability or schema - it is the UI for a feature that already exists via the API/MCP.

**Scope:**
- UI: a recurrence picker in the add / edit forms; a recurring badge on the task; the edit-the-series-vs-this-instance choice (the one genuinely fiddly UX decision).
- No backend or schema change.

**Effort:** L (UI-heavy). No migration.
**Source:** completes v2.13.0.

---

## Explicitly NOT in this roadmap

- **Bulk delete** - deliberately omitted, as in the last run. Bulk-destructive + an LLM driver is exactly where a misread instruction does real damage. The AI feedback independently agreed.
- **Subtasks + comments** - the other two slices of "Rich task detail." Parked in Someday until description proves out the detail page as their home.
- **Cross-device live sync, project color codes, theme selection / dark mode, project-level labels, relative completed-time display** - real Someday items, but they do not pair with the MCP gaps this proposal is built around. Candidates for a separate "UI polish" release.

## Open questions for review

- **v4 (time-of-day) semver:** kept as `minor` (v2.12.0) on the "new capability" rule. If you would rather treat "no migration" as the hard line for patch, it becomes v2.10.8 and everything after shifts down one.
- **Recurrence model depth:** daily/weekly/every-N (recommended) vs a fuller RRULE. Start simple, extend later if needed.
- **Recurrence generation:** generate-on-complete (recommended, simplest) vs materialize-ahead (shows upcoming instances but needs cleanup logic).
- **Name resolution scope:** projects + labels only, or also resolve a project name on `create_task`?
