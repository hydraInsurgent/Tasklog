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
| P9-task-completion.md | #9 | feature/task-completion-#9 | In Progress |

---

## Feature Backlog

Future features - not yet started. Add GitHub issue number when created.

| # | Title | Priority | Notes |
|---|-------|----------|-------|
| | | | |

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
| #10 | Rapid task toggle orphans hide timer | low | |
| #11 | Show/hide toggle during animation causes visual glitch | low | |

---

## Closed

Recently completed work (keep last 10):

| # | Title | Type | Closed |
|---|-------|------|--------|
| #8 | App not accessible from phone on local network | bug | 2026-03-11 |
| #7 | Feature: v2 Architecture Migration | feature | 2026-03-11 |

---

## Someday / Maybe

Untracked ideas - not estimated, not prioritized, not committed to. Just things worth remembering.

- Relative time display for completed date - show "just now", "2 hours ago", "3 days ago" instead of a formatted date. CompletedAt timestamp is already stored so this would be a UI-only change.
- Cross-device sync / live updates - changes on one device reflect on another without a manual reload.
