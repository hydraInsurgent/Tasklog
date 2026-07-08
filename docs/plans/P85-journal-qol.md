# P85 Journal QoL - Implementation Plan

**Overall Progress:** `100%`

## TLDR
Two contained journal improvements: (1) replace the all-130-at-once feelings wheel with a drill-down wheel - focused single-path zoom (each level fills the whole circle), tap navigates / center picks / leaves pick on tap, stay-put after pick + one-tap "all" return for cross-family multi-select, bigger on desktop; (2) tapping a task in Today's Plan or Unplanned opens the existing TaskDetailModal (chained to TaskSheet for full edit) right in the journal. Design settled via interactive mockup (artifact 0834b7b8) - stage-multi-select variant rejected (union stages recrowd the wheel).

## Critical Decisions
- Drill-down interaction: Mode A foundation (tap = navigate, center = pick, leaf = pick) + cheap multi-select (stay put after pick; "all" breadcrumb = one tap to cores; "add another?" hint after first pick). Focused descent fits journaling: naming one feeling at a time.
- Selection stays path-keyed ({key, name, moc}); deriveMoc/mocBand unchanged; own-words field and chips unchanged.
- Wheel size: ~560px viewBox rendered up to 560px on desktop (modal max-w grows), full-width mobile. Zoom = CSS scale/fade crossfade between levels (reduced-motion: instant swap).
- Task open: reuse TaskDetailModal + TaskSheet exactly as TasksClient chains them; JournalClient adds labels fetch + openingTask/editingTask state; onSaved reconciles the journal's tasks list. No new task UI.

## Tasks

- [x] 🟩 **Step 1b (added): Hints + MoC ladder** - differentiating gloss on all 123 secondaries/tertiaries (hint field, dataset test); MocLadderWidget (log-scaled vertical ladder, major anchors labeled + minor dots, courage line, today marker from day picks, lens-not-measurement microcopy) in rail + drawer

- [x] 🟩 **Step 1: Drill-down wheel** `[sequential]`
  - [x] 🟩 Rework FeelingsWheelModal: level-based rendering (path state), full-circle levels, center-pick, breadcrumb + back + "all" return, zoom crossfade (reduced-motion safe), "N deeper ›" cues, add-another hint, desktop 560px
- [x] 🟩 **Step 2: Task sheet from plan** `[sequential]` → depends on: Step 1 (same files as JournalClient wiring)
  - [x] 🟩 PlanSection: task titles open the task (button + aria); Unplanned rows too
  - [x] 🟩 JournalClient: labels fetch, TaskDetailModal + TaskSheet chaining, onSaved reconciliation
- [x] 🟩 **Step 3: Verify** `[sequential]` → depends on: Steps 1, 2
  - [x] 🟩 tsc + jest green (6 new wheel tests); live device check pending user + production build; live check on dev server (desktop + phone)

## Outcomes

- Built as designed via two mockup rounds: drill-down wheel (pick logs + resets to cores; center shows current word + gloss, or the collection at the cores), 130 differentiating hints (incl. 7 core glosses added mid-build for the center display), MoC reference ladder moved from a rail widget INTO the check-in popup behind an info button (user's call - a reference belongs at the moment of tagging), task sheet from plan/unplanned via TaskDetailModal + TaskSheet chaining.
- Deviations: "N deeper" visual cue removed after device testing (overlapped, unnecessary - aria labels keep it); "tap to pick this" replaced by the feeling's gloss (demo copy, not interface copy).
- Review: single-pass, no blockers; wheel keyboard focusability remains tracked in #80.
- Tests: 187 frontend (7 new wheel-interaction + hints-integrity), 3 pre-existing TaskCard failures (#83) unrelated.
