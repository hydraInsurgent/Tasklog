# Proposal: recurring tasks + habit tracking (a multi-version program)

**Status:** proposal - not active plans yet
**Date:** 2026-05-27
**Supersedes:** the single "v2.13.0 recurring core / v2.13.1 UX" rows in [proposal-next-versions.md](proposal-next-versions.md).
**Decision (2026-05-27):** the user chose (a) **full Todoist-level recurrence** (incl. "every 3rd Thursday", end conditions, natural-language entry) and (b) **habit-tracking now** (skip detection, streaks, a comment/log per completion). That is far beyond a 2-version build, so it is re-planned here as a dependency-ordered sequence of shippable versions.

## TLDR

"Recurring tasks like Todoist + habit tracking" is genuinely ~5 versions, not 2, because of real dependencies: habit-tracking needs a completion-log/comments model; advanced and natural-language recurrence build on a recurrence core; the core needs occurrences linked into a series. Each version below is independently shippable and live-testable, same discipline as the v2.10.x run.

| Ver | Theme | Bump | Migration | Depends on |
|---|---|---|---|---|
| **v2.13.0** | Task comments + completion log foundation | minor | yes | - | shipped |
| **v2.14.0** | Recurrence core (subset + spawn-on-complete + series) | minor | yes | v2.12.0 (time), v2.13.0 (log) | shipped |
| **v2.14.1** | Advanced recurrence grammar (3rd-Thu, end conditions) | patch | no | v2.14.0 | in progress |
| **v2.14.2** | Natural-language recurrence ("every weekday") | patch | no | v2.14.1 | planned |
| **v2.15.0** | Habit tracking (streaks, skip detection) | minor | maybe | v2.14.0 + v2.13.0 | planned |

Versioning (revised 2026-05-27 per the project's minor-vs-patch rule): the two foundational, migration-carrying versions are minors (v2.13.0, v2.14.0); advanced grammar and natural-language entry *extend* the existing recurrence feature with no migration, so they are patches (v2.14.1, v2.14.2); habit tracking is a genuinely new capability (and may carry a migration), so it is the next minor (v2.15.0). Order is fixed by the dependency column.

## Why this order

- **Comments/log first (v2.13.0):** the smallest standalone win (notes on any task - also the parked "Rich task detail" comments slice) AND the substrate for "a comment/log gets updated on each completion." Build the foundation before the thing that needs it.
- **Recurrence core next (v2.14.0):** the rule + a `SeriesId` linking occurrences, with completing an occurrence spawning the next (deadline advanced, fields carried, a completion logged). Starts with a useful subset (daily / every-N-days / weekly-on-weekdays / monthly-on-day) stored RRULE-shaped so the grammar can grow. Needs time-of-day (v2.12.0, done) so a "daily 3pm" repeat works.
- **Advanced grammar (v2.14.1):** extend the rule + expander to RRULE's harder bits - nth-weekday ("3rd Thursday"), `BYMONTHDAY` from end, intervals, and end conditions (`UNTIL` / `COUNT`).
- **Natural language (v2.14.2):** the Todoist "type it in words" magic - parse "every weekday", "every 3rd thursday", "every other monday" into the rule. Highest-value for the MCP (Claude speaks language) + a UI quick-entry.
- **Habit tracking (v2.15.0):** streaks and skip detection computed from a series' completed occurrences vs its schedule ("you did 5 of the last 7"), "did you do it?" prompts for missed days, and auto-logging each completion as a comment. Sits on top of everything above.

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

### v2.14.2 - Natural-language recurrence `[patch]`
- Parse natural-language repeat phrases into the rule (MCP-first, since the LLM hands us language; plus a UI quick-entry box). "every weekday", "every 3rd thursday", "every other monday", "monthly on the 1st".

### v2.15.0 - Habit tracking `[minor, maybe migration]`
- Streaks + skip detection from the series' completed occurrences vs schedule; surface "you missed Mon, Tue" / "5-day streak"; "did you do it?" for overdue occurrences; auto-log each completion to the task's comments.

## Open questions for review

- **Five versions or fold some together?** e.g. advanced grammar (v2.14.1) could merge into core (v2.14.0) if we want fewer, bigger releases. Recommend keeping them split - each is independently testable and the core ships sooner. (Resolved: kept split; advanced grammar + natural-language are patches, not minors - see the table.)
- **Recurrence storage:** literal RRULE strings vs a small typed structure that serialises to RRULE. Recommend the typed structure (easier to validate/expand) with an RRULE-compatible shape.
- **Series vs single mutating row:** spawn a new task per occurrence (history = completed rows, recommended) vs advance one row's deadline in place (no history). History is needed for habit-tracking, so: separate rows + SeriesId.
- **Natural-language parsing location:** a dependency/library vs a hand-rolled parser for the supported subset. Decide at v2.14.2 (lean toward a small hand-rolled parser for the agreed phrases to avoid a heavy dep, per the project's "avoid unnecessary frameworks" rule).
