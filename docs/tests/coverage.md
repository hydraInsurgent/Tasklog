# Test Coverage

**Last updated:** 2026-03-14 (format.ts + TaskCard added)

---

## Coverage Report

> Updated by `/unit-test` each run. Use these numbers to assess impact without re-running tests.
> If a component is unchanged since this date and shows 100% branch coverage, it is unaffected.
> If a component changed, or any file it imports changed, re-run coverage to verify.

### .NET Backend - last run 2026-03-14

| Class | Lines | Branches | Notes |
|---|---|---|---|
| TasksController | 100% | 100% | All methods and branches covered |
| ProjectsController | 100% | 100% | All methods and branches covered |
| TasklogDbContext | 100% | 100% | |
| Program.cs | 0% | - | Framework wiring - not a test target |
| Migrations | 0% | - | Generated code - not a test target |

### Next.js Frontend - last run 2026-03-14

| Component | Statements | Branches | Lines | Uncovered |
|---|---|---|---|---|
| AddTaskForm.tsx | 92.59% | 94.11% | 92.59% | 108-126 (project dropdown render - untested, not a gap) |
| AssignProjectButton.tsx | 100% | 100% | 100% | - |
| CompleteTaskButton.tsx | 100% | 100% | 100% | - |
| DeleteTaskButton.tsx | 100% | 100% | 100% | - |
| TaskCard.tsx | 96.42% | 83.33% | 95.65% | L50 (useEffect cleanup - runs on unmount, not exercised in unit tests) |
| format.ts | 100% | 100% | 100% | - |
| ProjectLayout.tsx | 0% | 0% | 0% | Integration test candidate |
| ProjectSidebar.tsx | 0% | 0% | 0% | Integration test candidate |
| TasksClient.tsx | 0% | 0% | 0% | Integration test candidate |
| api.ts | 0% | 0% | 0% | Skipped - thin fetch wrappers |

---

## .NET Backend

### TasksController
- [x] 🟩 GetAll - returns tasks ordered newest first
- [x] 🟩 GetById - returns 200 with task when found
- [x] 🟩 GetById - returns 404 when not found
- [x] 🟩 Create - returns 201 with created task on valid title
- [x] 🟩 Create - returns 400 on empty title
- [x] 🟩 Create - returns 400 on whitespace-only title
- [x] 🟩 Create - trims leading and trailing whitespace from title
- [x] 🟩 Create - assigns ProjectId when provided
- [x] 🟩 Delete - returns 204 and removes task when found
- [x] 🟩 Delete - returns 404 when not found
- [x] 🟩 Complete - sets IsCompleted and CompletedAt when marking complete
- [x] 🟩 Complete - clears IsCompleted and CompletedAt when marking incomplete
- [x] 🟩 Complete - returns 404 when not found
- [x] 🟩 AssignProject - assigns project to task
- [x] 🟩 AssignProject - accepts null ProjectId to move task back to Inbox
- [x] 🟩 AssignProject - returns 404 when not found

### ProjectsController
- [x] 🟩 GetAll - returns projects ordered alphabetically
- [x] 🟩 Create - returns 201 with created project on valid name
- [x] 🟩 Create - returns 400 on empty name
- [x] 🟩 Create - returns 400 on whitespace-only name
- [x] 🟩 Create - trims leading and trailing whitespace from name
- [x] 🟩 Rename - updates project name when found
- [x] 🟩 Rename - returns 404 when not found
- [x] 🟩 Rename - returns 400 on empty name
- [x] 🟩 Rename - returns 400 on whitespace-only name
- [x] 🟩 Delete - returns 204 and removes project when found
- [x] 🟩 Delete - returns 404 when not found
- [x] 🟩 Delete - cascade deletes tasks belonging to the project
- [x] 🟩 Delete - does not delete tasks in Inbox (null ProjectId)

## Next.js Frontend

### AddTaskForm
- [x] 🟩 shows error when submitted with empty title
- [x] 🟩 calls onAdd with trimmed title and correct projectId on valid submission
- [x] 🟩 clears title and deadline fields after successful submission
- [x] 🟩 shows error message when onAdd throws
- [x] 🟩 syncs selected project when defaultProjectId prop changes

### AssignProjectButton
- [x] 🟩 renders with the current project pre-selected
- [x] 🟩 shows inline error when API call fails

### CompleteTaskButton
- [x] 🟩 renders "Mark complete" when task is incomplete
- [x] 🟩 renders "Mark incomplete" when task is completed
- [x] 🟩 shows inline error when API call fails

### DeleteTaskButton
- [x] 🟩 renders delete button with correct aria-label
- [x] 🟩 shows inline error when API call fails

### api.ts
- skipped: all functions are thin fetch wrappers; createTask error extraction is trivial

### format.ts
- [x] 🟩 deadlineColorClass - returns muted zinc for null (no deadline)
- [x] 🟩 deadlineColorClass - returns red for a past deadline
- [x] 🟩 deadlineColorClass - returns yellow for a deadline exactly today (boundary: diff = 0)
- [x] 🟩 deadlineColorClass - returns yellow for a deadline 3 days out (boundary: diff = 3)
- [x] 🟩 deadlineColorClass - returns muted zinc for a deadline 4 days out (just outside warning)
- [x] 🟩 formatDate - formats ISO string to a readable local date

### TaskCard
- [x] 🟩 renders task title as a link to /tasks/[id]
- [x] 🟩 checkbox is unchecked when task is not completed
- [x] 🟩 checkbox is checked when task is completed
- [x] 🟩 calls onComplete(id, true) when unchecked checkbox is clicked
- [x] 🟩 three-dot menu is hidden by default
- [x] 🟩 three-dot menu opens when the options button is clicked
- [x] 🟩 calls onDelete(id) when Delete is clicked from the open menu
- [x] 🟩 shows "No deadline" when deadline is null
- [x] 🟩 shows formatted deadline when deadline is set
- [x] 🟩 shows project name when activeView is "all"
- [x] 🟩 hides project name when activeView is "inbox"
- [x] 🟩 applies line-through to title when task is completed and not hiding
