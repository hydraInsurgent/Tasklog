# Tasklog Backlog

This is the single source of truth for all planned, in-progress, and recently completed work.

It is updated by the workflow commands:
- `/create-issue` adds items to Feature or Bug backlog
- `/start-feature` moves an item to Active
- `/fix` marks a bug as fixed
- `/ship` moves an item to Closed

**Scope check rule:**
When a new request comes in, check the Active section first.
- If there is an active plan: anything outside that plan's stated scope goes to backlog, not into the active branch.
- If there is no active plan: new items go directly to the appropriate backlog section.
- Slight deviations from an active plan still go to backlog. Scope creep compounds even when each addition seems small.

---

## Active

What is currently being planned or built:

| Plan file | Issue | Branch | Status |
|-----------|-------|--------|--------|
| - | - | - | - |

---

## Feature Backlog

Future features - not yet started. Add GitHub issue number when created.

| # | Title | Priority | Notes |
|---|-------|----------|-------|
| #25 | Guard against invalid date strings in format.ts | low | from #22 review |
| #26 | Simplify className construction in TaskCard | low | from #22 review |
| #27 | Add overflow guard to three-dot dropdown menu | low | from #22 review |
| #28 | Align focus ring color to UI-SPEC accent token | low | from #22 review |
| #29 | Increase three-dot button icon size to match UI-SPEC | low | from #22 review |
| #39 | Show child process errors in launcher on failure | medium | from #37 review |
| #40 | Detect port-in-use before starting services | medium | from #37 review |
| #41 | Deduplicate seed logic between build scripts | low | from #37 review |
| #43 | Separate user data from app binaries for safe upgrades | high | enables real usage and safe version upgrades |

---

## Bug Backlog

Known bugs not yet fixed. Add GitHub issue number when created.

| # | Title | Priority | Notes |
|---|-------|----------|-------|
| #23 | Three-dot menu does not close on tap outside on mobile | high | from #22 review |
| #1 | CORS and server-side fetch break outside localhost | high | fixed in v2.5 |
| #2 | State/UX bugs - feedback timer, optimistic delete | medium | |
| #3 | Fragile DB path, silent API URL failure | medium | fixed in v2.5 |
| #4 | Accessibility - contrast and focus indicators | medium | |
| #5 | Code cleanup - duplicated utils, UTC timestamps | low | |
| #6 | Security hardening - CORS methods, AllowedHosts | low | |
| #17 | CreatedAtAction in ProjectsController points to wrong route | low | from #12 review |
| #38 | Incomplete RFC 1918 check for 172.x.x.x in launcher | low | from #37 review |
| #18 | Inconsistent DateTime.Now vs UtcNow across controllers | low | from #12 review |
| #19 | Assigning task to non-existent project returns 500 not 400 | low | from #12 review |
| #21 | Add project button missing minimum touch target height | low | from #12 review |

---

## Closed

Recently completed work (keep last 10):

| # | Title | Type | Closed |
|---|-------|------|--------|
| #45 | Frontend .next dir missing from distributable | bug | 2026-04-03 |
| #44 | CI and Cross-Platform Distribution | feature | 2026-03-31 |
| #42 | Feature: Background Auto-Refresh | feature | 2026-03-25 |
| #37 | Feature: Downloadable Package | feature | 2026-03-20 |
| #30 | Feature: Labels and Filtering | feature | 2026-03-20 |
| #31-#36 | Review fixes for #30 | fix | 2026-03-20 |
| #22 | Feature: Mobile Task Cards | feature | 2026-03-14 |
| #12 | Feature: Projects and Inbox | feature | 2026-03-13 |
| #9 | Feature: Task completion | feature | 2026-03-12 |
| #11 | Show/hide toggle during animation causes visual glitch | bug | 2026-03-12 |
| #10 | Rapid task toggle orphans hide timer | bug | 2026-03-12 |

---

## Someday / Maybe

Untracked ideas - not estimated, not prioritized, not committed to. Just things worth remembering.

- Project-level labels - a label auto-applied to all tasks in a specific project. Labels are currently global only. This would require a project-to-label association and apply logic on task creation.

- Relative time display for completed date - show "just now", "2 hours ago", "3 days ago" instead of a formatted date. CompletedAt timestamp is already stored so this would be a UI-only change.
- Cross-device sync / live updates - changes on one device reflect on another without a manual reload.
- Project color codes - each project could have an assigned color shown as a swatch in the sidebar and next to tasks. The Edit Project dialog is already planned as a modal, making this a natural future addition (add a color picker field).
- Task edit modal - inline modal popup for editing a task's title, deadline, and project without leaving the main view. Currently clicking a task navigates to /tasks/[id]. A modal would keep the user in context.
- Rich task detail - for long-running tasks with multiple milestones, add: (1) an optional description field, (2) subtasks (checklist items under a parent task), and (3) comments/progress notes to track how the work evolved. Each piece can be built incrementally. Description is the smallest change (migration + text field on detail page). Subtasks require a self-referencing or child-task model. Comments require a TaskComment table with timestamps. Would make the task detail page the natural home for complex work.
- README as GitHub artifact - rewrite README.md as a proper project introduction: project vision, what problem it solves, tech stack, quick-start instructions, and a roadmap section. Should feel like a polished open-source project landing page.
- Task priority - a priority field (P1/P2/P3 or High/Medium/Low) on each task. Adds a priority filter to the filter panel alongside labels/project/date.
- Editable deadline / postpone - deadlines are currently set only at task creation. Add a small popup with a calendar to change the deadline from the task list. Include a quick "postpone to weekend" action alongside the full calendar picker for choosing a specific date.
- Theme selection - allow the user to switch between light, dark, and high-contrast color themes. Theme changes affect overall background, header/navbar, and general UI chrome. Project colors, label colors, and other user-assigned colors remain unchanged.
- README overhaul - rewrite README.md as a proper GitHub project introduction: project vision, why it exists (the Todoist frustration origin), a feature showcase with screenshots, quick-start instructions, and a roadmap section showing where the project is heading. Goal is for someone landing on the repo to immediately understand what Tasklog is, why it matters, and how to run it.
