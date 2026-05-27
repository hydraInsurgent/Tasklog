# Feature Implementation Plan: Natural-language quick-add

**Overall Progress:** `0%`

**Tracking issue:** [#72](https://github.com/hydraInsurgent/Tasklog/issues/72)
**Branch:** `feature/natural-language-recurrence-#72`
**Target version:** v2.15.0 (minor - new capability, NO migration) - re-scoped from the program's "NL recurrence" slice
**Research:** [todoist-quick-add-2026-05-27.md](../research/todoist-quick-add-2026-05-27.md), [rrule-rfc5545-2026-05-27.md](../research/rrule-rfc5545-2026-05-27.md)

## TLDR

Make the add-task title field a Todoist-style quick-add: type `Send email to Mark friday #Work @urgent p1 every week` and it parses the deadline, recurrence, project, label, and priority *inline from the title*, highlights the recognized tokens as you type (click to unlink a wrong match), autosuggests projects/labels, and saves a clean title. Frontend-only - the parser resolves against the lists the form already loads and feeds the existing create flow. `chrono-node` handles free-form dates; recurrence + the `#`/`@`/`pN` tokens are hand-rolled onto the grammar already shipped.

## Goal State

**Current State:** Creating a task means filling separate controls - title, deadline date+time, project dropdown, label autocomplete, priority, recurrence picker.
**Goal State:** You can express all of that in one line of natural language in the title (the structured controls remain, pre-filled from the parse, as confirmation/override). The title field shows recognized tokens highlighted live and autosuggests `#`/`@`.

## Critical Decisions

- **Decision 1: `chrono-node` (2.9.1, MIT) for free-form one-off dates; hand-roll the rest.**
  - **Options considered:** (a) hand-roll all date NL - endless edge cases ("next friday", "jan 27", "in 3 days", "2 weeks from now"); (b) chrono-node for dates; (c) a heavier NL/RRULE lib (rrule.js `fromText`) - English-only, maps to its own grammar not ours.
  - **Chosen:** (b). chrono is the battle-tested standard, lightweight (1 package added), and its `parse()` returns the matched span+index - exactly what highlighting and title-stripping need. Recurrence stays hand-rolled because chrono doesn't do it and our RRULE grammar is bounded (we control the mapping). Tokens (`#`/`@`/`pN`) are trivial regex.
  - **Trade-offs accepted:** first frontend runtime dependency. Justified: date-NL is the textbook "don't reinvent" case, and the project's "avoid unnecessary frameworks" rule explicitly allows a clear-benefit dependency.
  - **Research citation:** [todoist-quick-add-2026-05-27.md](../research/todoist-quick-add-2026-05-27.md)

- **Decision 2: Frontend-only.** The parser resolves `#project`/`@label` against the lists `AddTaskForm` already loads and feeds the existing `onAdd(title, deadline?, projectId?, labelIds?, priority?, recurrence?)` flow (labels auto-create as today). No backend change. MCP is untouched - Claude already turns a phrase into an RRULE/fields via the v2.14.x tool descriptions, so the natural-language gap only exists in the web UI (no LLM there).

- **Decision 3: Date-only vs timed via chrono's `isCertain('hour')`.** A phrase with no explicit time ("friday") becomes a date-only deadline (`YYYY-MM-DD`, the backend midnight=date-only convention from v2.12.0); an explicit time ("friday at 3pm") becomes a timed deadline (`YYYY-MM-DDTHH:mm`). Avoids chrono's implied-time noise.

- **Decision 4: AddTaskForm only.** Quick-add is a creation affordance. EditTaskModal keeps its structured fields. The structured controls on the add form stay (pre-filled from the parse) as confirmation + override + a path for anything the parser misses.

- **Decision 5: Unknown `#`/`@` are left in the title.** If `#Foo` matches no project, the token isn't stripped - a stray `#` never silently eats text. Labels still auto-create (existing behavior) since the form already creates labels on the fly.

<!-- GUIDELINES CHECK: First frontend runtime dependency (chrono-node) - note in engineering-guidelines with the date-NL justification. New pure-helper lib quickAdd.ts mirrors the format.ts pure-function precedent. Live-highlight backdrop-overlay is a new UI pattern - note it. product-design gains a NL quick-add creation flow. Minor (new capability), no migration. SCOPE FLAG: this re-scopes the program's "v2.14.2 NL recurrence" into a bigger quick-add feature (now v2.15.0); habit-tracking shifts to v2.16.0 - update proposal-recurring-and-habits.md. -->

## Token grammar (Tasklog subset of Todoist quick-add)

```
#name        -> project (resolve against loaded projects, case-insensitive; unknown = left in title)
@name        -> label   (resolve or auto-create; multiple allowed)
p1..p4       -> priority
<date NL>    -> deadline (chrono; date-only unless an explicit time)   e.g. "tomorrow", "friday", "jan 27", "in 3 days"
every ...    -> recurrence rule (hand-rolled -> v2.14.x RRULE)         e.g. "every weekday", "every other monday", "every 27th", "the 3rd thursday", + "until <date>" / "<N> times"
```
Dropped (no Tasklog field): `+assignee`, `!reminder`, `/section`.

## Tasks

- [ ] 🟥 **Step 1: Pure parser - `quickAdd.ts` + recurrence-phrase helper + tests** `[sequential]` → depends on: nothing
  - [ ] 🟥 1.1 `frontend/src/lib/quickAdd.ts`: `parseQuickAdd(text, { projects, labels }, refDate?)` → `{ cleanedTitle, deadline?, recurrence?, projectName?, labelNames?, priority?, tokens[] }`. Token regexes for `#`/`@`/`pN` (record spans); chrono.parse for the date (span + `isCertain('hour')` → date-only vs timed); strip recognized spans → cleanedTitle.
  - [ ] 🟥 1.2 `parseRecurrencePhrase(text, refDate?)` (in quickAdd.ts or format.ts) covering the bounded v2.14.x grammar: every day / every N days / every weekday / every `<weekday(s)>` / every other `<weekday>` / every N weeks / every month / every N months / on the `<N>th` / the `<N>th|last <weekday>` / last day / `until <date>` (chrono → UNTIL) / `<N> times` (→ COUNT). Emits canonical RRULE.
  - [ ] 🟥 1.3 Tests: each token type, combinations, date-only vs timed (injected refDate for determinism), every recurrence phrase → expected RRULE, cleanedTitle stripping, unknown `#`/`@` left in title.

- [ ] 🟥 **Step 2: AddTaskForm - parse-on-submit + field pre-fill + autosuggest** `[sequential]` → depends on: Step 1 `[UI]`
  - [ ] 🟥 2.1 On submit, run `parseQuickAdd`; resolve `projectName` against loaded projects (unknown → ignore the match, keep in title); resolve/auto-create `labelNames` (reuse the existing label-create logic); set deadline/recurrence/priority; call `onAdd` with the cleaned title + parsed fields. Pre-fill the structured controls from the parse so they show what was captured (and can override).
  - [ ] 🟥 2.2 Autosuggest: when the caret sits inside a `#…`/`@…` token being typed, show a dropdown of matching projects/labels (reuse the existing label-autocomplete dropdown pattern). Selecting completes the token in the title.

- [ ] 🟥 **Step 3: Live inline highlighting overlay** `[sequential]` → depends on: Step 2 `[UI]`
  - [ ] 🟥 3.1 Backdrop-overlay: a `position:absolute` div behind a transparent-text input/textarea, font/padding/scroll matched, rendering the title with recognized spans wrapped in colored `<span>`s (date/recurrence, `#project`, `@label` in the label color, `pN` in the priority color). Re-parse + re-render on each keystroke.
  - [ ] 🟥 3.2 Click a highlighted token to unlink it (mark that span ignored → treated as plain text). Accessible (the input stays the real control; overlay is `aria-hidden`).
  - [ ] 🟥 3.3 **Risk note:** the overlay is the fiddly part. If it proves too unreliable in the time available, ship Steps 1-2 (parse-on-submit + autosuggest) and split the live highlight to a follow-up - FLAG to the user, do not silently drop.

- [ ] 🟥 **Step 4: Docs + CHANGELOG + program re-letter** `[sequential]` → depends on: Steps 1-3
  - [ ] 🟥 4.1 `engineering-guidelines.md`: first frontend dep (chrono-node) + the backdrop-overlay pattern. `product-design.md`: NL quick-add creation flow. `architecture.md`: chrono-node dep + `quickAdd.ts` in the tree/components note.
  - [ ] 🟥 4.2 `CHANGELOG.md`: v2.15.0 section. `coverage.md`: counts + checklists. `proposal-recurring-and-habits.md`: insert NL quick-add as v2.15.0, re-letter habit-tracking to v2.16.0.

- [ ] 🟥 **Step 5: Deploy + smoke test + ship** `[sequential]` → depends on: Step 4
  - [ ] 🟥 5.1 Tree should be clean (doppel committed); check for any new user WIP first and stash-deploy-pop only if present. Deploy. No migration - confirm live task count unchanged.
  - [ ] 🟥 5.2 Web smoke: in the add form, type `Buy milk tomorrow #Personal @errand p2 every week` → verify the saved task has tomorrow's deadline, the Personal project, the errand label, P2, a weekly recurrence, and a clean "Buy milk" title; tokens highlighted while typing. Clean up.
  - [ ] 🟥 5.3 DEFERRED user spot-check (non-blocking): try several phrases in the browser; confirm the highlight + autosuggest feel right.

## Outcomes

<!-- Fill in after execution: decision-relevant deltas only. What changed vs. planned? Key decisions made? Assumptions invalidated? -->
