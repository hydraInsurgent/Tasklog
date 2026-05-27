# Todoist natural-language Quick Add - syntax + Tasklog subset

**Researched:** 2026-05-27
**Source:** Todoist Help, "Use task Quick Add" - https://www.todoist.com/help/articles/use-task-quick-add-in-todoist-va4Lhpzz
**Why:** The user wants Tasklog's add-task title field to parse Todoist-style inline tokens (date/recurrence + project + label + priority) from free text, highlight them, and autosuggest - not just parse recurrence. This file pins Todoist's actual syntax and the subset Tasklog will mirror.

## Todoist Quick Add tokens (verbatim symbols)

| Token | Symbol / form | Example | Notes |
|---|---|---|---|
| Date & time | natural language, auto-detected | `tomorrow at 4pm`, `friday`, `jan 27`, `next monday` | highlighted inline; no symbol |
| Recurring | natural language `every ...` | `every other Tuesday starting March 3`, `every day`, `every 3 days`, `every monday`, `every 27th` | a date phrase that repeats |
| Project | `#` + name | `#Work` | autocompletes existing projects |
| Sub-area / section | `/` after project | `#Work /Admin` | sections |
| Label | `@` + name | `@email` | autocompletes existing labels |
| Priority | `p1` / `p2` / `p3` / `p4` | `p1` | p1 highest |
| Assignee | `+` + name | `+Lucile` | shared projects only |
| Reminder | `!` + time | `!14:00`, `!30 min before` | |

**Recognition behavior:** "The app highlights recognized information automatically." Recognized words can be clicked "to turn it into plain text" (opt out of a wrong match). Autocomplete options appear for existing projects, labels, and collaborators when typing the symbol.

**Recurring `every` vs `every!`:** plain `every` = next due date computed from the scheduled date; `every!` = computed from the completion date (Tasklog's v2.14.0 already chose the plain/scheduled semantics; the `!` completion-anchored variant is not implemented).

## Tasklog subset (what applies here)

Tasklog is single-user, no collaborators, no reminders/notifications, no sections. So of Todoist's tokens, the ones that map to existing Tasklog fields:

| Token | Maps to | Resolver that already exists |
|---|---|---|
| NL date | `Deadline` (date, optional time) | none yet - needs a date parser |
| NL recurrence (`every ...`) | `Recurrence` (RRULE) | inverse of `describeRecurrence`; emits the v2.14.x grammar |
| `#Project` | `ProjectId` | `ResolveProjectByName` (backend) / project list (frontend) |
| `@Label` | `Labels` | `ResolveLabelsByName` (backend) / label list; label auto-create already exists in AddTaskForm |
| `p1`-`p4` | `Priority` | direct |

**Dropped (no Tasklog equivalent):** `+assignee` (single user), `!reminder` (no notifications - product-design "No notifications"), `/section` (no sections). If those are ever added, the parser can grow.

## The hard part: NL date parsing

The structured tokens (`#`/`@`/`pN`) are trivial - symbol-delimited, resolve by name against existing lists. The genuinely hard, open-ended part is **free-form date/recurrence** ("friday", "next week", "jan 27", "in 3 days", "every other monday"). Todoist's parser is years of refinement. Tasklog has no date-NL library and the project rule is "avoid unnecessary frameworks", so this needs a bounded, hand-rolled subset. Recurrence NL maps onto the existing RRULE grammar (so it is constrained); absolute/relative one-off dates are the part to scope deliberately.

## Implication

This is **natural-language quick-add**, a new way to create a task - a new user capability, not an extension of recurrence. It is bigger than the planned "v2.14.2 NL recurrence" patch and is minor-sized. Recurrence-NL is one token type within it. Scope + phasing to be decided with the user before planning.
