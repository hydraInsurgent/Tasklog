# Feature Implementation Plan: Natural-language quick-add

**Overall Progress:** `70%`

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

- [x] 🟩 **Step 1: Pure parser - `quickAdd.ts` + recurrence-phrase helper + tests** `[sequential]` → depends on: nothing
  - [x] 🟩 1.1 `quickAdd.ts` `parseQuickAdd(text, projects, refDate?)`: recurrence-first (so "every friday" isn't taken as a one-off date), then chrono date (span + `isCertain('hour')` → date-only vs timed), then `#`/`@`/`pN` token regexes; masks claimed spans; `cleanedTitle` = stripped + collapsed.
  - [x] 🟩 1.2 `matchRecurrence` (hand-rolled, ordered matchers) onto the v2.14.x grammar: daily / every-N-days / weekday / `<weekday-list>` / every-other / every-N-weeks / weekly / every-N-months / nth-weekday / last-day / day-of-month / monthly, + `until <date>`→UNTIL / `[for] N times`→COUNT. Emits canonical RRULE.
  - [x] 🟩 1.3 26 tests (tokens, known/unknown project, dates date-only vs timed + absolute + offset, every recurrence form, end conditions, combined line, spans). **107 frontend tests pass** (was 81).

- [x] 🟩 **Step 2: AddTaskForm - parse-on-submit** `[sequential]` → depends on: Step 1 `[UI]`
  - [x] 🟩 2.1 On submit, `parseQuickAdd(title, projects)`; merge with the structured controls (a parsed token wins; otherwise the control's value): deadline / recurrence (default anchor = today if a recurrence has no date) / priority / `#project` (resolved to id) / `@label`s (resolved-or-created via a shared `resolveOrCreateLabel`, deduped with picked labels); `onAdd(cleanedTitle, ...)`. Plain titles fall straight through to the controls (transparent). +1 integration test (6 AddTaskForm tests).
  - [~] regrouped: `#`/`@` autosuggest moved into Step 3 - it shares the title-field caret/overlay machinery with the live highlight, so they're built together.

- [x] 🟩 **Step 3: `QuickAddInput` - live highlight overlay + autosuggest + captured chips** `[sequential]` → depends on: Step 2 `[UI]`
  - [x] 🟩 3.1 New `QuickAddInput.tsx`: backdrop div (transparent text + tint rectangles behind token spans, by type) behind a transparent-bg input, metrics matched, horizontal-scroll synced; re-parses each render. Swapped into AddTaskForm's title field.
  - [x] 🟩 3.2 `#`/`@` autosuggest dropdown (reuses the label-autocomplete pattern) with keyboard nav (↑/↓ + Enter selects instead of submitting, Esc closes) + mouse.
  - [x] 🟩 3.3 Click-to-unlink delivered as a **captured-chips row** below the field: each token shown with its type ("Repeat"/"Due"/"Project"/"Label"/"Priority") + an ✕ to remove it. Doubles as confirmation a repeat was captured (user feedback); avoids the contenteditable rewrite. 115 frontend tests (+7 QuickAddInput).

- [ ] 🟥 **Step 4: Docs + CHANGELOG + program re-letter** `[sequential]` → depends on: Steps 1-3
  - [ ] 🟥 4.1 `engineering-guidelines.md`: first frontend dep (chrono-node) + the backdrop-overlay pattern. `product-design.md`: NL quick-add creation flow. `architecture.md`: chrono-node dep + `quickAdd.ts` in the tree/components note.
  - [ ] 🟥 4.2 `CHANGELOG.md`: v2.15.0 section. `coverage.md`: counts + checklists. `proposal-recurring-and-habits.md`: insert NL quick-add as v2.15.0, re-letter habit-tracking to v2.16.0.

- [ ] 🟥 **Step 5: Deploy + smoke test + ship** `[sequential]` → depends on: Step 4
  - [ ] 🟥 5.1 Tree should be clean (doppel committed); check for any new user WIP first and stash-deploy-pop only if present. Deploy. No migration - confirm live task count unchanged.
  - [ ] 🟥 5.2 Web smoke: in the add form, type `Buy milk tomorrow #Personal @errand p2 every week` → verify the saved task has tomorrow's deadline, the Personal project, the errand label, P2, a weekly recurrence, and a clean "Buy milk" title; tokens highlighted while typing. Clean up.
  - [ ] 🟥 5.3 DEFERRED user spot-check (non-blocking): try several phrases in the browser; confirm the highlight + autosuggest feel right.

## Outcomes

<!-- Fill in after execution: decision-relevant deltas only. What changed vs. planned? Key decisions made? Assumptions invalidated? -->
