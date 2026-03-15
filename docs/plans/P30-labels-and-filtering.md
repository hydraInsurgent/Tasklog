# Feature Implementation Plan: Labels and Filtering

**Overall Progress:** `0%`

## TLDR
Add user-created labels (tags) to tasks, a labels management dashboard in the sidebar, and a universal filter panel that lets the user filter any task view by label, project, or date.

## Goal State

**Current State:** Tasks can only be categorised by project. The only filtering available is the sidebar project/inbox selection and the "Show completed" toggle.

**Goal State:** Users can create labels (e.g. LNO framework: Leverage, Neutral, Overhead), apply multiple labels per task, and filter any task view by label, project, and/or date range via a filter popover in the task list header.

## Critical Decisions

- **Many-to-many via EF Core navigation properties** - Label and TaskModel will use EF Core's implicit join table (`HasMany/WithMany`). No explicit join entity needed - keeps the model clean.
- **Labels are global, not per-project** - A label belongs to the user's label set, not to a specific project. Project-specific auto-labelling is Someday/Maybe.
- **`setTaskLabels` replaces, not appends** - The labels endpoint accepts the full desired set of label IDs and replaces whatever is stored. Simpler than add/remove individually.
- **Filter state lives in `ProjectLayout`** - `activeView` already lives there. A parallel `filterState` object will sit alongside it and be passed to `TasksClient`. Keeps all view/filter state co-located.
- **Client-side filtering** - Tasks are already fetched all at once. Label and date filters are applied client-side in `TasksClient`, same as the existing `activeView` filter. No new API query params needed.
- **First use of EF Core `.Include()`** - Task queries currently load no navigation properties. Adding `.Include(t => t.Labels)` on all task queries is new but straightforward.
- **Product scope expansion** - Filtering was already listed under "What does not exist yet" in `architecture.md`. This is on the planned path.
- **Label color stored as integer index (0-9)** - Maps to a fixed 10-color VIBGYOR palette defined in the frontend. Auto-assigned on creation (cycling); user-selectable via swatch picker on the labels dashboard.
- **Delete label unlinks tasks, does not delete them** - Removing a label removes it from all associated tasks but leaves the tasks intact. EF Core handles join table cleanup automatically.
- **Auto-create label on task creation** - If a label name typed in AddTaskForm does not exist and the user presses Enter, create it immediately with the next cycling color before the task is saved.

---

## UI Decisions

> Design tokens and global rules inherited from [UI-SPEC.md](../../UI-SPEC.md).
> Only feature-specific decisions are recorded here.

### Label Color Palette

10 fixed swatches, auto-assigned in sequence on creation (cycling when all 10 are in use). User can reassign via swatch picker on the labels dashboard.

| Index | Name | Hex |
|-------|------|-----|
| 0 | Red | `#EF4444` |
| 1 | Orange | `#F97316` |
| 2 | Amber | `#F59E0B` |
| 3 | Yellow | `#EAB308` |
| 4 | Green | `#22C55E` |
| 5 | Teal | `#14B8A6` |
| 6 | Blue | `#3B82F6` |
| 7 | Indigo | `#6366F1` |
| 8 | Violet | `#8B5CF6` |
| 9 | Pink | `#EC4899` |

### Label Chips (shared pattern)

- **Appearance:** Rounded pill (`rounded-full`), `px-2 py-0.5 text-xs font-medium`, white text on the label's color background
- **Contrast:** All 10 colors must pass 4.5:1 against white - verify each swatch
- **Remove button:** Small `×` inside the chip with `aria-label="Remove [label name]"`, min 44x44px tap area via padding

### Labels Dashboard

- **Desktop:** Table layout - Color column (clickable filled circle swatch, opens 10-color picker dropdown showing circles only, no text), Label name column (click cell to edit inline, Enter or blur to save), Delete column (trash icon with confirmation)
- **Mobile:** Card list, one card per label - same surface/border/padding pattern as TaskCard
- **Create:** Input row at the bottom of the table (desktop) / floating add button (mobile). Auto-assigns next cycling color. Enter submits.
- **Color picker:** Shown as a grid of 10 colored circles in a small popover. No color names. Selected color has a ring indicator.
- **Delete warning copy:** "This label will be removed from all tasks. The tasks themselves will not be deleted."

### Task Labels in Add Form / Detail Page

- **AddTaskForm field:** Text input with dropdown suggestion list of existing labels. Confirmed labels appear as colored chips inside the field (pill style). If typed name has no match and Enter is pressed, auto-create and chip it immediately. No extra toast - chip appearing is the feedback.
- **AssignLabelsButton (detail page):** Current labels shown as chips with `×`. "Add label" combobox below to pick or type. Saves on each change (no Apply button needed on detail page).

### Task Card (Mobile)

- **Label display:** `#labelname` text in the bottom-right corner of the mobile card, using the label's hex as text color (not background) to stay subtle. Multiple labels wrap if needed.

### Filter Panel

- **Trigger:** Three-dot menu (`MoreHorizontal` Lucide icon) in the task list header, same as TaskCard pattern. Menu item: "Apply filters". Opens popover anchored to the button.
- **Mobile:** Same dropdown popover as desktop - no bottom sheet.
- **Active filters badge:** Accent blue (`#2563EB`) small count badge on the filter button when any filter is active.
- **Popover sections:** Labels (chip multi-select), Project (multi-select checkboxes, visible in all views), Date (radio: None / Today / This week / Overdue)
- **Footer:** "Apply" primary button + "Clear filters" text link

### UX Rules in scope for this feature

- [ ] `color-contrast` (CRITICAL) - White text on each of the 10 label color backgrounds must pass 4.5:1. Verify all swatches.
- [ ] `focus-states` (CRITICAL) - Label chips, color picker swatches, inline edit inputs, and filter popover trigger all need visible focus rings.
- [ ] `touch-targets` (CRITICAL) - Color swatch circles, chip `×` buttons, and filter trigger must meet 44x44px. Use padding.
- [ ] `aria-labels` (CRITICAL) - Chip `×` buttons (`aria-label="Remove [name]"`), color picker trigger, filter popover trigger all need aria-labels.
- [ ] `loading-states` (HIGH) - Spinner during label create, rename, and delete operations in LabelsClient.
- [ ] `error-placement` (HIGH) - Inline error below the rename input if submitted empty.
- [ ] `disable-during-async` (MEDIUM) - Create and delete buttons disabled while a request is in flight.
- [ ] `cursor-pointer` (MEDIUM) - Color swatches, chip `×` buttons, all clickable label elements show pointer cursor.
- [ ] `animation-duration` (MEDIUM) - Filter popover open/close uses 150-200ms transition.
- [ ] `no-emoji-icons` (MEDIUM) - Use Lucide icons (`MoreHorizontal`, `Trash2`, `Tag`, `Check`) throughout.

---

## Tasks

- [ ] 🟥 **Step 1: Backend data model** `[sequential]` → delivers: Label entity, TaskLabel join table, EF config, migration
  - [ ] 🟥 Create `Models/Label.cs` with `Id`, `Name`, `ColorIndex` (int 0-9), `CreatedAt`, and `ICollection<TaskModel> Tasks` nav property
  - [ ] 🟥 Add `ICollection<Label> Labels` nav property to `Models/TaskModel.cs`
  - [ ] 🟥 Register `DbSet<Label> Labels` in `TasklogDbContext.cs` and configure many-to-many with `HasMany/WithMany`
  - [ ] 🟥 Run `dotnet ef migrations add AddLabels` and verify the generated migration

- [ ] 🟥 **Step 2: Backend API** `[sequential]` → depends on: Step 1
  - [ ] 🟥 Create `Controllers/LabelsController.cs` with: `GET /api/labels`, `POST /api/labels`, `PATCH /api/labels/{id}`, `DELETE /api/labels/{id}`
  - [ ] 🟥 Add request records: `CreateLabelRequest(string Name, int ColorIndex)`, `RenameLabelRequest(string Name, int ColorIndex)`
  - [ ] 🟥 `DELETE /api/labels/{id}` - removes the label and unlinks it from all tasks (EF join table cleanup). Does NOT delete tasks.
  - [ ] 🟥 Update `TasksController.GetAll()` and `GetById()` to `.Include(t => t.Labels)`
  - [ ] 🟥 Add `PATCH /api/tasks/{id}/labels` - accepts `{ labelIds: int[] }`, replaces the task's label set, returns updated task
  - [ ] 🟥 Add `SetTaskLabelsRequest(int[] LabelIds)` record

- [ ] 🟥 **Step 3: Frontend API layer** `[sequential]` → depends on: Step 2
  - [ ] 🟥 Add `Label` interface to `api.ts`: `{ id: number; name: string; colorIndex: number; createdAt: string }`
  - [ ] 🟥 Add `labels: Label[]` to the `Task` interface in `api.ts`
  - [ ] 🟥 Add `getLabels()`, `createLabel(name, colorIndex)`, `updateLabel(id, name, colorIndex)`, `deleteLabel(id)`, `setTaskLabels(taskId, labelIds[])` to `api.ts`
  - [ ] 🟥 Add `LABEL_COLORS` constant array (10 hex strings) to `lib/format.ts` for shared use across components

- [ ] 🟥 **Step 4: Labels dashboard** `[UI]` `[parallel]` → depends on: Step 3 - delivers: /labels route + sidebar nav link + CRUD UI
  - [ ] 🟥 Create `app/labels/page.tsx` - Server Component that renders `<LabelsClient />`
  - [ ] 🟥 Create `components/LabelsClient.tsx` - desktop table (Color swatch column + Label name column + Delete column), mobile card list. Inline name editing, color swatch picker popover, delete with confirmation. Same feedback pattern as the rest of the app.
  - [ ] 🟥 Create `components/ColorPicker.tsx` - small popover showing 10 colored circles in a grid. Selected color gets a ring. No color names.
  - [ ] 🟥 Update `ProjectSidebar.tsx` to add a "Labels" nav link as a separate section below the project list

- [ ] 🟥 **Step 5: Task labels UI** `[UI]` `[parallel]` → depends on: Step 3 - delivers: labels field in AddTaskForm + labels row on task detail page + label chips in TaskCard
  - [ ] 🟥 Create `components/LabelChip.tsx` - shared chip component: colored pill with label name, optional `×` remove button
  - [ ] 🟥 Create `components/AssignLabelsButton.tsx` - shows current label chips with `×`, plus combobox to add from existing labels. Calls `setTaskLabels` on each change, then `router.refresh()`.
  - [ ] 🟥 Update `tasks/[id]/page.tsx` to fetch labels (`getLabels()`) and render a Labels row in the detail card using `AssignLabelsButton`
  - [ ] 🟥 Update `AddTaskForm.tsx`: add labels field with autocomplete, chip display, auto-create on Enter if label not found (assigns next cycling color). Pass selected label IDs to parent `onAdd`.
  - [ ] 🟥 Update `TasksClient.handleAdd` to accept `labelIds`, call `setTaskLabels` after task creation
  - [ ] 🟥 Update `TaskCard.tsx` to show `#labelname` chips in bottom-right using label's hex as text color

- [ ] 🟥 **Step 6: Filter panel** `[UI]` `[parallel]` → depends on: Step 3 - delivers: FilterPanel component + filterState in ProjectLayout + extended task filtering
  - [ ] 🟥 Define `FilterState` type: `{ labelIds: number[]; projectIds: number[]; dateFilter: "none" | "today" | "this-week" | "overdue" }`
  - [ ] 🟥 Create `components/FilterPanel.tsx` - popover from three-dot menu in task list header. Sections: Labels (chip multi-select), Project (checkboxes), Date (radio). Footer: "Apply" + "Clear filters".
  - [ ] 🟥 Update `ProjectLayout.tsx` to own `filterState` alongside `activeView`, pass both to `TasksClient`
  - [ ] 🟥 Update `TasksClient.tsx` to: accept `filterState` prop, extend filter logic to apply label/project/date on top of `activeView`, render three-dot menu + `FilterPanel` in the task list header
  - [ ] 🟥 Show active filter count as an accent-blue badge on the filter button when filters are applied

- [ ] 🟥 **Step 7: Documentation** `[sequential]` → depends on: Steps 4, 5, 6
  - [ ] 🟥 Update `docs/architecture.md`: data model (Labels, ColorIndex, join table), new API endpoints, new/updated components
  - [ ] 🟥 Update `docs/product-design.md`: add Labels and Filtering to "How features currently work"
  - [ ] 🟥 Update `docs/engineering-guidelines.md`: note `.Include()` pattern for nav properties

---

## Outcomes
<!-- Fill in after execution: decision-relevant deltas only. What changed vs. planned? Key decisions made? Assumptions invalidated? -->
