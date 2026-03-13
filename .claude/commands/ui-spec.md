# UI Specification Generator

Generates UI design decisions for a feature or the project as a whole.
Mode is inferred automatically from workflow context - no argument needed.

---

## Step 0: Read Reference Data (MANDATORY)

Before doing anything else, read all three reference files:
1. `.claude/ui-reference/colors.md`
2. `.claude/ui-reference/fonts.md`
3. `.claude/ui-reference/ux-rules.md`

Do NOT proceed without reading these files.

---

## Step 1: Infer Context (MANDATORY)

Gather two signals silently before asking the user anything:

**Signal A - Active plan:**
Read `docs/backlog.md`. Check the Active section for a plan file and branch.
- If an active plan is listed, read that plan file. Note its path.
- If no active plan exists, there is no feature plan in scope.

**Signal B - Global spec:**
Check whether `UI-SPEC.md` exists in the project root.
- If found, read it. This is the project's established design system.
- If not found, no design system exists yet.

**Determine mode from the two signals:**

| Active plan? | UI-SPEC.md? | Mode |
|---|---|---|
| Yes | Yes | **feature** - add UI decisions to the active plan |
| Yes | No | **new project** - generate UI-SPEC.md, then link it to the active plan |
| No | Yes | **global update** - update UI-SPEC.md directly, no plan involved |
| No | No | **new project** - generate UI-SPEC.md, no plan to link |

Tell the user which mode was inferred and which plan (if any) will be used.
Ask for confirmation before continuing. Example:
> "Found active plan: docs/plans/P12-projects-inbox.md. UI-SPEC.md exists.
> Running in feature mode - I'll add UI decisions to the plan. Confirm?"

---

## Step 2: Ask Questions (mode-dependent)

### Mode: new project

No global spec exists. Ask these 3 questions and wait for answers:

1. **Product type** - What kind of product is this? (Show the list of product types from `colors.md`)
2. **Mood/audience** - What feeling should it convey? (Show the available mood tags from the reference data)
3. **Preferred styling system** - Tailwind CSS or CSS custom properties (variables)?

### Mode: feature

A global spec exists. Do NOT ask palette, font, or styling system questions - those
are already decided. Instead:

1. Read the plan's `## Tasks` section carefully.
2. Identify every new component, layout structure, and interaction pattern introduced by this feature.
   Look for: sidebars, modals, drawers, inline editing, dropdowns, mobile layout changes,
   empty states, destructive actions, multi-step flows.
3. For each significant UX decision point found, draft one focused question.
   Keep it to 3-5 questions maximum. Skip anything already obvious from the existing spec
   or existing components. Only ask where a real choice exists.

**Examples of good feature-mode questions:**
- "The sidebar will be visible on desktop - should it collapse or hide on mobile? Options: hidden by default with a toggle button, or a slide-in drawer?"
- "Inline project rename - should clicking the name make it editable in place, or a separate rename button?"
- "Deleting a project that has tasks - silent reassign to Inbox, or show a confirmation first?"

### Mode: global update

The user wants to update the project design system directly (e.g. change the theme,
add new tokens, revise accessibility rules). Ask what they want to change and why,
then edit `UI-SPEC.md` in place. No plan is involved.

Wait for the user's answers before generating any output.

---

## Step 3: Generate Output (mode-dependent)

### Mode: new project

Create `UI-SPEC.md` in the project root using the full schema (Appendix A).

If an active plan exists, also update the plan file:
- Add a `## UI Specification` section after `## Critical Decisions`, linking to `UI-SPEC.md`
- Compute the relative path from the plan file's location to `UI-SPEC.md` at the project root.
  Example: plan at `docs/plans/P12.md` - relative path is `../../UI-SPEC.md`.
- Tag plan steps that involve visual/frontend work with `[UI]` (append before the parallel/sequential tag)

### Mode: feature

Do NOT create a new file. Append a `## UI Decisions` section to the plan file,
placed after `## Critical Decisions`.

Compute the relative path from the plan file to `UI-SPEC.md` at the project root.
Example: plan at `docs/plans/P12.md` - relative path is `../../UI-SPEC.md`.

Use this format:

```markdown
## UI Decisions

> Design tokens and global rules inherited from [UI-SPEC.md]([relative-path-to-UI-SPEC.md]).
> Only feature-specific decisions are recorded here.

### [Component or area name]
- **[Decision point]:** [Chosen approach] - [brief rationale if not obvious]

### [Another component or area]
- **[Decision point]:** [Chosen approach]

### UX Rules in scope for this feature
[List only the rules from the global spec relevant to the new components.
Copy by rule ID. Do not list rules that do not apply to this feature.]
- [ ] `rule-id` (SEVERITY) - description
```

After appending the section, tag plan steps that involve visual/frontend work with `[UI]`
(append before the parallel/sequential tag). Sub-tasks inherit from their parent - do not
tag sub-tasks individually.

### Mode: global update

Edit `UI-SPEC.md` in place with the agreed changes. No plan updates needed.

---

## Important Notes

- This command does NOT modify any code - it only updates plan files and `UI-SPEC.md`
- In feature mode, `UI-SPEC.md` is the single source of truth for tokens. `/execute` should
  read the `## UI Decisions` section in the plan for feature-specific decisions, and
  `UI-SPEC.md` for tokens. It should NOT read the reference library files directly.
- Never modify the `.claude/ui-reference/` files - they are a static library.

---

## Appendix A: Full UI-SPEC.md Schema (new project mode only)

```markdown
# UI Specification

## Project Design System

- Generated by: /ui-spec command
- Preferred styling system: [Tailwind / CSS Variables]

## Design Tokens

### Color Palette
Selected: [palette_id] - [palette name]

| Role | Hex | Usage |
|------|-----|-------|
| Primary | #xxx | Main actions, links, active states |
| Secondary | #xxx | Supporting elements, secondary buttons |
| Accent | #xxx | Highlights, badges, callouts |
| Background | #xxx | Page and section backgrounds |
| Surface | #xxx | Cards, panels, elevated sections |
| Text | #xxx | Body text, headings |
| Text Muted | #xxx | Secondary text, captions, placeholders |
| Border | #xxx | Dividers, input borders, cards |
| Success | #xxx | Confirmations, positive states |
| Warning | #xxx | Caution messages, pending states |
| Danger | #xxx | Errors, destructive actions |

## Typography

### Font Pairing
Selected: [fontpair_id] - [pairing name]

- Heading: [font name]
- Body: [font name]

Google Fonts import:
[url]

## Accessibility Requirements
- Text on background: minimum 4.5:1 contrast ratio (WCAG AA)
- Interactive elements: visible focus indicators (outline or ring)
- Touch targets: minimum 44x44px
- Images: descriptive alt text
- Icon-only buttons: aria-label attribute

## UX Rules

[Full checklist from ux-rules.md, all rules, formatted as checkboxes by severity]

## Technical Setup

### Tailwind Config
[config block]

### CSS Variables
[variables block]

## Component Notes

[Any project-wide component decisions made during this session]
```
