# Test Coverage

**Last updated:** 2026-03-14

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
- [ ] 🟥 shows validation error when submitted with empty title
- [ ] 🟥 calls onAdd with correct data on valid submission
- [ ] 🟥 clears the form after successful submission

### AssignProjectButton
- [ ] 🟥 renders current project name when assigned
- [ ] 🟥 calls onAssign with selected project id on change

### CompleteTaskButton
- [ ] 🟥 calls onComplete with correct task id and toggled state

### DeleteTaskButton
- [ ] 🟥 calls onDelete with correct task id on confirmation

### api.ts
- [ ] 🟥 evaluate whether fetch wrappers contain logic worth testing
