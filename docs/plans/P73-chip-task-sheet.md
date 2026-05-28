# Feature Implementation Plan: UI uplift (tokens + chip sheet + board views)

**Overall Progress:** `0%`

**Tracking issue:** [#73](https://github.com/hydraInsurgent/Tasklog/issues/73)
**Branch:** `feature/chip-task-sheet-#73`
**Target version:** MINOR (new capability, no migration) - decided at `/ship` time, not now.

## TLDR

Port Tasklog Business's nicer UI into our personal app, in three internal stages under one feature: (A) a light-only semantic CSS-variable **token foundation** + the `Chip`/`PickerSheet` primitives, (B) a **chip-driven create/edit `TaskSheet`** (modal desktop / keyboard-aware bottom-sheet mobile) + a calendar `DueDatePicker`, replacing the inline add form and edit modal, and (C) a **view-mode axis** - a board ⇄ list toggle with group-by, the board grouping by due bucket off the existing `dueStatus`. Frontend-only, no migration. The apps are stack-twins, so this is a port, not a redesign.

## Goal State

**Current State:** Hardcoded `zinc-*`/`blue-600` colors across ~25 files; an inline `AddTaskForm` row + a separate `EditTaskModal`; a desktop table + mobile cards switched purely by CSS breakpoint (no view-mode concept); `activeView` conflates scope with presentation.

**Goal State:** Semantic tokens drive all color (dark mode a later drop-in). Create/edit happens in one chip-driven `TaskSheet`. A `viewMode` axis sits orthogonal to scope/filter: "list" = today's table/cards, "board" = due-bucket columns - built so calendar/today view modes slot in later without touching filtering.

## Critical Decisions

- **Decision 1: Two orthogonal axes - scope/filter (existing) vs view-mode (new).** **[high-stakes - the architectural backbone]**
  - **Options considered:** (a) bolt a board renderer onto `TasksClient` keyed off the existing `activeView`; (b) introduce a separate `viewMode` axis, leaving the scope+filter computation (`activeView` + `FilterPanel` -> `filteredTasks`) entirely untouched and branching only the renderer.
  - **Chosen:** (b). Scope ("which tasks": all/inbox/project + FilterPanel) and view-mode ("how shown": list/board, later calendar/today) are genuinely different concerns. Keeping them separate means `filteredTasks`/`visibleTasks` stay as-is and each future view is just another `viewMode` branch consuming the same array.
  - **Trade-offs accepted:** one more piece of state to thread (`viewMode` + `groupBy` from `ProjectLayout` -> `TasksClient`) and per-view persistence to manage. Worth it - it's what makes the future views cheap.

- **Decision 2: One `TaskSheet` replaces both `AddTaskForm` (inline) and `EditTaskModal`.** Create and edit share the same chip-driven sheet (modal desktop / bottom-sheet mobile). Reduces surface and gives a consistent interaction; trade-off is we must re-test BOTH create and edit flows against the new component. The title field stays our existing `QuickAddInput` (v2.15.0 parsing preserved); chips sit on top.

- **Decision 3: Board card = Rich (Business-style).** Shadow + due-bucket bg tint + priority pill (user's pick, UI-SPEC 4d). Port + trim Business's `TaskCard`, dropping its Business-only bits (avatars, status workflow, work-session, stakeholder badges) since our tasks are tickable-only. The **list view keeps today's table/cards unchanged** - the rich card is board-only.

- **Decision 4: Per-view view-config persisted in `localStorage`, keyed by `activeView`.** So "Work" can remember board+by-priority while "Personal" keeps list+by-due. Distinct from `filterState` (which uses `sessionStorage`) - chosen `localStorage` for durability across browser restarts, since a view preference is a longer-lived choice than a transient filter.

- **Decision 5: Accent stays blue-600 `#2563EB` (not Business's blue-500); semantic colors use -600 text + -50 tints.** Both for WCAG AA (blue-500 and the -500 semantic family fail AA as text on white). Closes part of deviation #4. (See UI-SPEC sec 1.)

- Decision 6: Frontend-only, NO migration, NO backend/MCP changes - all data already exists (`deadline`, `priority`, `projectId`, `labels`, `recurrence`, `isHabit`, server-computed `dueStatus`).

- Decision 7: Build in 3 internal stages (A/B/C), each independently smoke-testable, shipped together as one #73.

<!-- GUIDELINES CHECK:
  - NEW frontend PATTERNS introduced: a view-mode abstraction (orthogonal to scope/filter), portal-based primitives (`Chip`, `PickerSheet`), `useKeyboardHeight`, and client-side grouping. Add to engineering-guidelines.md on ship (Step 5).
  - PRODUCT-FIT: board + multiple view modes expands the product beyond a "list app". product-design.md must be updated on ship (user has approved this direction).
  - DEVIATION: closes part of #4 (contrast/focus below WCAG AA) via the token foundation + the contrast guard + focus rings on every new control.
  - First frontend port from a sibling project (Tasklog Business) - noted, not a new dependency (no new npm packages; primitives are hand-rolled, same as Business). -->

## UI Specification

Design tokens, component specs, mockups, and accessibility rules: [UI-SPEC-P73-chip-task-sheet.md](UI-SPEC-P73-chip-task-sheet.md) (inherits the global [../../UI-SPEC.md](../../UI-SPEC.md)). `/execute` reads that spec, not the `.claude/ui-reference/` files. The board card is decided (Rich); no open design inputs remain.

## Tasks

<!-- All sequential: each stage builds on the prior. Every step is [UI]. -->

- [ ] 🟥 **Step 1 [UI]: Stage A - token foundation + primitives** `[sequential]` → depends on: nothing (foundation)
  - [ ] 🟥 1.1 Add the semantic color tokens to `frontend/src/app/globals.css` `@theme` (literal block in UI-SPEC sec 1): bg/surface/surface-raised/text-primary/text-muted/border/border-muted/accent/accent-hover/success(+bg)/warning(+bg)/danger(+bg). Light only; update the `body` base colors to use them. Dark mode deferred (names semantic for a later `.dark` drop-in).
  - [ ] 🟥 1.2 Incrementally swap hardcoded `zinc-*`/`blue-600`/`green`/`red`/`amber` classes (~486 across ~25 files) to token utilities (`bg-surface`, `text-text-muted`, `border-border`, `text-accent`, `bg-danger-bg`, ...). Apply the contrast guard: muted body text on `surface` not `bg`; zinc-600 for captions on the gray bg. (Closes part of #4.)
  - [ ] 🟥 1.3 Port `Chip.tsx` from Business (token-mapped): pill, 44px target, focus ring, empty/has-value/active states.
  - [ ] 🟥 1.4 Port `PickerSheet.tsx` (responsive popover ≥640 / bottom-sheet <640, portal, focus trap, flip-above, scroll-lock, return-focus-to-trigger) + `useKeyboardHeight.ts` (visualViewport) into `src/hooks/`.
  - [ ] 🟥 1.5 Verify: `npx tsc --noEmit` clean, `npx jest` green, lint clean on new/changed files; visual smoke (`npm run dev`) - colors unchanged-looking, no regressions.

- [ ] 🟥 **Step 2 [UI]: Stage B - chip-driven TaskSheet (create + edit) + calendar picker** `[sequential]` → depends on: Step 1
  - [ ] 🟥 2.1 Port + adapt Business's `DueDatePicker` (quick chips Today/Tomorrow/Next week/No date + month grid; adapt to our `deadline` ISO + midnight=date-only model; drop Business's recurrence-in-picker coupling - we keep our own `RecurrencePicker`).
  - [ ] 🟥 2.2 Build `TaskSheet` (modal ≥640 / keyboard-aware bottom-sheet <640) for BOTH create and edit. Title = existing `QuickAddInput`; chip row for due/priority/project/label/recurrence (each opening a picker in a `PickerSheet`); keep the "Track as a daily habit" checkbox. Reuse: the v2.15.0 quick-add parse on submit, label resolve/create, the `EditTaskModal` diff-on-save, `PRIORITY_OPTIONS`/`labelColor`.
  - [ ] 🟥 2.3 Wire in: replace the inline `AddTaskForm` (bottom of `TasksClient`) + `EditTaskModal`. The "+ Add Task" buttons (`TasksClient` header + `ProjectLayout` mobile header) open the sheet for create (instead of scroll-to-input); `setEditingTask(task)` opens it for edit.
  - [ ] 🟥 2.4 Verify: create flow (incl. quick-add tokens + habit) and edit flow (diff/clear/set) both work; tsc/jest/lint green; `npm run dev` smoke on desktop + a narrow viewport.

- [ ] 🟥 **Step 3 [UI]: Stage C - view-mode axis (board ⇄ list) + group-by + per-view persistence** `[sequential]` → depends on: Steps 1, 2
  - [ ] 🟥 3.1 Add `viewMode` ("list"|"board") + `groupBy` ("due"|"project"|"priority") state in `ProjectLayout`, persisted PER VIEW in `localStorage` keyed by `activeView`; pass down to `TasksClient`.
  - [ ] 🟥 3.2 `TasksClient`: leave `filteredTasks`/`visibleTasks` UNTOUCHED; branch only the renderer on `viewMode` - "list" = today's table/cards, "board" = `BoardView`.
  - [ ] 🟥 3.3 `BoardView` + `BoardColumn`: group `visibleTasks` by `groupBy` (due-bucket off `dueStatus` = Overdue/Today/This week/Later/No date; project = projectId→name; priority = 1-4), most-recent-due-first within a column, fixed-width horizontally-scrollable columns (~3.5 visible), header = name + count + per-bucket token accent. Mobile DEFAULTS to list (board opt-in).
  - [ ] 🟥 3.4 Board card = Rich variant (UI-SPEC 4d): port+trim Business `TaskCard` - shadow + due-bucket bg tint + priority pill + complete tick + labels + deadline; reuse `PriorityDot`/`RecurringBadge`/`labelColor`/`deadlineColorClass`.
  - [ ] 🟥 3.5 View-mode toggle (segmented List|Board) + group-by dropdown in the `TasksClient` header near the filter button; filtering REUSES the existing `FilterPanel` (no new filter-query language).
  - [ ] 🟥 3.6 Verify: toggle + group-by + per-view persistence (switch views, reload, config sticks); board grouping correct; list view unchanged; tsc/jest/lint green; `npm run dev` smoke incl. the board horizontal scroll on mobile.

- [ ] 🟥 **Step 4 [UI]: Unit tests** `[sequential]` → depends on: Steps 1-3
  - [ ] 🟥 4.1 `Chip` (states + a11y) + `PickerSheet` (open/close, focus) render tests.
  - [ ] 🟥 4.2 `TaskSheet` create + edit (quick-add parse, chip values, habit toggle, diff-on-save); `DueDatePicker` quick chips + grid selection.
  - [ ] 🟥 4.3 `BoardView` grouping (by dueStatus buckets / project / priority; most-recent-due ordering; empty column) + a pure helper test if grouping is extracted to `lib/`.
  - [ ] 🟥 4.4 Per-view persistence (localStorage key per view, restore on mount). Run full frontend suite green.

- [ ] 🟥 **Step 5 [UI]: Docs + CHANGELOG** `[sequential]` → depends on: Steps 1-4
  - [ ] 🟥 5.1 `architecture.md`: the view-mode axis, new components (`TaskSheet`, `Chip`, `PickerSheet`, `DueDatePicker`, `BoardView`/`BoardColumn`, board card), `useKeyboardHeight`, the token system, and that `AddTaskForm`/`EditTaskModal` were replaced.
  - [ ] 🟥 5.2 `product-design.md`: tasks can be viewed as a board (view modes); `engineering-guidelines.md`: the view-mode pattern + portal primitives + token system (and note #4 partially closed); `CHANGELOG.md`: the version section; `coverage.md`: counts + checklists; reconcile the global `UI-SPEC.md` semantic colors to the AA-safe values.

- [ ] 🟥 **Step 6 [UI]: Deploy + smoke + ship** `[sequential]` → depends on: Step 5
  - [ ] 🟥 6.1 Check phone reachable + capture task count. Deploy. Confirm no data change (frontend-only, no migration).
  - [ ] 🟥 6.2 Live smoke on the phone: create via the sheet, edit via the sheet, toggle to board, group-by switch, per-view persistence across a reload, on desktop + mobile.
  - [ ] 🟥 6.3 `/ship` (MINOR bump).

## Outcomes

<!-- Fill in after execution: decision-relevant deltas only. What changed vs. planned? Key decisions made? Assumptions invalidated? -->
