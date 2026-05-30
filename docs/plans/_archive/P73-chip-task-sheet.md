# Feature Implementation Plan: UI uplift (tokens + chip sheet + board views)

**Overall Progress:** `100%` (built + reviewed by the user on the LAN dev server; shipping. Habits v2 Step 2 - frequency + deadline-decouple - deferred to a separate feature.)

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

- [x] 🟩 **Step 1 [UI]: Stage A - token foundation + primitives** `[sequential]` → depends on: nothing (foundation)
  - [x] 🟩 1.1 Added the semantic color tokens to `globals.css` `@theme` (+ `--color-primary`/`--color-primary-hover` for the dark button, synced into the UI-SPEC). `body` uses the tokens. Light only.
  - [x] 🟩 1.2 Swapped ~470 of ~486 color classes to token utilities across 24 files (neutrals, accent, primary button, focus rings unified to `ring-accent`, destructive reds → `danger`). DELIBERATELY left literal: success/error feedback banners (green-700/red-700 on -50 tints are AA-correct; tokenizing onto the tint would fail AA), `text-zinc-300` light placeholders, `text-zinc-600` AA-safe muted, the `bg-blue-100` quick-add tint. Closes part of #4 (focus-ring unification + contrast guard).
  - [x] 🟩 1.3 Ported `Chip.tsx` (already token-named in Business; verbatim + cursor-pointer).
  - [x] 🟩 1.4 Ported `PickerSheet.tsx` (popover/bottom-sheet, portal, focus mgmt, flip, scroll-lock) + `useKeyboardHeight.ts` into `src/hooks/`. NOTE: their `animate-in`/`zoom-in-95` classes need `tw-animate-css` (not wired yet) - inert for now since unused until Stage B; wire or swap to CSS transition in Stage B.
  - [x] 🟩 1.5 tsc clean; 127 jest tests pass; new ports lint-clean except the pre-existing-pattern `set-state-in-effect` rule (non-gating, matches existing code). Visual smoke is the user's pause-point (`npm run dev`).

- [x] 🟩 **Step 2 [UI]: Stage B - chip-driven TaskSheet (create + edit) + calendar picker** `[sequential]` → depends on: Step 1
  - [x] 🟩 2.1 `DueDatePicker` (new, `pickers/`): quick chips (reuse `resolvePreset`) + month grid + optional time. Due-date only (dropped Business's cron coupling). Also `pickers/_shared.ts`, `PriorityPicker`, `ProjectPicker`, `LabelPicker` (multi-select + create-on-Enter).
  - [x] 🟩 2.2 `TaskSheet` (modal / keyboard-aware bottom-sheet) for create + edit. Title = `QuickAddInput`; chip row (due/priority/project/label/recurrence) each opening a `PickerSheet` picker (recurrence wraps the existing `RecurrencePicker`); habit checkbox. Reuses quick-add parse on create + `EditTaskModal`'s diff-on-save on edit.
  - [x] 🟩 2.3 Wired into `TasksClient` (+ `ProjectLayout`): both "+ Add Task" buttons open the create sheet (`creating` lifted to `ProjectLayout`); edit pencil opens it for edit; `handleSheetSaved` prepends/replaces. Deleted `AddTaskForm` + `EditTaskModal` (+ AddTaskForm.test).
  - [x] 🟩 2.4 Dependency-free `tl-pop`/`tl-slide-up`/`tl-fade` keyframes (reduced-motion guarded) replace the tw-animate-css classes. Fixed a Stage A gap: `bg-white` → `bg-surface` (19 files). tsc clean; 121 jest pass (127 − 6 deleted AddTaskForm tests; TaskSheet tests are Step 4); lint clean apart from the known `set-state-in-effect` rule.

- [x] 🟩 **Step 3 [UI]: Stage C - view-mode axis (board ⇄ list) + group-by + per-view persistence** `[sequential]` → depends on: Steps 1, 2
  - [x] 🟩 3.1 `viewMode`/`groupBy` state in `ProjectLayout`, persisted PER VIEW in `localStorage` (key `tasklog_view_config`); passed down to `TasksClient`.
  - [x] 🟩 3.2 `TasksClient`: `filteredTasks`/`visibleTasks` untouched; renderer branches on `viewMode` (list = table/cards, board = `BoardView`).
  - [x] 🟩 3.3 `BoardView` + columns via pure `lib/board.ts` `groupTasksForBoard` (due/project/priority; due+priority fixed columns, project = non-empty; soonest-deadline-first within a column - see review note in board.ts re "most-recent-due-first" wording); fixed-width horizontally-scrollable; header = accent dot + name + count. Mobile defaults to list.
  - [x] 🟩 3.4 Board card = Rich variant: `BoardCard` (shadow + due-bucket tint + priority pill + done/check-in control + labels + deadline + recurring/habit glyphs; hover delete).
  - [x] 🟩 3.5 List|Board segmented toggle + group-by dropdown in the `TasksClient` header; filtering reuses `FilterPanel`.
  - [x] 🟩 3.6 tsc + 131 jest + css green. **`npm run dev` visual smoke is the user's review step** (not run here).

- [x] 🟩 **Step 4 [UI]: Unit tests** `[sequential]` → depends on: Steps 1-3
  - [x] 🟩 4.x Added `board.test.ts` (grouping by due/project/priority + ordering) + `TaskDoneControl.test.tsx` (checkbox vs habit check-in). Sheet/board/panel render-integration is left to the user's manual review (pure helpers cover the logic). 131 frontend tests green.

- [x] 🟩 **Step 3.5: Habits v2 (Step 1) - folded into #73** `[sequential]` → depends on: Step 2
  > **Scope note:** expands #73 beyond pure UI into a habit-behavior fix (user decision, 2026-05-28). Fixes the v2.16.0 defect (a habit could be completed/closed while still showing on the Habits page). **Frequency ("x times a week") deferred** to Habits v2 Step 2. Done inline on this branch.
  - [x] 🟩 3.5a Backend: `RecurrenceRule.OccursOn(date)` + schedule-aware `HabitStreak` (optional recurrence; daily = prior behavior); `HabitsController` passes each habit's recurrence. +5 tests, 250 backend green.
  - [x] 🟩 3.5b Habit rows show a flame badge + a check-in toggle (amber→green) instead of the complete checkbox (`TaskDoneControl`, used by list/card/board). Habits aren't completable.
  - [x] 🟩 3.5c `HabitsPanel` (right-side, desktop lg+) sharing habit state with `ProjectLayout`; `/habits` page kept. `HabitCard` shows the schedule.
  - [x] 🟩 3.5d Recurrence on a habit = its schedule, set via the edit sheet; streak respects it.

- [x] 🟩 **Step 5 [UI]: Docs + CHANGELOG** `[sequential]` → depends on: Steps 1-4
  - [x] 🟩 5.x `CHANGELOG.md` (Unreleased section), `architecture.md` (services + components), `product-design.md` (habits not completable / board / schedules), `coverage.md` (counts 250/131/97). NOT done (left for the user / proper /document at ship): `engineering-guidelines.md` deep update + reconciling the global `UI-SPEC.md` colors.

- [x] 🟩 **Step 6 [UI]: Ship** `[sequential]` → depends on: Step 5
  - [x] 🟩 6.1 User reviewed the full staged diff + validated on the LAN dev server (mobile + desktop) across several iterations.
  - [x] 🟩 6.2 Live validation done by the user on the dev server: chip sheet create/edit, `!` priority, Escape/tap dismiss, board toggle + group-by + per-view persistence, habit check-in (turns green) + move-from-day, mobile habits drawer, schedule-aware streak + "not due today".
  - [x] 🟩 6.3 `/ship` (MINOR bump, v2.17.0). Production-phone deploy is a post-merge op (frontend-only, no migration); the doppel release-package CI remains the user's separate WIP.

## Outcomes

<!-- Fill in after execution: decision-relevant deltas only. What changed vs. planned? Key decisions made? Assumptions invalidated? -->
