# P79 Journaling - UI Design Handover

Last updated: 2026-07-02
Audience: Claude design session (external). This file is self-contained - it carries every locked decision the design must honor, so no repo access is needed.
Status: wireframe options under review; final layout choice to be recorded here before the design session.

---

## What is being designed

A new **Journal** section for Tasklog, a personal self-hosted task app (Next.js + Tailwind, phone and desktop through one responsive codebase). Journaling is the headline of v3.0: the app grows from a task tracker into a day-tracking system (tasks + time + habits + journal on one data layer).

The page to design: `/journal` - one date's journal, with a calendar to switch dates (default today).

## The user and the practice (context that should shape the design)

- Single user, journals multiple times a day: a rich morning check-in, quick mid-day drops, and an evening close. Mornings are high energy (8-10), evenings are low (0-3), every single day.
- **The evening close is the resilient floor**: on collapse days everything else goes unfilled, but mood, energy, and the Evening Review still get filled. The UI must make the evening close extremely cheap - few taps, low friction, no judgment.
- Empty sections are normal and must look unjudging (collapsed, quiet), never like errors or nagging placeholders.
- Prose is bilingual: English + Hinglish with occasional Devanagari script. Font choices must cover Devanagari gracefully.
- The user journals from the phone (often after morning walks) and the desktop equally. Mobile is a first-class requirement, not an adaptation.

## Locked product decisions (design must honor these)

1. **Journal is its own top-level section** - its own page, like the existing Time section. Not a panel inside the task views.
2. **Layout model**: center = the day's note sections in a structured editor that *feels* WYSIWYG (one continuous note, not a form grid); right sidebar = calendar date picker (default today) + mood check-in and small widgets. Exact arrangement is what the wireframes/design decide.
3. **Three journal templates render for a date**: Daily (the big one), Gratitude (short list + optional line of prose), Affirmations (a daily list, deliberately resurfaced at the evening close so wins get celebrated).
4. **Daily template sections, in order**: morning mood check-in, What's Going On (prose), Mind Dump (prose), Projects Today (short list), Today's Plan (task-linked checkboxes in three buckets: Non-Negotiable / If Energy Allows / Easy Wins, plus a derived read-only "Unplanned, got done" bucket), Front of Mind (list), Back of Mind (list), Daily Review (prose), Evening Review (fixed sub-fields: emotion shift - derived; what drove it; what moved forward; what slowed you down; pattern noticed; one small adjustment; close the tabs; just noticing; energy at end of day), Journal (optional prose, "earned depth only" - not prompted for daily).
5. **Mood check-ins are timestamped events, several per day** (minimum morning + evening). Each: the user's own mood words (core + specific), energy 0-10, optional Map of Consciousness level (numeric, user-confirmed, app may suggest). Mood shift is derived from first vs last check-in, never typed. A feelings-wheel style picker may assist word selection but the user's own words always lead.
6. **Today's Plan rows are real tasks**: a combobox searches existing tasks as you type; the last row is always an explicit `+ Create task: "..."` action (never create on bare Enter). Created tasks default to due today, no project. Unchecked planned tasks show their rolled-over state from live task data - the user never writes "rolled over" by hand.
7. **Edit and preview modes**: edit = the structured editor; preview = the rendered markdown note (rendered with react-markdown; markdown text comes from the backend).
8. **Sections collapse when empty**; a collapsed section is one quiet line, expandable.
9. **Export**: a download affordance (this day as `.md`; all entries as zip). Small, not a hero action.
10. **No template editor UI** in this version; templates are fixed.

## Visual identity: an explicit invitation to go beyond the current system

The app today uses a template-generated system (UI-SPEC.md: zinc neutrals, `#2563EB` accent, Space Grotesk + DM Sans). **The user considers it generic and wants the journal to have a real, considered visual identity** - this is the surface they will live in every morning and evening, and it should feel like theirs, not like a preset.

Constraints on that freedom:

- Propose a genuine identity: deliberate palette, typography with character, a point of view suited to a reflective daily journal used at 7am (high energy) and 11pm (energy 0-3, sometimes after a bad day - the design should be kind at night, not loud). Dark mode is not optional.
- It must be able to **extend app-wide later**: v3 can adopt the journal's identity across tasks/time/habits, so design tokens, not one-off styling. Deliver the result as a replacement token set + type pairing, in the same shape as the current UI-SPEC (colors table, font pairing, CSS variables) so it can drop in.
- Typography must cover Devanagari gracefully (Hinglish + occasional Devanagari prose).
- Tech constraints stay: Tailwind CSS v4, CSS-variable theming with a `.dark` class, lucide-react icons, Google Fonts or self-hosted fonts via next/font.
- Existing interaction primitives worth echoing (behavior, not necessarily look): bottom-sheet pickers on mobile, a rich calendar picker (quick chips + month grid), chip-driven editing sheets, 44px touch targets.

## Accessibility rules (existing, binding)

WCAG AA contrast 4.5:1; visible 2px accent focus rings; 44x44px touch targets; visible labels on all inputs; color never the only state indicator; base font 16px; no horizontal page scroll at 320px; 150ms hover / 200ms overlay transitions.

## What the design session must decide

1. Final layout (see wireframe options A/B/C and the recorded choice below).
2. The mood check-in widget: how word entry + energy + optional MoC level feel in one compact, repeatable interaction.
3. The evening-close flow: how the UI invites the cheap EOD ritual (evening check-in, Evening Review, affirmations celebration) without nagging.
4. Empty/collapsed section treatment and the "earned depth" Journal section's quiet default.
5. Preview mode treatment: how the rendered note looks (this is the artifact the user keeps).
6. Mobile layout: what the right-rail widgets become at phone width (top bar? bottom sheet? accordion?).
7. Calendar rail behavior: month grid always visible on desktop vs compact week strip with expand.

## Wireframe decision

- Options explored: A "One Note" (single scroll, all templates stacked, right rail), B "Tabbed Templates" (one template at a time), C "Day Board" (widget strip + morning/evening columns).
- Chosen: _to be recorded after review_.

## Out of scope for this design

Weekly notes, mood/MoC trend charts, auto-seeded Daily Review, AI/chat journaling surfaces, Obsidian sync UI, template editing, authentication screens.
