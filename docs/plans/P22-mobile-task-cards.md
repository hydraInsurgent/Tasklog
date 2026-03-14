# Feature Implementation Plan

**Overall Progress:** `100%`

## TLDR
Add a mobile card layout to the task list. On screens below the `md:` breakpoint (768px), replace the wide table with compact cards. Desktop keeps the table unchanged. No backend work.

## Goal State

**Current State:** `TasksClient.tsx` renders a single `<table>` inside `overflow-x-auto`. On mobile this scrolls horizontally, which is awkward. `formatDate` and `deadlineColorClass` are defined inline inside that file.

**Goal State:** Below 768px, tasks render as stacked cards. Each card shows a circle checkbox, task title (links to `/tasks/[id]`), project name, deadline, and a three-dot menu with a Delete action. The table remains on desktop. `formatDate` and `deadlineColorClass` are shared from `src/lib/format.ts`.

## Critical Decisions

- **Breakpoint: `md:` (768px)** - matches what `ProjectLayout.tsx` already uses for the sidebar drawer. Keeps the app consistent.
- **Tap card title = navigate to `/tasks/[id]`** - no edit modal. The detail page already has all actions. A task edit modal is deferred to Someday/Maybe.
- **Three-dot menu state is local to `TaskCard.tsx`** - no need to lift it up. Each card manages its own open/closed state. Simpler and self-contained.
- **Extract format utilities** - `formatDate` and `deadlineColorClass` move to `src/lib/format.ts`. This closes backlog item #20 as a side effect.

## UI Decisions

> Design tokens and global rules inherited from [../../UI-SPEC.md](../../UI-SPEC.md).
> Only feature-specific decisions are recorded here.

### TaskCard component

- **Checkbox style:** Styled HTML `<input type="checkbox">` with `appearance-none`, circular shape (`rounded-full`), filled with primary color when checked - native behavior, no JS needed
- **Completed card appearance:** `opacity-50` on the whole card + `line-through` on the title text - both together, consistent with common task-app patterns
- **Card separation:** Divider lines between cards (no card borders/shadows) - flat, matches the table row style already in use

### Three-dot menu
- **Icon:** Lucide `MoreVertical` (3 vertical dots) - consistent with `no-emoji-icons` rule, 16px inline
- **Menu position:** Opens downward by default; no special flip logic needed for MVP
- **Delete item:** Danger color (`text-red-500`) with `Trash2` icon to match the table's delete button style

### UX Rules in scope for this feature
- [ ] `touch-targets` (CRITICAL) - Checkbox and three-dot button must each be at least 44x44px
- [ ] `aria-labels` (CRITICAL) - Three-dot button and checkbox need `aria-label`
- [ ] `focus-states` (CRITICAL) - All interactive elements in the card need visible focus rings
- [ ] `color-contrast` (CRITICAL) - Verify muted text (project name, deadline) against white card background
- [ ] `color-not-only-indicator` (HIGH) - Completion state uses both strikethrough text and opacity, not color alone
- [ ] `loading-states` (HIGH) - Show spinner in three-dot menu during delete; disable checkbox during completion request
- [ ] `disable-during-async` (MEDIUM) - Checkbox disabled while `completingId` matches; delete disabled while `deletingId` matches
- [ ] `no-emoji-icons` (MEDIUM) - Use Lucide icons only (MoreVertical, Trash2)
- [ ] `cursor-pointer` (MEDIUM) - Card title link, checkbox, and three-dot button all need `cursor-pointer`
- [ ] `responsive-breakpoints` (MEDIUM) - Test cards at 320px minimum width

## Tasks

- [x] 🟩 **Step 1: Extract format utilities** `[parallel]` → delivers: `src/lib/format.ts` with shared helpers
  - [x] 🟩 Create `src/lib/format.ts` with `formatDate` and `deadlineColorClass`
  - [x] 🟩 Update `TasksClient.tsx` to import from `src/lib/format.ts` and remove the inline definitions

- [x] 🟩 **Step 2: Build `TaskCard.tsx`** `[sequential]` → depends on: Step 1
  - [x] 🟩 Create `frontend/src/components/TaskCard.tsx`
  - [x] 🟩 Props: `task`, `projects`, `onComplete`, `onDelete`, `deletingId`, `completingId`, `isHiding`
  - [x] 🟩 Card layout: circle checkbox (left) + task title link (right of checkbox)
  - [x] 🟩 Footer row: project name + deadline (left), three-dot menu (right)
  - [x] 🟩 Three-dot menu: local `menuOpen` state, click outside to close, Delete action only
  - [x] 🟩 Reuse existing completion animation class (opacity-0 + translate-y-1) and completed opacity-50

- [x] 🟩 **Step 3: Wire mobile/desktop rendering in `TasksClient.tsx`** `[sequential]` → depends on: Step 2
  - [x] 🟩 Import `TaskCard`
  - [x] 🟩 Wrap the existing table in `hidden md:block`
  - [x] 🟩 Add a `md:hidden` card list below it that renders `TaskCard` for each `visibleTasks` entry
  - [x] 🟩 Verify completion animation, delete, and show/hide completed work in both layouts

## Outcomes
- Went exactly as planned. No deviations.
- Pre-existing TypeScript error in `tasks/[id]/page.tsx` confirmed not introduced by this work.
- `activeView` prop passed through to `TaskCard` to mirror the table's conditional project column.
- Completion animation reuses the identical CSS classes from the table rows (`opacity-0 translate-y-1 duration-300`) ensuring identical behavior on both layouts.
