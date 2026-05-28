# Proposal: recurring tasks + habit tracking (a multi-version program)

**Status:** COMPLETE - all five versions shipped (v2.13.0 -> v2.16.0). Habit tracking (v2.16.0) is the finale.
**Date:** 2026-05-27 (completed 2026-05-28)
**Supersedes:** the single "v2.13.0 recurring core / v2.13.1 UX" rows in [proposal-next-versions.md](proposal-next-versions.md).
**Decision (2026-05-27):** the user chose (a) **full Todoist-level recurrence** (incl. "every 3rd Thursday", end conditions, natural-language entry) and (b) **habit-tracking now** (skip detection, streaks, a comment/log per completion). That is far beyond a 2-version build, so it is re-planned here as a dependency-ordered sequence of shippable versions.

## TLDR

"Recurring tasks like Todoist + habit tracking" is genuinely ~5 versions, not 2, because of real dependencies: habit-tracking needs a completion-log/comments model; advanced and natural-language recurrence build on a recurrence core; the core needs occurrences linked into a series. Each version below is independently shippable and live-testable, same discipline as the v2.10.x run.

| Ver | Theme | Bump | Migration | Depends on |
|---|---|---|---|---|
| **v2.13.0** | Task comments + completion log foundation | minor | yes | - | shipped |
| **v2.14.0** | Recurrence core (subset + spawn-on-complete + series) | minor | yes | v2.12.0 (time), v2.13.0 (log) | shipped |
| **v2.14.1** | Advanced recurrence grammar (3rd-Thu, end conditions) | patch | no | v2.14.0 | shipped |
| **v2.15.0** | Natural-language quick-add (was "NL recurrence", expanded to full Todoist quick-add) | minor | no | v2.14.1 | shipped |
| **v2.16.0** | Habit tracking (IsHabit flag + daily check-ins + streaks + Habits view) | minor | yes | v2.13.0 | shipped |

Versioning (revised 2026-05-27 per the project's minor-vs-patch rule): the two foundational, migration-carrying recurrence versions are minors (v2.13.0, v2.14.0); advanced grammar *extends* recurrence with no migration, so it is a patch (v2.14.1). The "NL recurrence" slice was then **expanded by the user into a full Todoist-style natural-language quick-add** (parse date + recurrence + #project + @label + priority from the title, with inline highlighting) - a new creation capability, so it is a minor (v2.15.0), not a patch. Habit tracking remains the finale minor (now v2.16.0). Order is fixed by the dependency column.

## Why this order

- **Comments/log first (v2.13.0):** the smallest standalone win (notes on any task - also the parked "Rich task detail" comments slice) AND the substrate for "a comment/log gets updated on each completion." Build the foundation before the thing that needs it.
- **Recurrence core next (v2.14.0):** the rule + a `SeriesId` linking occurrences, with completing an occurrence spawning the next (deadline advanced, fields carried, a completion logged). Starts with a useful subset (daily / every-N-days / weekly-on-weekdays / monthly-on-day) stored RRULE-shaped so the grammar can grow. Needs time-of-day (v2.12.0, done) so a "daily 3pm" repeat works.
- **Advanced grammar (v2.14.1):** extend the rule + expander to RRULE's harder bits - nth-weekday ("3rd Thursday"), `BYMONTHDAY` from end, intervals, and end conditions (`UNTIL` / `COUNT`).
- **Natural-language quick-add (v2.15.0):** the Todoist "type it in words" magic - the title field parses date + "every ..." recurrence + #project + @label + priority inline, with highlighting + autosuggest. (Expanded from the original "NL recurrence" slice; web-only since Claude already parses phrases over the MCP.)
- **Habit tracking (v2.16.0):** streaks and skip detection computed from a series' completed occurrences vs its schedule ("you did 5 of the last 7"), "did you do it?" prompts for missed days, and auto-logging each completion as a comment. Sits on top of everything above.

## Version sketches (sized into full plans at /create-plan time)

### v2.13.0 - Task comments + completion log `[minor, migration]`
- `TaskComment` table (id, taskId FK cascade, body, createdAt). Add / list / delete a comment on a task.
- API: `POST/GET/DELETE /api/tasks/{id}/comments`. MCP: `add_task_comment`, comments in `get_task`. UI: a comments section on the task detail page.
- Standalone-useful immediately; later versions append completion-log entries here.

### v2.14.0 - Recurrence core `[minor, migration]`
- `Recurrence` (rule string, RRULE-shaped) + `SeriesId` (Guid) on the task. Subset: daily / every-N-days / weekly[weekdays] / monthly[day].
- Complete a recurring task -> mark done + spawn the next occurrence (deadline advanced per rule; title/project/labels/priority/description/recurrence carried; same SeriesId). Optionally log a completion comment (uses v2.13.0).
- MCP: recurrence on create_task/update_task + in the Task shape. UI: a basic recurrence picker + a recurring badge.

### v2.14.1 - Advanced recurrence grammar `[patch]`
- Extend the rule + expander: nth-weekday ("3rd Thursday", `BYDAY=3TH`), `BYMONTHDAY` from end, weekly/monthly `INTERVAL>1`, `UNTIL`/`COUNT` end conditions. UI for these. (BYSETPOS not needed - BYDAY-ordinal covers it.)

### v2.15.0 - Natural-language quick-add `[minor]` (SHIPPING - #72)
- The add-task title field parses one NL line into date + recurrence + #project + @label + priority, with inline highlight, #/@ autosuggest, removable captured chips, and live-fill of the structured controls. chrono-node for dates; recurrence + tokens hand-rolled. Bare multi-weekday ("friday and saturday") = those days once via an end date. Web-only (Claude already parses phrases over MCP). Expanded from the original "NL recurrence" patch.

### v2.16.0 - Habit tracking `[minor, migration]` (SHIPPED - #74)
- **Final design diverged from this sketch** (user-chosen, simpler, decoupled from recurrence): a habit is a dedicated `IsHabit` bool on the task (not derived from a series), checked off per day via a new `CheckIns` table (one row per task per day, unique index = idempotent "done today"). The current streak is a pure helper (`HabitStreak.CurrentStreak(dates, today)`): consecutive days back from today, grace through yesterday.
- `CheckInsController` (POST/DELETE/GET `/api/tasks/{id}/checkins`) + `HabitsController` (`GET /api/habits` -> task + currentStreak + doneToday + recentCheckIns). `isHabit` settable on create/update.
- Web: a `/habits` view (Habits sidebar link) listing `HabitCard`s (streak flame + count, last-7-days dot row, big done-today toggle); a "Track as a daily habit" checkbox on the add/edit forms. MCP: `log_habit_checkin` tool + `isHabit` on create_task/update_task.
- **Deliberately NOT in this version** (the original sketch's harder ideas, deferred): schedule-derived skip detection / "you missed Mon, Tue", "did you do it?" prompts for overdue days, auto-logging completions as comments, and a GitHub-style calendar **heatmap** (the CheckIns rows are the data it needs - a clean later phase).

## Open questions for review

- **Five versions or fold some together?** e.g. advanced grammar (v2.14.1) could merge into core (v2.14.0) if we want fewer, bigger releases. Recommend keeping them split - each is independently testable and the core ships sooner. (Resolved: kept split; advanced grammar + natural-language are patches, not minors - see the table.)
- **Recurrence storage:** literal RRULE strings vs a small typed structure that serialises to RRULE. Recommend the typed structure (easier to validate/expand) with an RRULE-compatible shape.
- **Series vs single mutating row:** spawn a new task per occurrence (history = completed rows, recommended) vs advance one row's deadline in place (no history). History is needed for habit-tracking, so: separate rows + SeriesId.
- **Natural-language parsing location:** a dependency/library vs a hand-rolled parser for the supported subset. Decided at v2.15.0: chrono-node for one-off dates (clear-benefit dep), hand-rolled recurrence + tokens.
