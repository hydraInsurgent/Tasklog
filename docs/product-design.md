# Tasklog Product Design

This document describes what Tasklog is today and the principles behind it.
It is a reference point, not a constraint. If a proposed feature or direction
differs from what is written here, that is a signal to have a conversation
and update this document - not to automatically reject the idea.

---

## What Tasklog is

Tasklog is a personal, self-hosted task management tool.

It exists to replace subscription-based task apps for a single user who wants
full ownership of their data and a system they can understand end to end.

The current focus is simplicity and personal usability. The system is designed
to be useful to one person, run on their own machine, and stay small enough
to reason about completely.

---

## The user

A single user accessing the app from multiple devices.

Two access paths exist as of v2.10:

- **Direct web UI** on the same local network (phone, desktop): no authentication, browse to `http://<phone-ip>:3000`. Web UI and API stay LAN-bound; if you are not on the home network, you cannot reach them.
- **claude.ai connector** from anywhere on the internet: gated by OAuth 2.1 with a GitHub upstream allow-list of exactly one username. Authentication is at the MCP server, not the underlying API.

This shapes decisions like data storage (local SQLite on the phone, never replicated to a cloud) and the public surface area (one tightly-scoped MCP endpoint, not the full web UI). If the user profile changes - sharing with a partner, opening the web UI publicly - the allow-list, auth scheme, and CORS policy would all need to be revisited.

---

## Product principles

These guide feature decisions. They are not laws - but deviating from them
is worth being deliberate about.

**Add only what solves a real problem.**
Features come from actual usage needs, not speculation. A missing feature
is often better than one that adds complexity without clear value.

**Minimal by default.**
Each screen and interaction should do one thing clearly.
If something can be left out without losing usefulness, that is a good sign it should be.

**Owned and understandable.**
The user should be able to understand what the app does and where their data lives.
Dependencies that obscure this are worth questioning.

**Persistent and reliable.**
Data should not be lost unexpectedly. The app should behave the same way every time it runs.

---

## Current scope

This is what Tasklog does today. Items listed here are not permanent limits -
they reflect where the product is right now and what assumptions the code makes.

**Single user** - no multi-user accounts, roles, or sharing. The allow-list of one GitHub username is enforced at the MCP authorization server.
If multi-user or sharing becomes a real need, authentication on the web UI (currently absent) and data isolation in the DB would need to be added before anything else.

**Web UI is local-network only** - no cloud hosting of the UI, no public web access. Exposing the web UI publicly would require adding authentication to the .NET API and re-thinking the CORS policy.

**MCP endpoint is public** (as of v2.10) - `https://mcp-tasklog.manudubey.in` exposes Tasklog as a Model Context Protocol server for the claude.ai custom connector. The MCP endpoint is the ONLY public surface; it gates access via OAuth 2.1 + GitHub upstream + a one-name allow-list. The .NET API remains LAN-only and unauthenticated.

**No notifications** - deadlines are informational. The app shows them; it does not act on them.
A reminder or alert system would be a meaningful scope addition.

**No calendar integration** - deadlines exist on tasks but do not sync to external calendars.

**Single data file** - all task data lives in one SQLite file. A second small SQLite file (`mcp/data/auth.db`) holds OAuth state for the MCP server; this is operational state, not user data, and is safe to wipe at any time to force re-consent.

---

## How features currently work

**Tasks**
- A task has a title (required) and an optional deadline.
- A task can have an optional free-text description (v2.11.0) - notes, context, a link - editable on the add/edit forms and shown on the task detail page. Keeps the title clean instead of stuffing metadata into it.
- A task can have timestamped comments (v2.13.0) - add/delete them on the task detail page or add via Claude. The first step toward richer task detail. (Habit check-ins, v2.16.0, ended up in their own per-day table rather than as comments.)
- A task can repeat (v2.14.0) - set a recurrence (daily, every N days, weekly on chosen weekdays, or monthly on a day-of-month) on the add/edit forms or via Claude. A recurring task needs a deadline to repeat from. Completing it keeps the finished one as history and immediately creates the next occurrence with its deadline advanced, logging a completion comment on the one just done.
- Recurrence also supports the richer Todoist-style patterns (v2.14.1): "the 3rd Thursday" / "the last Friday" of the month, "the last day" / a day counted from month-end, "every other week / every 2 months" (intervals), and an end condition - repeat until a date or for a set number of times, after which the series stops.
- Natural-language quick-add (v2.15.0): the add-task title field parses one line of natural language - a due date ("friday", "tomorrow at 4pm", "jan 27"), a repeat ("every weekday", "every 3rd thursday"), `#project`, `@label`, and `p1`-`p4` - highlighting each token inline, listing them as removable chips, autosuggesting `#`/`@`, and filling the structured controls to match. A bare multi-weekday list ("friday and saturday") means those specific days once each (a weekly repeat with an end date), not an endless repeat. This is web-only (Claude already parses such phrases over the MCP).
- A task can be tracked as a daily habit (v2.16.0) - tick "Track as a daily habit" on the add/edit forms (or set `isHabit` via Claude). A habit is **never completed/closed** - its action is a daily **check-in** (#73): in the task list a habit row shows a flame + a check-in toggle (not the complete checkbox), and a right-side Habits panel + the `/habits` page let you check in and see the streak, last-7-days dots, and schedule. Checking in is one tap and idempotent; Claude checks in with `log_habit_checkin`. A habit's **schedule** is one of two modes (#75): **specific days** via a recurrence rule (e.g. "every Tue & Thu") - the streak counts only scheduled days, so skipping a non-scheduled day doesn't break it; or **x times a week** - a weekly target ("gym 3x a week"), checkable any day, where the card shows "n/x this week", a week-based streak, and a green/yellow/grey strip of recent weeks (target met / showed up / missed). A habit's schedule needs **no deadline** - the Due chip is hidden for habits (a deadline only matters for finish-once recurring *tasks*, which a habit is not). A habit is decoupled from recurring tasks (which are finish-once-and-respawn). Deferred: a combined "x times among chosen days" mode, an "x times a month" period, and a calendar heatmap.
- Tasks can be viewed as a **list** or a **board** (#73). The board groups tasks into horizontally-scrollable columns by due bucket / project / priority (a group-by control); each view remembers its own list/board + group-by choice. The "view mode" (how tasks are shown) is a separate axis from scope/filter (which tasks) - so calendar/today views can slot in later.
- Adding and editing a task uses one **chip-driven sheet** (#73): a quick-add title field plus chips for due date / priority / project / label / recurrence. Replaces the old inline add form + edit modal.
- Title and deadline are editable after creation (v2.10.2): an Edit action on each task opens a modal for title, deadline, project, and labels, and the deadline pill has a quick-set popover with presets (Today, Tomorrow, This weekend, Next week, None). The deadline can be cleared. Editing preserves the task's created date and completion history (unlike delete-and-recreate).
- A task exists until it is deleted.
- Tasks can be marked complete via a checkbox. Completed tasks hide from the default view with a brief animation.
- A "Show completed" toggle reveals all completed tasks. Completion can be undone.
- CompletedAt timestamp is recorded when a task is marked done and cleared if un-completed.
- Deadlines are visible to the user but the app does not enforce or act on them.
- A deadline can optionally include a time of day (v2.12.0) - "due Friday at 3pm". A timed deadline shows as overdue the moment it passes; a date-only deadline stays due all that calendar day. Set the time via an optional field beside the date; leave it blank for date-only.
- Every task carries a server-computed \`dueStatus\` (overdue / today / this_week / later / none), derived from the deadline relative to today (v2.10.3). It centralizes the due-bucket logic so Claude and any future client get a consistent answer without recomputing it.
- A task can belong to a project (optional). Tasks with no project are in Inbox.
- Bulk actions (v2.10.4): a "Select" mode on the task list lets you pick several tasks and, from a bulk-actions bar, complete/reopen them, move them to a project (or Inbox), or set/clear their deadline in one step. The same operations are available to Claude via bulk MCP tools, with bulk priority added in v2.10.7. There is no bulk delete - deletion stays one task at a time.
- Priority (v2.10.5): each task has a priority on the Todoist P1-P4 scale (P1 = Urgent, P2 = High, P3 = Medium, P4 = None, the default). It is set on the add/edit forms, shown as a small colored dot (P1-P3), filterable, and editable/queryable via Claude. P4 tasks show no dot, keeping the default view clean.

**Time tracking** (v2.19.0)
- Any task can have time tracked against it. At most one timer runs at a time (server-enforced); starting a new one auto-stops the previous.
- A **persistent tracking bar** sits at the bottom-left on desktop (bottom full-width on mobile): idle shows a "What are you working on?" input that quick-creates an Inbox task and starts tracking in one step; running shows the task title, live elapsed clock, and a Stop button.
- A per-task **timer control** (play/stop button) appears on each task row.
- A **timeline view** (`/time`) renders a Toggl-style vertical hour grid with day or week columns. Each tracked interval is a project-colored block. Click an empty slot to log a past entry; click a block to edit its times or delete it. The running entry grows live.
- Snap-to-5-min / exact granularity setting; an Inbox color picker (localStorage) so Inbox tasks have a distinguishable color on the timeline.
- A per-task totals breakdown shows below the grid for the visible range.
- Time entries are never merged or edited automatically - the user has full control over the log.

**Projects**
- Projects let the user categorize tasks.
- Each project can have an optional **hex color** (set on create or rename). The color appears as a left border on timeline blocks and as a swatch in the sidebar and project edit modal.
- The sidebar shows All Tasks, Inbox, and each project as separate views.
- Tasks can be assigned to a project at creation, reassigned from the task detail page, or changed in the edit modal.
- Deleting a project also deletes all its tasks (cascade delete, always confirmed first).
- Project names (and color) can be updated after creation.

**Labels**
- Labels are user-created tags that can be applied to any task, regardless of project.
- A task can have multiple labels. Labels are global - not scoped to a project.
- Labels are created and managed from the Labels dashboard (sidebar nav link).
- Each label has a name and a color (one of 10 pre-defined VIBGYOR shades).
- Labels can be applied when creating a task or from the task detail page.
- Deleting a label removes it from all tasks but does not delete those tasks.

**Filtering**
- A filter panel is available in the task list header (three-dot button).
- Filters can be applied to any view: All Tasks, Inbox, or a specific project.
- Available filter dimensions: by label (OR logic), by project, by deadline (today / this week / overdue).
- Filters stack on top of the sidebar view selection.
- Active filters are indicated by a count badge on the filter button.

**Data**
- All data is stored locally in `backend/Tasklog.Api/TasklogDatabase.db`.
- Nothing is sent to external services.

**Interface**
- The app works on phone and desktop through the same codebase.
- Every action produces visible feedback.
- Errors are shown clearly rather than silently ignored.

**AI integration (v2.10+)**
- Tasklog is reachable from claude.ai via a Model Context Protocol custom connector.
- The Tasklog API is exposed as **29 MCP tools** across four families:
  - *Tasks (18)*: list (with rich filters), get, create, update, delete, set-completion, assign-project, set-labels, add/list/delete comments, bulk complete/assign/deadline/priority, log/undo/list habit check-ins, get habits dashboard.
  - *Projects (4)*: list, create (with optional hex color), rename (with optional color), delete.
  - *Labels (4)*: list, create, update, delete.
  - *Time tracking (7, v2.19.0)*: start/stop/get-active timer, manually log a closed interval, edit a logged entry, delete an entry, get time summary by task for a date range.
- `list_tasks` accepts optional filters (project, inbox, labels, deadline range, creation-date range, completion, title substring, priority) plus sort + order + limit. `update_task` renames / reschedules / reprioritizes / sets recurrence without delete-and-recreate. `get_habits` returns per-habit streak, done-today, and weekly progress (computed server-side). `get_time_summary(from, to)` returns totals by task.
- The connector works on claude.ai web and mobile (Pro / Max plan).
- Connecting requires logging in with GitHub once; only the allow-listed username is permitted.
- All tool calls execute against the same SQLite database the web UI reads from. Tasks created via Claude appear instantly in the web UI on next refresh.
