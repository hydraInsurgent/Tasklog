# Review Fixes for Labels and Filtering

**Overall Progress:** `100%`

## TLDR
Fix 9 code review findings (1 block, 8 warns) discovered during `/review` of the Labels and Filtering feature (#30). All fixes are applied inline on the feature branch before shipping.

## Goal State

**Current State:** Labels and filtering feature is functionally complete but has data integrity gaps (silent label ID ignoring), inconsistent error handling, race conditions in loading states, and missing filter persistence.

**Goal State:** All block and warn findings resolved. Backend validates label IDs on assignment, labels have uniqueness checks, frontend error handling is consistent, loading states are race-free, and filter state persists across navigation.

## Critical Decisions

- **Inline on feature branch** - These fixes ship with #30, not as separate PATCH releases. No new branches needed.
- **Label uniqueness via backend check, not DB constraint** - Adding a migration for a unique index is heavyweight for this fix. A server-side duplicate check in LabelsController is sufficient. Can add a DB constraint later if needed.
- **Filter persistence via sessionStorage** - URL params would be ideal but require changes to routing (Next.js App Router). sessionStorage is simpler and sufficient for same-session persistence.
- **R2 (confirm dialog) accepted as-is** - Single-user app, the risk is minimal. No fix needed.

---

## Tasks

- [x] 🟩 **Step 1: Backend validation** `[parallel]` -> delivers: label ID validation in SetLabels, duplicate name check in Create/Update
  - [x] 🟩 `TasksController.cs` SetLabels: validate all requested label IDs exist, return 400 with invalid IDs if any are missing (#31)
  - [x] 🟩 `LabelsController.cs` Create: check for existing label with same name (case-insensitive), return 409 Conflict (#33)
  - [x] 🟩 `LabelsController.cs` Update: check for name collision with other labels on rename (#33)

- [x] 🟩 **Step 2: AddTaskForm error handling and uniqueness** `[parallel]` -> delivers: error feedback on label creation failure, duplicate-aware auto-create
  - [x] 🟩 Show inline error when label creation fails instead of silently swallowing (#32)
  - [x] 🟩 Before auto-creating, check if a label with that exact name already exists in allLabels and select it instead (#33)

- [x] 🟩 **Step 3: LabelsClient pendingId race fix** `[parallel]` -> delivers: race-free loading state tracking
  - [x] 🟩 Replace single `pendingId: number | null` with `pendingIds: Set<number>` (#34)
  - [x] 🟩 Updated all `setPendingId` calls to add/remove from the Set
  - [x] 🟩 Updated all `pendingId === label.id` checks to `pendingIds.has(label.id)`

- [x] 🟩 **Step 4: AssignLabelsButton optimistic updates** `[parallel]` -> delivers: immediate UI feedback on label add/remove
  - [x] 🟩 Set `assignedIds` optimistically before the API call (#35)
  - [x] 🟩 Revert to previous state on error

- [x] 🟩 **Step 5: Filter logic fixes** `[parallel]` -> delivers: correct null handling, timezone documentation, session persistence
  - [x] 🟩 `TasksClient.tsx`: replace `-1` sentinel with explicit null check for projectId (#36 / R8)
  - [x] 🟩 `TasksClient.tsx`: add comment documenting deadline date semantics for overdue filter (#36 / R6)
  - [x] 🟩 `ProjectLayout.tsx`: persist filterState to sessionStorage, restore on mount (#36 / R9)

## Outcomes

All 5 steps completed in a single parallel execution pass. No deviations from the plan.

**Key changes made:**
- `TasksController.cs`: SetLabels now returns 400 if any requested label ID doesn't exist (uses HashSet diff)
- `LabelsController.cs`: Create and Update both check for case-insensitive name conflicts (409 Conflict)
- `AddTaskForm.tsx`: Added `labelError` state, shows inline error on creation failure, checks for existing label before creating
- `LabelsClient.tsx`: `pendingId: number | null` replaced with `pendingIds: Set<number>` - all 6 JSX occurrences and 3 handler pairs updated
- `AssignLabelsButton.tsx`: Optimistic update applied immediately, reverts on error
- `TasksClient.tsx`: Explicit null check for projectId, timezone comment on overdue filter
- `ProjectLayout.tsx`: filterState initialized from sessionStorage, persisted via useEffect
