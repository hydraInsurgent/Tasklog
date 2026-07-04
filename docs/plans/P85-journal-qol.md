# P85 Journal QoL - Implementation Plan

**Overall Progress:** `90%`

## TLDR
Two contained journal improvements: (1) replace the all-130-at-once feelings wheel with a drill-down wheel - focused single-path zoom (each level fills the whole circle), tap navigates / center picks / leaves pick on tap, stay-put after pick + one-tap "all" return for cross-family multi-select, bigger on desktop; (2) tapping a task in Today's Plan or Unplanned opens the existing TaskDetailModal (chained to TaskSheet for full edit) right in the journal. Design settled via interactive mockup (artifact 0834b7b8) - stage-multi-select variant rejected (union stages recrowd the wheel).

## Critical Decisions
- Drill-down interaction: Mode A foundation (tap = navigate, center = pick, leaf = pick) + cheap multi-select (stay put after pick; "all" breadcrumb = one tap to cores; "add another?" hint after first pick). Focused descent fits journaling: naming one feeling at a time.
- Selection stays path-keyed ({key, name, moc}); deriveMoc/mocBand unchanged; own-words field and chips unchanged.
- Wheel size: ~560px viewBox rendered up to 560px on desktop (modal max-w grows), full-width mobile. Zoom = CSS scale/fade crossfade between levels (reduced-motion: instant swap).
- Task open: reuse TaskDetailModal + TaskSheet exactly as TasksClient chains them; JournalClient adds labels fetch + openingTask/editingTask state; onSaved reconciles the journal's tasks list. No new task UI.

## Tasks

- [x] 🟩 **Step 1: Drill-down wheel** `[sequential]`
  - [x] 🟩 Rework FeelingsWheelModal: level-based rendering (path state), full-circle levels, center-pick, breadcrumb + back + "all" return, zoom crossfade (reduced-motion safe), "N deeper ›" cues, add-another hint, desktop 560px
- [x] 🟩 **Step 2: Task sheet from plan** `[sequential]` → depends on: Step 1 (same files as JournalClient wiring)
  - [x] 🟩 PlanSection: task titles open the task (button + aria); Unplanned rows too
  - [x] 🟩 JournalClient: labels fetch, TaskDetailModal + TaskSheet chaining, onSaved reconciliation
- [x] 🟨 **Step 3: Verify** `[sequential]` → depends on: Steps 1, 2
  - [x] 🟨 tsc + jest green (6 new wheel tests); live device check pending user + production build; live check on dev server (desktop + phone)

## Outcomes
<!-- fill after execution -->
