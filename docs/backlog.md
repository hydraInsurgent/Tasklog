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
| P86-time-tracking.md | #86 | feature/routines-#86 | In Progress |

---

## Feature Backlog

Future features - not yet started. Add GitHub issue number when created.

| # | Title | Priority | Notes |
|---|-------|----------|-------|
| - | **Daily view story** (planned NEXT after #86): a "Today" screen + the plan-vs-actual **calendar** + a realistic **journaling routine**, together under the journaling line | high | raised during #86 (correctly deferred as scope creep). Bundles three previously-separate backlog items: the Today screen (today's tasks + due habits + the day's tracked time), the day-planning calendar (planned time blocks overlaid on the tracked actuals #86 built), and expanding the journal into a daily-ritual flow. The list/board view-mode axis already leaves room. Needs its own /explore + /create-plan. |
| - | Habit combined schedule mode: a weekly count AND restricted days ("3 times among Mon/Wed/Fri"); also "x times a month" period + per-habit minimum floor | low | parked from #75; #75 ships two distinct modes (specific-days OR x-times-a-week), this combines them |
| - | Dark mode (tokens already in place from #73 - add a `.dark` block) | low | #73 made it a drop-in |
| - | Habits calendar heatmap (GitHub-style) | low | check-in data already supports it |
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
| #85 | Journal QoL (wheel drill-down + task sheet) | improvement | 2026-07-08 |
| #79 | Journaling | feature | 2026-07-04 |
| #78 | Subtasks: lightweight checklist items under a task (v2.20.0) | feature | 2026-07-02 |
| #77 | Time tracking per task + timeline dashboard + project colors (v2.19.0) | feature | 2026-06-12 |
| #76 | Fix: frequency habit check-in showed stale weekly progress (optimistic update) (v2.18.1) | bug | 2026-06-01 |
| #75 | Habits v2 Step 2: x-times-a-week frequency + deadline-free habit schedules (v2.18.0) | feature | 2026-05-31 |
| #73 | UI uplift: design tokens + chip-driven sheet + board view + Habits v2 Step 1 (v2.17.0) | feature | 2026-05-30 |
| #74 | Habit tracking (IsHabit + daily check-ins + streaks) (v2.16.0) - completes the recurring+habits program | feature | 2026-05-28 |
| #72 | Natural-language quick-add (Todoist-style title parsing) (v2.15.0) | feature | 2026-05-27 |
| #71 | Advanced recurrence grammar (nth-weekday, end conditions, intervals) (v2.14.1) | feature | 2026-05-27 |
| #70 | Recurrence core (recurring tasks) (v2.14.0) | feature | 2026-05-27 |
| #69 | Task comments + completion-log foundation (v2.13.0) | feature | 2026-05-27 |

---

## Someday / Maybe

Untracked ideas - not estimated, not prioritized, not committed to. Just things worth remembering.

> Several of these are now sequenced in [proposal-next-versions.md](plans/proposal-next-versions.md) (v2.10.6 onward).

- Project-level labels - a label auto-applied to all tasks in a specific project. Labels are currently global only. This would require a project-to-label association and apply logic on task creation.

- Relative time display for completed date - show "just now", "2 hours ago", "3 days ago" instead of a formatted date. CompletedAt timestamp is already stored so this would be a UI-only change.
- Cross-device sync / live updates - changes on one device reflect on another without a manual reload.
- Rich task detail - subtasks (checklist items under a parent task) for long-running work. (Description shipped in v2.11.0; comments shipped in v2.13.0 via the TaskComment table. Now in progress as #78 - lightweight checklist model, mirroring the TaskComment table. Future increment noted: subtasks may gain their own deadline as a nullable column.)
- Theme selection - allow the user to switch between light, dark, and high-contrast color themes. Theme changes affect overall background, header/navbar, and general UI chrome. Project colors, label colors, and other user-assigned colors remain unchanged.
- Dream journal / wishlist - a simple standing list of dreams and "someday I want to do this" items, wishlist-type entries. Part of the journaling family (post-#79); likely just another journal template or a lightweight standing list, not a per-day entry.
- Watch list / content tracker - a standing list of shows, movies, and other content to watch, doubling as a tracker of what has been watched (status per item). Same standing-list family as the dream journal / wishlist; post-#79.
- Recurring task progress log (auto-comments) - when a recurring occurrence is completed, automatically write a log entry capturing the outcome (e.g. "Completed 4/5 subtasks", completion date) so each series builds its own history/streak record without manual notes. Depends on subtasks (#78) for the progress count. Open design question: log onto the series (SeriesId) vs the individual occurrence.
- Domain event log + notification foundation - persist system events (deadline crossed / task went overdue, task completed, recurring occurrence spawned or completed, subtask went overdue) as structured, durable log entries. Purpose: give a future notification service a reliable event stream to consume so reminders/notifications can be built on top and keep working. Key design decision to resolve first: reuse the TaskComment table (simple, but mixes system events into the user's comment stream) vs a dedicated Activity/Event table (cleaner separation, own schema). Leaning toward a dedicated table so user comments stay human-authored. This is the substrate a notification service would poll or subscribe to.

### Time-tracking + "record of life" cluster (from #86 exploration, 2026-08-29)

These emerged while exploring #86 (Toggl-style time tracking). #86 v1 deliberately builds only the actuals/tracking half plus the shared Area -> Project spine; the items below are the follow-on features that stand on that foundation. Rough dumps, need refining before any become an issue.

- Day-planning calendar (plan vs actual overlay) - the Toggl-mobile-style 24h day view with the planned side (internal calendar blocks; optional Google Calendar sync later) shown against tracked actuals, overlaid so you see planned-vs-executed per block. The "planning half" that pairs with #86's actuals half. Plan holds tasks AND intentional activities (walk, exercise, morning routine, modeled as habits/recurring tasks). This is the immediate intended follow-up to #86.
- Life-graph / referable entities (people, movies, media) - make `@person`, `@movie`, etc. first-class things you can reference from journal entries, tasks, and time entries, then query by entity ("what memories/entries mention this person", "all time around X"). Extends the journal into a "record of life around you", not just daily entries. Hangs off the Area/Project/entry structure #86 establishes.
- Goals feature - Toggl recently added goals; likely lives in/near the Journal. Tie tracked time and habit streaks to explicit goals. Part of the same journal-expansion family (people / goals / interests / hobbies sections).
- Desktop/PC auto-trackers - a background script on the PC that logs the active app/window into time entries automatically, to cut manual tracking friction and recover the data lost on low-motivation days (the "22h tracked then life happened and I forgot" problem).
- Unified add-or-track composer - one minimal input that can either create a task (plan) or start a timer (track), expanding for more detail on demand. The "same slider, add-or-start-working" idea. A UI unification over the (deliberately distinct) Task and TimeEntry entities.
- Timeline push-down layout for dense short-block clusters - #86 snaps timer entries to the 5-min grid and discards sub-2.5-min ones on close, which removes the common overlap. But several *legit* 5-min entries back-to-back still render at the min block height (~18px > their 4px slot) and can visually crowd. Fix = a push-down pass (each block starts no higher than the previous one's rendered bottom); not a data change, just layout. Build only if it still bugs in real use.
- "Continue from last stop time" when starting a timer (Toggl option) - optionally set a new entry's start to the previous entry's (snapped) end for gap-free chaining. Needs a per-start toggle / preference, so belongs with the Settings/preferences item above. (A manual "Set start to last stop" button already exists on the running-entry edit panel as of #86; this backlog item is the automatic-on-start version.)
- Drag-and-drop time entries on the timeline (move / resize blocks) - quick-edit an entry's start/end/position by dragging the block or its edges, calendar-style. Bonus UX (flagged by the user as a nice-to-have). Today start/description/project are edited via the entry panel (the running entry included, #86); this would make it faster.
- Settings / preferences area (profile options) - a place for user preferences the app has none of yet. First concrete want (from #86 testing, 2026-08-30): a toggle to switch the left sidebar from the current **flat list + per-row client chip** to a **nested view** (clients as expandable groups with their projects nested under). Both renderings sit on the same Client -> Project data; it is purely a display preference. Other candidates to house here later: default timeline view (day/week), snap granularity, theme (light/dark), Inbox color - things currently hardcoded or in localStorage. Needs a home for preferences first (localStorage vs a settings table).
- Routine-runner reconsidered (original #96 Routinery idea) - a routine is an ordered set of steps you "run", producing a chain of time entries (one per step) on the decoupled-entry engine built in #86 (start auto-stops the previous = the step hand-off, no rework). Definition layer rides on tasks-with-subtasks (routine = task, steps = subtasks); the one new field is a per-step **estimate** - soft, NOT an enforced countdown. While running, an **overrun reminder/notification** nudges you ("30 min on this step") and you **manually** switch to the next step - a reminder, not auto-advance. Planned-vs-actual falls out for free (estimate vs the entry the step produced). DEPENDS ON a notification capability the app does not have yet (product-design: "No notifications, deadlines are informational") - would ride on the "Domain event log + notification foundation" item above. Cut from #86 v1 because real historical usage was free-form entries, not step-runners; revisit once notifications exist and/or free-text tracking proves insufficient.
