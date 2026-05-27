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
- A task can have timestamped comments (v2.13.0) - add/delete them on the task detail page or add via Claude. The first step toward richer task detail and the foundation for the planned habit-tracking completion log.
- A task can repeat (v2.14.0) - set a recurrence (daily, every N days, weekly on chosen weekdays, or monthly on a day-of-month) on the add/edit forms or via Claude. A recurring task needs a deadline to repeat from. Completing it keeps the finished one as history and immediately creates the next occurrence with its deadline advanced, logging a completion comment on the one just done. This is the recurrence core; advanced patterns ("3rd Thursday", end dates), natural-language entry, and habit streaks are planned follow-ups.
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

**Projects**
- Projects let the user categorize tasks.
- The sidebar shows All Tasks, Inbox, and each project as separate views.
- Tasks can be assigned to a project at creation, reassigned from the task detail page, or changed in the edit modal.
- Deleting a project also deletes all its tasks (cascade delete, always confirmed first).
- Project names can be renamed after creation.

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

**AI integration (v2.10, filtering added v2.10.1, editing added v2.10.2)**
- Tasklog is reachable from claude.ai via a Model Context Protocol custom connector.
- The Tasklog API is exposed as 21 MCP tools (incl. four bulk tools and `add_task_comment`, v2.13.0). `list_tasks` accepts optional filters (project, inbox, labels, deadline range, creation-date range, completion, title substring, priority) plus sort + order + limit, so Claude can answer scoped questions like "what's due this week in Work", "what did I add today", or "top 5 by priority" in a single call. Completion is a single `set_task_completion(id, isCompleted)` toggle. `update_task(id, title?, deadline?, priority?, description?, recurrence?)` renames / reschedules / reprioritizes / sets recurrence without delete-and-recreate. Project/label assignment accepts a name as well as an id (v2.10.7), so Claude can "move these to Work" or "tag these urgent" without a lookup first. Claude can make a task repeat by passing an RRULE-shaped `recurrence` to `create_task`/`update_task` (v2.14.0); completing it advances the series.
- The connector works on claude.ai web and mobile (Pro / Max plan).
- Connecting requires logging in with GitHub once; only the allow-listed username is permitted.
- All tool calls execute against the same SQLite database the web UI reads from. Tasks created via Claude appear instantly in the web UI on next refresh.
