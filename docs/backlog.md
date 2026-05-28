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
| [P74-habit-tracking.md](plans/P74-habit-tracking.md) | #74 | feature/habit-tracking-#74 | In Progress |
| P73-chip-task-sheet.md (pending) | #73 | feature/chip-task-sheet-#73 | Parked (UI uplift, resume later) |

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
| #47 | README overhaul and MIT license file | medium | rewrite as project landing page, add LICENSE |
| - | ARM64 Linux support: pre-built release + Termux hosting | medium | enable self-hosting on Android/ARM64 devices; add arm64 target to CI release pipeline |
| #49 | CD pipeline - auto-deploy to GCP via GitHub Actions | medium | complete the CI/CD loop; trigger on release tag |
| #56 | Public-demo MCP on GCP | medium | extend v2.10 MCP to the demo; depends on #52 rate limits |
| #60 | Extract useClickOutside hook + revisit poll-pause scope | low | from #59 review (R3/R4) |
| #62 | Set TZ on GCP deploy for correct demo dueStatus | low | from #61 review (R1) |

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
| #72 | Natural-language quick-add (Todoist-style title parsing) (v2.15.0) | feature | 2026-05-27 |
| #71 | Advanced recurrence grammar (nth-weekday, end conditions, intervals) (v2.14.1) | feature | 2026-05-27 |
| #70 | Recurrence core (recurring tasks) (v2.14.0) | feature | 2026-05-27 |
| #69 | Task comments + completion-log foundation (v2.13.0) | feature | 2026-05-27 |
| #68 | Deadline time-of-day (v2.12.0) | feature | 2026-05-27 |
| #67 | Task description field (v2.11.0) | feature | 2026-05-27 |
| #66 | Agent ergonomics (bulk_set_priority + name resolution) (v2.10.7) | feature | 2026-05-27 |
| #65 | list_tasks query completeness (createdAt filter, sort, limit) (v2.10.6) | feature | 2026-05-27 |
| #64 | Task priority (Todoist P1-P4) (v2.10.5) | feature | 2026-05-27 |
| #63 | Bulk task operations (complete, move-to-project, set-deadline) (v2.10.4) | feature | 2026-05-27 |

---

## Someday / Maybe

Untracked ideas - not estimated, not prioritized, not committed to. Just things worth remembering.

> Several of these are now sequenced in [proposal-next-versions.md](plans/proposal-next-versions.md) (v2.10.6 onward).

- Project-level labels - a label auto-applied to all tasks in a specific project. Labels are currently global only. This would require a project-to-label association and apply logic on task creation.

- Relative time display for completed date - show "just now", "2 hours ago", "3 days ago" instead of a formatted date. CompletedAt timestamp is already stored so this would be a UI-only change.
- Cross-device sync / live updates - changes on one device reflect on another without a manual reload.
- Project color codes - each project could have an assigned color shown as a swatch in the sidebar and next to tasks. The Edit Project dialog is already planned as a modal, making this a natural future addition (add a color picker field).
- Rich task detail - subtasks (checklist items under a parent task) for long-running work. (Description shipped in v2.11.0; comments shipped in v2.13.0 via the TaskComment table. Subtasks still parked here - they need a self-referencing model.)
- Theme selection - allow the user to switch between light, dark, and high-contrast color themes. Theme changes affect overall background, header/navbar, and general UI chrome. Project colors, label colors, and other user-assigned colors remain unchanged.
