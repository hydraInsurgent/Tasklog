# Feature Implementation Plan: UI uplift (tokens + chip sheet + board views)

**Overall Progress:** `40%`

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

- [ ] 🟨 **Step 3.5: Habits v2 (Step 1) - folded into #73** `[sequential]` → depends on: Step 2
  > **Scope note:** this expands #73 beyond pure UI into a habit-behavior fix (user decision, 2026-05-28). It fixes a real v2.16.0 defect (a habit could be "completed"/closed in the list while still showing on the Habits page - two disconnected "done" states) and adds the parts the user wants. **Frequency ("x times a week") is deferred** to a later Habits v2 Step 2 (not UI). Done inline on this branch.
  - [ ] 🟥 3.5a Backend: `RecurrenceRule.OccursOn(date)` (schedule membership) + make `HabitStreak.CurrentStreak` **schedule-aware** (optional recurrence arg: count consecutive *scheduled* days checked in; non-scheduled days skipped; no rule = daily = current behavior). `HabitsController` passes each habit's recurrence. Tests.
  - [ ] 🟥 3.5b Frontend - habit is never completed/closed: in the list, a habit row shows a **badge** (distinguishable) and its complete-checkbox becomes a **check-in toggle** (done-today), not a close. Reuse the habit check-in data.
  - [ ] 🟥 3.5c Frontend - a **right-side Habits panel** beside the task list (streak + done-today toggle), so check-in doesn't require the separate page. Keep `/habits` page for now.
  - [ ] 🟥 3.5d A habit can carry a **recurrence (= its schedule)**, set via the normal edit sheet (clicking a habit opens it). Streak respects it (3.5a). Verify; tests; tsc/jest/css green.

- [ ] 🟥 **Step 5 [UI]: Docs + CHANGELOG** `[sequential]` → depends on: Steps 1-4
  - [ ] 🟥 5.1 `architecture.md`: the view-mode axis, new components (`TaskSheet`, `Chip`, `PickerSheet`, `DueDatePicker`, `BoardView`/`BoardColumn`, board card), `useKeyboardHeight`, the token system, and that `AddTaskForm`/`EditTaskModal` were replaced.
  - [ ] 🟥 5.2 `product-design.md`: tasks can be viewed as a board (view modes); `engineering-guidelines.md`: the view-mode pattern + portal primitives + token system (and note #4 partially closed); `CHANGELOG.md`: the version section; `coverage.md`: counts + checklists; reconcile the global `UI-SPEC.md` semantic colors to the AA-safe values.

- [ ] 🟥 **Step 6 [UI]: Deploy + smoke + ship** `[sequential]` → depends on: Step 5
  - [ ] 🟥 6.1 Check phone reachable + capture task count. Deploy. Confirm no data change (frontend-only, no migration).
  - [ ] 🟥 6.2 Live smoke on the phone: create via the sheet, edit via the sheet, toggle to board, group-by switch, per-view persistence across a reload, on desktop + mobile.
  - [ ] 🟥 6.3 `/ship` (MINOR bump).

## Outcomes

<!-- Fill in after execution: decision-relevant deltas only. What changed vs. planned? Key decisions made? Assumptions invalidated? -->
