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

Currently: a single user accessing the app from multiple devices on the same
local network (phone and desktop).

This shapes decisions like authentication (not needed yet), data storage (local SQLite),
and hosting (no cloud requirement). If the user profile changes - e.g. sharing
with a partner, hosting publicly - these decisions should be revisited.

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

**Single user** - no accounts, roles, or sharing currently.
If multi-user or sharing becomes a real need, authentication and data isolation
would need to be added before anything else.

**Local network only** - no cloud hosting, no public access currently.
Exposing the app publicly would require authentication and security hardening first.

**No notifications** - deadlines are informational. The app shows them; it does not act on them.
A reminder or alert system would be a meaningful scope addition.

**No calendar integration** - deadlines exist on tasks but do not sync to external calendars.

**Single data file** - all data lives in one SQLite file. The user can back it up by copying it.
A more complex storage strategy would only make sense if the data model outgrows SQLite.

---

## How features currently work

**Tasks**
- A task has a title (required) and an optional deadline.
- A task exists until it is deleted.
- Tasks can be marked complete via a checkbox. Completed tasks hide from the default view with a brief animation.
- A "Show completed" toggle reveals all completed tasks. Completion can be undone.
- CompletedAt timestamp is recorded when a task is marked done and cleared if un-completed.
- Deadlines are visible to the user but the app does not enforce or act on them.
- A task can belong to a project (optional). Tasks with no project are in Inbox.

**Projects**
- Projects let the user categorize tasks.
- The sidebar shows All Tasks, Inbox, and each project as separate views.
- Tasks can be assigned to a project at creation or reassigned from the task detail page.
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
