# UI Spec - #73 UI uplift (tokens + chip sheet + board views)

Feature-scoped UI spec. **Inherits** the global design system in
[../../UI-SPEC.md](../../UI-SPEC.md) (palette `portfolio` = zinc + blue-600 accent;
fonts `tech-startup` = Space Grotesk heading / DM Sans body; the full UX-rules
checklist). This file records only what this feature adds or decides.

Source of truth for the port: Tasklog Business's frontend
(`/home/manu/Personal/Code/Depth Projects/Tasklog Business/frontend`). The two
apps are stack-twins (Next.js 16 + React 19 + Tailwind v4 `@theme` + lucide-react
+ the same font pairing), so this is a port, not a redesign.

**Locked:** light-only (dark mode deferred). Mobile defaults to list; board opt-in.
Board card = **Rich (Business-style)**: shadow + due-bucket bg tint + priority pill (see 4d).

---

## 1. Design tokens (the foundation)

We promote our currently-hardcoded `zinc-*`/`blue-600`/hex colors (~486 occurrences
across 25 files) to **semantic CSS-variable tokens** in our existing Tailwind v4
`@theme`. Names are chosen semantically so a future `.dark` block is a drop-in
(dark mode is out of scope now).

### Tokens to add (light)

| Token | Hex | Tailwind origin | Role |
|---|---|---|---|
| `--color-bg` | `#FAFAFA` | zinc-50 | page background |
| `--color-surface` | `#FFFFFF` | white | cards, sheet, panels |
| `--color-surface-raised` | `#F4F4F5` | zinc-100 | chips, picker rows, board columns |
| `--color-text-primary` | `#18181B` | zinc-900 | body + headings |
| `--color-text-muted` | `#71717A` | zinc-500 | captions, placeholders, secondary |
| `--color-border` | `#E4E4E7` | zinc-200 | input/card borders, dividers |
| `--color-border-muted` | `#F4F4F5` | zinc-100 | subtle inner dividers |
| `--color-primary` | `#18181B` | zinc-900 | dark primary button bg (distinct from text-primary for dark-mode divergence) |
| `--color-primary-hover` | `#27272A` | zinc-800 | primary button hover |
| `--color-accent` | `#2563EB` | blue-600 | links, focus rings, active chip |
| `--color-accent-hover` | `#1D4ED8` | blue-700 | hover on accent |
| `--color-success` | `#16A34A` | green-600 | done/saved (icon + text) |
| `--color-success-bg` | `#F0FDF4` | green-50 | success tint |
| `--color-warning` | `#CA8A04` | yellow-600 | approaching-deadline (text) |
| `--color-warning-bg` | `#FEFCE8` | yellow-50 | warning tint (board "Today"/"soon") |
| `--color-danger` | `#DC2626` | red-600 | delete, overdue, P1 (text) |
| `--color-danger-bg` | `#FEF2F2` | red-50 | danger tint (board "Overdue") |

> Deliberate deviations from the lift suggestion + the global spec, both for WCAG AA:
> accent stays **blue-600 `#2563EB`** (blue-500 `#3b82f6` only reaches ~3.1:1 as text);
> success/warning/danger use the **-600 text variants** (the global spec's -500
> values fail AA as text on white) paired with **-50 background tints**. When this
> ships, `/document` should reconcile the global `UI-SPEC.md` semantic colors to
> these AA-safe values.

### Literal `@theme` additions

Our `frontend/src/app/globals.css` already has a fonts-only `@theme`. Extend it:

```css
@theme {
  /* existing */
  --font-heading: var(--font-space-grotesk), sans-serif;
  --font-body: var(--font-dm-sans), sans-serif;

  /* added in #73 - semantic color tokens (light) */
  --color-bg: #fafafa;
  --color-surface: #ffffff;
  --color-surface-raised: #f4f4f5;
  --color-text-primary: #18181b;
  --color-text-muted: #71717a;
  --color-border: #e4e4e7;
  --color-border-muted: #f4f4f5;
  --color-primary: #18181b;
  --color-primary-hover: #27272a;
  --color-accent: #2563eb;
  --color-accent-hover: #1d4ed8;
  --color-success: #16a34a;
  --color-success-bg: #f0fdf4;
  --color-warning: #ca8a04;
  --color-warning-bg: #fefce8;
  --color-danger: #dc2626;
  --color-danger-bg: #fef2f2;
}
```

This makes `bg-surface`, `text-text-muted`, `border-border`, `text-accent`,
`bg-danger-bg`, etc. available as utilities. The swap from `zinc-*`/`blue-600`
is mechanical and done incrementally (files touched by the sheet/board first, then
one focused pass), not a big-bang rename.

### Contrast verification (key pairs, WCAG AA needs >=4.5:1 text / >=3:1 UI)

| Pair | Ratio | Verdict |
|---|---|---|
| text-primary `#18181B` on surface `#FFFFFF` | ~16:1 | PASS (AAA) |
| text-primary on bg `#FAFAFA` | ~15:1 | PASS (AAA) |
| text-muted `#71717A` on **surface** `#FFFFFF` | ~4.6:1 | PASS (AA) |
| text-muted `#71717A` on **bg** `#FAFAFA` | ~4.4:1 | **borderline** |
| accent `#2563EB` as text/link on white | ~4.5:1 | PASS (AA) |
| accent `#2563EB` as focus ring (UI, 3:1) | ~4.5:1 | PASS |
| danger `#DC2626` text on white | ~4.8:1 | PASS (AA) |

> **Contrast guard (closes part of deviation #4):** body-size muted text must sit on
> `surface` (white), not on the gray `bg`. For captions on the gray background, use
> zinc-600 `#52525B` (clears AA). Verify with a checker during execute.

---

## 2. Typography (inherited)

Space Grotesk (`font-heading`, weights 500/600/700) for titles/headings; DM Sans
(`font-body`, 400/500/700) for everything else. Base body 16px / `line-height: 1.6`.
Already wired via `@theme`; no change. Sheet title heading + board column headers use
`font-heading`.

---

## 3. Component specs (ported from Business, mapped to our tokens)

### Chip (`Chip.tsx`, port as-is)
Pill button: `rounded-full border text-sm px-3 py-1.5 min-h-[44px]`, icon + label
(or icon + value when set). Focus: `focus:outline-none focus:ring-2 focus:ring-accent
focus:ring-offset-2`. States:
- empty: `bg-surface-raised border-border text-text-muted hover:text-text-primary`
- has value: `bg-surface-raised border-border text-text-primary hover:bg-surface`
- active (picker open): `bg-surface border-accent text-text-primary`

### PickerSheet (`PickerSheet.tsx`, port as-is)
The responsive container every picker portals into (`document.body`):
- **>=640px:** popover anchored below the trigger; flips above if no room; repositions
  on scroll/resize; click-outside closes; returns focus to trigger.
- **<640px:** bottom sheet with drag handle + backdrop; focus trap; Escape closes;
  scroll-lock + overscroll-contain.

### Picker rows (`pickers/_shared.ts`)
`w-full flex items-center gap-3 min-h-[44px] px-3 py-2 rounded-md hover:bg-surface-raised
focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1` (token-mapped).

### TaskSheet (NEW - create + edit in one)
Replaces the inline `AddTaskForm` and `EditTaskModal`. Modal (desktop) / keyboard-aware
bottom-sheet (mobile, via `useKeyboardHeight`). Title field = our existing
`QuickAddInput` (keeps inline parsing). Chip row for our five fields: **Due date /
Priority / Project / Label / Recurrence**, each opening its picker in a `PickerSheet`.
Plus the existing **"Track as a daily habit"** checkbox (v2.16.0). Footer: Cancel +
Add/Save (disabled-during-async, spinner).

### DueDatePicker (port + adapt)
Quick chips (Today / Tomorrow / Next week / No date) + a hand-rolled month grid; selected
day ringed in `accent`. Adapt to our date model (`deadline` ISO, midnight = date-only);
drop Business's recurrence-in-picker coupling (we have our own RecurrencePicker chip).

### Priority badge map (P1-P4)
| Priority | Token treatment |
|---|---|
| P1 (urgent) | `text-danger` on `bg-danger-bg` (or red dot) |
| P2 (high) | `text-warning` on `bg-warning-bg` |
| P3 (medium) | `text-text-primary` on `bg-surface-raised` |
| P4 (none) | `text-text-muted` on `bg-surface-raised` |

Reuses our existing `PriorityDot`/`PRIORITY_OPTIONS` for the dot; this map is for the pill.

### View-mode toggle + Group-by control (NEW, in the TasksClient header)
- **Toggle:** segmented `List | Board` (icons: `List`, `LayoutGrid`/`Columns`).
  `aria-pressed`; active segment `bg-surface text-text-primary border-accent`.
- **Group-by:** a small `Group: [Due v]` chip-style dropdown (Due / Project / Priority).
  Persisted per view; only meaningful in board mode.

### Board (NEW)
Columns grouped by the selected dimension; default = **due bucket** read straight off
each task's server-computed `dueStatus`: `Overdue / Today / This week / Later / No date`.
Within a column, sort most-recent-due-first. Columns are fixed-width, **horizontally
scrollable, ~3.5 visible** (so "more" is discoverable). Column header: name + count,
`font-heading`, with a token accent per bucket (Overdue=`danger`, Today=`warning`,
This week=`accent`, Later/No date=`text-muted`). Empty column shows a muted hint.

---

## 4. Mockups

### 4a. TaskSheet - desktop modal (>=640px)

```
        +---------------------------------------------+
        |  New task                              [X]  |
        +---------------------------------------------+
        |  +---------------------------------------+  |
        |  | Email Mark friday #Work p1            |  |   <- QuickAddInput
        |  +---------------------------------------+  |      (#Work, p1, friday tinted)
        |  Description (optional)                     |
        |  +---------------------------------------+  |
        |  |                                       |  |
        |  +---------------------------------------+  |
        |                                             |
        |  ( [cal] Fri 30 May ) ( [!] P1 ) ( # Work ) |   <- chip row
        |  ( @ +Label )  ( [loop] Repeats: off )      |
        |  [ ] Track as a daily habit                 |
        +---------------------------------------------+
        |                        [ Cancel ]  [ Add ]  |
        +---------------------------------------------+
```

With the Due chip's calendar picker open (popover anchored below the chip):

```
   ( [cal] Fri 30 May v )   <- active chip: border-accent
   +-------------------------------+
   |  Today   Tomorrow   Next week |   <- quick chips
   |  No date                      |
   |  ---------------------------  |
   |   < May 2026 >                |
   |  Su Mo Tu We Th Fr Sa         |
   |               1  2  3         |
   |   4  5  6  7  8  9 10         |
   |  ...        (30) 31           |   <- (30) = selected, ringed in accent
   +-------------------------------+
```

### 4b. TaskSheet - mobile bottom-sheet (<640px), rises with keyboard

```
   +-------------------------------+
   |             --                |   <- drag handle
   |  New task                [X]  |
   |  +-------------------------+  |
   |  | Buy milk                |  |
   |  +-------------------------+  |
   |  ( Due ) ( P4 ) ( Project )-> |   <- chips scroll horizontally
   |  ( Label ) ( Repeats )        |
   |  [ ] Track as a daily habit   |
   |  [          Add task        ] |
   +-------------------------------+
   ~~~~~~~~~ on-screen keyboard ~~~~~~~~~
```

### 4c. Board view + header controls

```
  All Tasks          [ = List | # Board ]   Group: ( Due v )   ( ... filter )
  +-----------+-----------+-----------+-----------+----------- - -
  | Overdue 2 | Today  3  | This wk 4 | Later  1  | No date 5      ->  (scrolls; ~3.5 cols visible)
  +-----------+-----------+-----------+-----------+----------- - -
  | [card]    | [card]    | [card]    | [card]    | [card]
  | [card]    | [card]    | [card]    |           | [card]
  |           | [card]    | [card]    |           | [card]
  +-----------+-----------+-----------+-----------+----------- - -
   ^danger     ^warning    ^accent     ^muted      ^muted   (column header accents)
```

### 4d. Board card - CHOSEN: Rich (Business-style)

The user chose the richer card (ported from Business's `TaskCard`): subtle shadow,
due-bucket background tint, and a priority pill.

```
+----------------------------+   <- subtle shadow; left tint by due bucket
| (o)  Email Mark      [P1]  |   (o) complete tick   [P1] priority pill (danger)
|                            |
| [#work]          Fri 30 May|   label chip(s)       deadline (colored by urgency)
+----------------------------+
   bg tint: Overdue=danger-bg, Today=warning-bg, else surface
```

Spec for the board card:
- Container: `rounded-lg border border-border shadow-sm hover:shadow-md` on `bg-surface`,
  with a due-bucket tint (`Overdue`=`bg-danger-bg`, `Today`=`bg-warning-bg`, else
  `bg-surface`). `cursor-pointer`, `focus:ring-2 focus:ring-accent focus:ring-offset-2`.
- Row 1: complete tick (44px target, `aria-label`) + title (`font-body`, `text-text-primary`,
  line-through + `opacity-50` when completed) + priority pill (the 4d badge map, right-aligned).
- Row 2: label chips (left) + deadline label (right, colored by our existing
  `deadlineColorClass`) + a small recurrence glyph if recurring.
- Port + trim Business's `TaskCard`: DROP its Business-only bits (assignee avatar line,
  status workflow circle/cycle, work-session "Working" pill, stakeholder/review badges).
  Our tasks are tickable-only, so the circle is a simple complete checkbox.
- Reuses our `PriorityDot`/`RecurringBadge`/`labelColor`/`deadlineColorClass`.

> Note: this is the board card. The **list view** keeps today's desktop table / mobile
> `TaskCard` unchanged - the rich card is board-only.

---

## 5. Accessibility (first-class - closes part of deviation #4)

- **Contrast:** every text/bg pair >=4.5:1 (see the verification table + the muted-text
  guard). Board column tints are backgrounds only; text on them stays primary/muted.
- **Focus:** every interactive element (chips, picker rows, toggle, board cards, calendar
  days) shows `focus:ring-2 focus:ring-accent focus:ring-offset-2`. Never `outline:none`
  without a replacement.
- **Touch targets:** chips, toggle segments, picker rows, calendar days, complete ticks
  all >=44x44px (pad if visually smaller).
- **ARIA:** icon-only controls (toggle segments, calendar nav, sheet close, complete tick)
  carry `aria-label`. The sheet is `role="dialog" aria-modal="true"`; PickerSheet traps
  focus and returns it to the trigger on close. View toggle uses `aria-pressed`.
- **Color-not-only:** due/priority never rely on color alone - pair with the bucket
  name/count (board headers) and the P1-P4 text label (badge).
- **Reduced motion:** sheet/picker transitions 150-200ms; respect `prefers-reduced-motion`.

---

## 6. Responsive

- Breakpoints: **375 / 768 / 1024** (mobile-first; `sm:` = 640px is the modal vs
  bottom-sheet switch).
- **Sheet:** centered modal `>=640px`; keyboard-aware bottom-sheet below.
- **Board:** horizontal-scroll columns, ~3.5 visible at a time, on all sizes. **Mobile
  defaults to list**; board is opt-in via the toggle (persisted per view).
- **List view** stays today's behavior: desktop table / mobile cards.
- `no-horizontal-scroll` rule applies to the PAGE; the board's own internal horizontal
  scroll is intentional and contained within its panel.

---

## 7. UX rules in scope for this feature

From the global checklist - the ones these new components must satisfy:

- [ ] `color-contrast` (CRITICAL) - token pairs verified; muted-text guard applied.
- [ ] `focus-states` (CRITICAL) - ring on chips, picker rows, toggle, calendar days, board cards.
- [ ] `touch-targets` (CRITICAL) - 44px on all new controls.
- [ ] `aria-labels` (CRITICAL) - icon-only sheet/toggle/calendar/tick controls.
- [ ] `form-labels` (HIGH) - sheet inputs labeled (title, description, chips announce their field).
- [ ] `loading-states` (HIGH) - sheet save spinner; board uses the existing task-load spinner.
- [ ] `error-placement` (HIGH) - sheet validation error below the title field.
- [ ] `color-not-only-indicator` (HIGH) - bucket names + P-labels alongside color.
- [ ] `disable-during-async` (MEDIUM) - sheet Add/Save disabled in flight.
- [ ] `cursor-pointer` (MEDIUM) - chips, cards, toggle, picker rows.
- [ ] `animation-duration` (MEDIUM) - 150-200ms; honor reduced-motion.
- [ ] `no-emoji-icons` / `consistent-icon-sizing` (MEDIUM) - lucide only; 16px inline / 20px controls.
- [ ] `responsive-breakpoints` (MEDIUM) - test 375 / 768 / 1024 + the board scroll.

---

## 8. For /create-plan

Consume this spec when planning #73. Tag every frontend/visual step `[UI]`. Build/
smoke-test in the agreed stages: **(a)** tokens + `Chip`/`PickerSheet`/`useKeyboardHeight`,
**(b)** `TaskSheet` (create+edit) + `DueDatePicker`, **(c)** board + view-toggle +
group-by + per-view persistence. The board card is decided (section 4d: Rich /
Business-style), so there are no open design inputs - this spec is ready to plan against.
