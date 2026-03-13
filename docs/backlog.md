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
| [P12-projects-inbox.md](plans/P12-projects-inbox.md) | #12 | feature/projects-inbox-#12 | In Progress |

---

## Feature Backlog

Future features - not yet started. Add GitHub issue number when created.

| # | Title | Priority | Notes |
|---|-------|----------|-------|
| #20 | Extract shared date formatting helpers to lib/format.ts | low | from #12 review |

---

## Bug Backlog

Known bugs not yet fixed. Add GitHub issue number when created.

| # | Title | Priority | Notes |
|---|-------|----------|-------|
| #1 | CORS and server-side fetch break outside localhost | high | |
| #2 | State/UX bugs - feedback timer, optimistic delete | medium | |
| #3 | Fragile DB path, silent API URL failure | medium | |
| #4 | Accessibility - contrast and focus indicators | medium | |
| #5 | Code cleanup - duplicated utils, UTC timestamps | low | |
| #6 | Security hardening - CORS methods, AllowedHosts | low | |
| #13 | Project create/rename/delete failures give no feedback | high | from #12 review |
| #14 | Add task form project dropdown doesn't update on view change | high | from #12 review |
| #15 | AssignProjectButton shows new project before API confirms | medium | from #12 review |
| #16 | Edit/delete project buttons below 44px touch target | medium | from #12 review |
| #17 | CreatedAtAction in ProjectsController points to wrong route | low | from #12 review |
| #18 | Inconsistent DateTime.Now vs UtcNow across controllers | low | from #12 review |
| #19 | Assigning task to non-existent project returns 500 not 400 | low | from #12 review |
| #21 | Add project button missing minimum touch target height | low | from #12 review |

---

## Closed

Recently completed work (keep last 10):

| # | Title | Type | Closed |
|---|-------|------|--------|
| #9 | Feature: Task completion | feature | 2026-03-12 |
| #11 | Show/hide toggle during animation causes visual glitch | bug | 2026-03-12 |
| #10 | Rapid task toggle orphans hide timer | bug | 2026-03-12 |
| #8 | App not accessible from phone on local network | bug | 2026-03-11 |
| #7 | Feature: v2 Architecture Migration | feature | 2026-03-11 |

---

## Someday / Maybe

Untracked ideas - not estimated, not prioritized, not committed to. Just things worth remembering.

- Relative time display for completed date - show "just now", "2 hours ago", "3 days ago" instead of a formatted date. CompletedAt timestamp is already stored so this would be a UI-only change.
- Cross-device sync / live updates - changes on one device reflect on another without a manual reload.
- Distributable app - let other users download and run Tasklog on their own machine. Needs exploration: Docker Compose (two services, one command), single executable (.NET serves the Next.js build), or Electron wrapper (desktop app that manages both processes). Two-process architecture makes this non-trivial.
- Project color codes - each project could have an assigned color shown as a swatch in the sidebar and next to tasks. The Edit Project dialog is already planned as a modal, making this a natural future addition (add a color picker field).
- Mobile task cards - replace the task table with a compact card layout on small screens. Each card shows title, project, deadline, and completion state at a glance, avoiding the horizontal scroll that a wide table causes on phones. Desktop keeps the table. Would be a CSS/layout-only change with no backend work.
