# Test Coverage

**Last updated:** 2026-05-27 (#71 - advanced recurrence grammar: nth-weekday / from-end / intervals / UNTIL+COUNT, v2.14.1)

---

## Coverage Report

> Updated by `/unit-test` each run. Use these numbers to assess impact without re-running tests.
> If a component is unchanged since this date and shows 100% branch coverage, it is unaffected.
> If a component changed, or any file it imports changed, re-run coverage to verify.

### .NET Backend - last run 2026-03-14

| Class | Lines | Branches | Notes |
|---|---|---|---|
| TasksController | 100% | 100% | All methods and branches covered. +9 tests for Update/PATCH partial-update (#59) |
| TaskModel.ComputeDueStatus | 100% | 100% | +11 tests (#61) + 4 for the time-of-day overdue rule (#68) |
| TasksController.Bulk | 100% | 100% | +13 tests for POST /api/tasks/bulk (#63, incl. the 500-id cap) |
| TasksController (priority) | 100% | 100% | +12 tests for priority on create/update/filter (#64, incl. float/negative rejection) |
| TasksController (query) | 100% | 100% | +10 tests for createdAt range / sort / limit on GetAll (#65) |
| TasksController (ergonomics) | 100% | 100% | +11 tests for bulk setPriority + project/label name resolution (#66) |
| TasksController (description) | 100% | 100% | +9 tests for description on create/update (#67) |
| CommentsController | 100% | 100% | +10 tests for task comments (add/list/delete + GetById-includes) (#69) |
| RecurrenceRule | 100% | 100% | #70 core tests + #71 advanced (nth-weekday, last/from-end day, weekly/monthly INTERVAL>1, UNTIL/COUNT round-trip, ShouldSpawn truth table) |
| TasksController (recurrence) | 100% | 100% | #70 spawn tests + #71 end-condition gate (COUNT stops at Nth, UNTIL stops past date, series-complete comment, nth-weekday spawn) - 216 backend tests total |
| ProjectsController | 100% | 100% | All methods and branches covered |
| TasklogDbContext | 100% | 100% | |
| Program.cs | 0% | - | Framework wiring - not a test target |
| Migrations | 0% | - | Generated code - not a test target |

### MCP Server (Node + TypeScript) - last run 2026-05-19

| Module | Lines | Branches | Funcs | Notes |
|---|---|---|---|---|
| oauth/crypto.ts | 100% | 100% | 100% | |
| oauth/middleware.ts | 100% | 90.32% | 100% | |
| oauth/store.ts | 92.28% | 100% | 83.33% | Uncovered lines are TS interface declarations (no runtime code) |
| oauth/token.ts | 99% | 87.18% | 100% | L22 + L65 (defensive content-type / grant_type checks not exercised) |
| tools/result.ts | 100% | 100% | 100% | |
| api-client.ts | ~80% | ~85% | 30% | `buildTaskQuery` covered by 13 tests; `update_task` PATCH body contract (keep/clear/set) covered by 5 tests (#59), both in api-client.test.ts. HTTP/timeout paths still integration territory |
| config.ts | 89.83% | 40% | 100% | Production-only validation branches not fired in tests |
| oauth/authorize.ts | - | - | - | Not unit-tested; end-to-end smoke-tested via claude.ai connector |
| oauth/github.ts | - | - | - | Same - integration territory (GitHub fetch + signed cookie + redirect chain) |
| oauth/register.ts | - | - | - | Primary surface is Zod schema (statically typed) |
| oauth/well-known.ts | - | - | - | Returns fixed JSON metadata |
| server.ts | - | - | - | Hono mount order + request logger; covered by middleware tests + end-to-end smoke |

**92 tests, 0 failures** (was 91; +1 in api-client.test.ts for the advanced recurrence rule strings, #71). Run with: `npm test --prefix mcp` (auto-rebuilds better-sqlite3 for host arch via pretest hook if needed). Note: a fresh `npm install` on the host installs better-sqlite3 without the native binary - run `npm rebuild better-sqlite3` once after install if the OAuth store/token tests fail with `ERR_DLOPEN_FAILED`.

### Next.js Frontend - last run 2026-05-27 (81 tests; +8 for advanced recurrence: describeRecurrence + RecurrencePicker controls, #71)

| Component | Statements | Branches | Lines | Uncovered |
|---|---|---|---|---|
| AssignProjectButton.tsx | 100% | 100% | 100% | - |
| CompleteTaskButton.tsx | 100% | 100% | 100% | - |
| DeleteTaskButton.tsx | 100% | 100% | 100% | - |
| deadlinePresets.ts | 95.23% | 87.5% | 100% | L41 (one unreachable preset branch); pure resolver, 10 tests (#59) |
| TaskCard.tsx | ~80% | ~88% | ~80% | deadline popover open + edit wiring exercised via TasksClient; +3 tests for selection-mode checkbox (#63) |
| BulkActionsBar.tsx | 0% | 0% | 0% | New (#63). Integration candidate; the bar is presentational (buttons + a reused DeadlinePopover) and is exercised via the live smoke + manual UI |
| format.ts | ~88% | ~85% | ~88% | +4 tests for priorityMeta / PRIORITY_OPTIONS (#64) |
| PriorityDot.tsx | covered | - | - | Rendered + asserted via TaskCard tests (dot for P1, none for P4) (#64) |
| AddTaskForm.tsx | 45.09% | 40.74% | 49.45% | Project dropdown + label autocomplete render paths (grew since v2.4; not a regression) |
| DeadlinePopover.tsx | 10.52% | 0% | 11.76% | Behavior covered indirectly: `resolvePreset` is unit-tested; the popover is a thin button list. Direct render test is an integration candidate |
| EditTaskModal.tsx | 0% | 0% | 0% | Integration test candidate (fan-out PATCH + getTask flow); the diffing logic is the thing worth covering if it grows |
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
- [x] 🟩 Update - sets title only (deadline untouched)
- [x] 🟩 Update - trims whitespace from title
- [x] 🟩 Update - deadline null clears the deadline
- [x] 🟩 Update - deadline value sets the deadline
- [x] 🟩 Update - both title and deadline in one call
- [x] 🟩 Update - empty body is a no-op (returns the unchanged task)
- [x] 🟩 Update - returns 400 on empty/whitespace title
- [x] 🟩 Update - returns 400 on a malformed deadline string
- [x] 🟩 Update - returns 404 when not found

### TaskModel.ComputeDueStatus (dueStatus buckets, injected today)
- [x] 🟩 null deadline -> none
- [x] 🟩 from Wednesday: yesterday -> overdue
- [x] 🟩 from Wednesday: today -> today
- [x] 🟩 from Wednesday: Friday (same week) -> this_week
- [x] 🟩 from Wednesday: upcoming Sunday (inclusive boundary) -> this_week
- [x] 🟩 from Wednesday: Monday next week -> later
- [x] 🟩 from Wednesday: far future -> later
- [x] 🟩 on Sunday: tomorrow -> later (rest-of-week window empty)
- [x] 🟩 on Saturday: Sunday -> this_week; Monday -> later
- [x] 🟩 compares date-only, ignoring time of day -> today
- [x] 🟩 DueStatus property wires ComputeDueStatus to DateTime.Now
- [x] 🟩 timed deadline, past time today -> overdue (#68)
- [x] 🟩 timed deadline, future time today -> today (#68)
- [x] 🟩 date-only today stays today all day (#68)
- [x] 🟩 timed deadline tomorrow -> this_week, not overdue (#68)

### TasksController (priority, #64)
- [x] 🟩 Create - defaults priority to 4 when omitted
- [x] 🟩 Create - sets priority when provided
- [x] 🟩 Create - out-of-range priority (0, 5) -> 400
- [x] 🟩 Update - sets priority when provided
- [x] 🟩 Update - omitted priority leaves it unchanged
- [x] 🟩 Update - bad priority (0, 9, -1, 2.5 float, non-number) -> 400
- [x] 🟩 GetAll - priorities filter, single value
- [x] 🟩 GetAll - priorities filter, multiple values (OR within)

### TasksController GetAll - query completeness (#65)
- [x] 🟩 createdAfter - returns tasks created on/after the date
- [x] 🟩 createdBefore - returns tasks created on/before the date
- [x] 🟩 sort=deadline asc - earliest first, nulls last
- [x] 🟩 sort=deadline desc - latest first, nulls still last
- [x] 🟩 sort=priority asc - P1 first
- [x] 🟩 sort=priority desc - P4 first
- [x] 🟩 sort=created asc - oldest first
- [x] 🟩 limit - caps to the most-recent N (respects default sort)
- [x] 🟩 limit < 1 -> 400
- [x] 🟩 default call - all rows, newest-first (unchanged behaviour)

### TasksController - agent ergonomics (#66)
- [x] 🟩 bulk setPriority - sets priority on all
- [x] 🟩 bulk setPriority - out of range (0, 5) -> 400
- [x] 🟩 bulk setPriority - missing priority -> 400
- [x] 🟩 AssignProject by name - resolves (case-insensitive)
- [x] 🟩 AssignProject by name - ambiguous (2 matches) -> 400
- [x] 🟩 AssignProject by name - missing -> 400
- [x] 🟩 AssignProject - name wins over a (wrong) id
- [x] 🟩 SetLabels by name - resolves + applies
- [x] 🟩 SetLabels by name - unknown name -> 400
- [x] 🟩 bulk assignProject by name - resolves

### TasksController - description (#67)
- [x] 🟩 Create - with description (trimmed) / without (null) / blank (null)
- [x] 🟩 Create - description > 2000 chars -> 400
- [x] 🟩 Update - sets description (trimmed)
- [x] 🟩 Update - clears (null + blank)
- [x] 🟩 Update - omitted leaves it unchanged
- [x] 🟩 Update - description > 2000 chars -> 400

### TasksController.Bulk (POST /api/tasks/bulk)
- [x] 🟩 complete true - sets IsCompleted + CompletedAt on all
- [x] 🟩 complete false - clears IsCompleted + CompletedAt on all
- [x] 🟩 complete - missing isCompleted -> 400
- [x] 🟩 assignProject - moves all to the target project
- [x] 🟩 assignProject - null moves all to Inbox
- [x] 🟩 assignProject - non-existent project -> 400
- [x] 🟩 setDeadline - sets the deadline on all
- [x] 🟩 setDeadline - null clears the deadline on all
- [x] 🟩 setDeadline - unparseable date -> 400
- [x] 🟩 empty taskIds -> 400
- [x] 🟩 more than 500 taskIds -> 400 (server-side cap, review R1)
- [x] 🟩 unknown operation -> 400
- [x] 🟩 unknown ids are skipped, returns only existing tasks

### CommentsController (#69)
- [x] 🟩 Create - adds + trims, returns 201
- [x] 🟩 Create - empty/whitespace body -> 400
- [x] 🟩 Create - body > 2000 -> 400
- [x] 🟩 Create - unknown task -> 404
- [x] 🟩 GetForTask - lists newest-first
- [x] 🟩 GetForTask - unknown task -> 404
- [x] 🟩 Delete - removes, 204
- [x] 🟩 Delete - unknown comment -> 404
- [x] 🟩 (TasksController) GetById includes comments

### RecurrenceRule helper (#70)
- [x] 🟩 Parse -> Serialize round-trips (daily / every-N / weekly / monthly)
- [x] 🟩 Parse normalizes casing + weekday order; defaults INTERVAL to 1
- [x] 🟩 NextDeadline - daily +1, every-N +N
- [x] 🟩 NextDeadline - preserves time-of-day
- [x] 🟩 NextDeadline - weekly single + multi (soonest matching weekday)
- [x] 🟩 NextDeadline - monthly same-day, clamps short months, year rollover
- [x] 🟩 Rejects YEARLY/HOURLY, BYSETPOS, 0/32 BYMONTHDAY, missing FREQ, weekly w/o BYDAY, monthly w/o a day rule, unknown weekday, malformed, empty (post-#71 still-rejected set)
- [x] 🟩 Rejects FREQ=DAILY with BYDAY (points to WEEKLY)

### RecurrenceRule helper - advanced grammar (#71)
- [x] 🟩 Round-trips nth-weekday (3TH / -1FR), from-end BYMONTHDAY (-1), weekly/monthly INTERVAL, UNTIL (YYYYMMDD; ISO normalized), COUNT
- [x] 🟩 NextDeadline - monthly nth-weekday (3rd Thu) + last weekday; last day of month
- [x] 🟩 NextDeadline - weekly every-other single (+14) + multi (active-week day kept); monthly every-3-months
- [x] 🟩 Rejects >1 ordinaled weekday, ordinal outside {1..4,-1}, monthly BYDAY w/o ordinal, weekly nth-weekday, BYMONTHDAY<-28, both day rules / neither, UNTIL+COUNT together, bad UNTIL, COUNT=0
- [x] 🟩 ShouldSpawn truth table - no end (always), UNTIL (inclusive cutoff), COUNT (stops when reached)

### TasksController - recurrence (#70)
- [x] 🟩 Create - stores rule + stamps SeriesId; IsRecurring true
- [x] 🟩 Create - recurrence without deadline -> 400
- [x] 🟩 Create - invalid rule -> 400
- [x] 🟩 Create - normalizes to canonical form
- [x] 🟩 Complete - spawns next occurrence (same SeriesId, deadline +rule) + logs completion comment
- [x] 🟩 Complete - carries title/description/project/priority/labels + preserves time-of-day
- [x] 🟩 Complete - non-recurring does not spawn / no comment
- [x] 🟩 Complete - re-completing does not double-spawn
- [x] 🟩 Complete - weekly advances to the next configured weekday
- [x] 🟩 Update - set assigns SeriesId; set-without-deadline 400; clear nulls rule+SeriesId; invalid rule 400
- [x] 🟩 (#71) Complete - COUNT=2 stops at the 2nd occurrence; UNTIL stops once past; series-complete comment logged; monthly nth-weekday spawn advances to the 3rd Thursday

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
- [x] 🟩 no selection checkbox when not in selection mode (#63)
- [x] 🟩 selection checkbox appears + calls onToggleSelect in select mode (#63)
- [x] 🟩 selection checkbox reflects the selected prop (#63)
- [x] 🟩 renders a priority dot for P1 (#64)
- [x] 🟩 renders no priority dot for P4 / none (#64)

### format.ts (priority, #64)
- [x] 🟩 priorityMeta - P1-P3 have a dot color, P4 has none
- [x] 🟩 priorityMeta - labels P1..P4
- [x] 🟩 priorityMeta - out-of-range falls back to P4
- [x] 🟩 PRIORITY_OPTIONS - all four in order P1..P4

### format.ts (deadline time-of-day, #68)
- [x] 🟩 hasTimeComponent - false for midnight / bare date, true for a non-midnight time
- [x] 🟩 formatDeadline - date only for midnight; appends the time when timed

### format.ts + RecurrencePicker (recurrence, #70)
- [x] 🟩 describeRecurrence - null -> ""; daily; every-N; weekly (ordered weekdays); monthly (ordinal); unknown -> "Repeats"
- [x] 🟩 RecurrencePicker - disabled + hint without a deadline
- [x] 🟩 RecurrencePicker - emits FREQ=DAILY; seeds weekday/day-of-month from the deadline on weekly/monthly
- [x] 🟩 RecurrencePicker - renders an initial rule; emits null on "Does not repeat"
- [x] 🟩 (#71) describeRecurrence - nth-weekday / last weekday / last day / from-end day / weekly+monthly intervals / "until <date>" / "for N times"
- [x] 🟩 (#71) RecurrencePicker - builds nth-weekday (seeded 4th Wed) + last-day rules; appends COUNT via the Ends control; reads an nth-weekday rule back into the ordinal/weekday dropdowns

### deadlinePresets (resolvePreset, injected `now`)
- [x] 🟩 today - returns today's local date
- [x] 🟩 tomorrow - returns now + 1 day
- [x] 🟩 weekend - returns the upcoming Saturday (from a weekday)
- [x] 🟩 weekend - returns same day when now is Saturday
- [x] 🟩 weekend - returns next day when now is Friday
- [x] 🟩 next-week - returns the upcoming Monday (from a weekday)
- [x] 🟩 next-week - returns next Monday (7 days out) when now is Monday
- [x] 🟩 none - returns null (clears the deadline)
- [x] 🟩 uses local date parts, not UTC (no off-by-one across timezones)
- [x] 🟩 handles month rollover (e.g. tomorrow from the last day of a month)

## MCP Server (Node + TypeScript, node:test)

Layer added in #50 (v2.10). Tests use an in-memory SQLite DB
(`AUTH_DB_PATH=:memory:` set by the test script). Each test file runs in
its own subprocess, so in-memory DBs are isolated across files.

### oauth/crypto.ts
- [x] 🟩 opaqueToken - returns a 64-char hex string
- [x] 🟩 opaqueToken - successive calls return different values
- [x] 🟩 pkceVerify - returns true when verifier matches the S256 challenge
- [x] 🟩 pkceVerify - returns false on a mismatched verifier
- [x] 🟩 pkceVerify - returns false on an empty verifier
- [x] 🟩 pkceVerify - uses constant-time comparison

### oauth/middleware.ts
- [x] 🟩 bearerAuthMiddleware - 401 when Authorization header missing
- [x] 🟩 bearerAuthMiddleware - 401 on non-Bearer scheme
- [x] 🟩 bearerAuthMiddleware - 401 when token is empty
- [x] 🟩 bearerAuthMiddleware - 401 when token not in DB
- [x] 🟩 bearerAuthMiddleware - 401 when token expired
- [x] 🟩 bearerAuthMiddleware - 401 when audience does not match publicUrl
- [x] 🟩 bearerAuthMiddleware - passes for a valid token
- [x] 🟩 bearerAuthMiddleware - audience trailing-slash normalization
- [x] 🟩 originMiddleware - passes when Origin missing
- [x] 🟩 originMiddleware - passes for https://claude.ai
- [x] 🟩 originMiddleware - 403 for other origins
- [x] 🟩 protocolVersionMiddleware - passes when header missing
- [x] 🟩 protocolVersionMiddleware - passes for current spec version
- [x] 🟩 protocolVersionMiddleware - passes for newer version (e.g. 2025-11-25)
- [x] 🟩 protocolVersionMiddleware - 400 when malformed

### oauth/store.ts
- [x] 🟩 inTransaction - returns the function value on normal return
- [x] 🟩 inTransaction - rolls back DB writes on throw
- [x] 🟩 inTransaction - commits DB writes on normal return
- [x] 🟩 authCodes.consume - returns and deletes (one-use)
- [x] 🟩 authCodes.consume - returns null for unknown code
- [x] 🟩 refreshTokens.consume - returns and deletes (rotation)
- [x] 🟩 refreshTokens.consume - returns null for unknown token

### oauth/token.ts
- [x] 🟩 authorization_code - 400 invalid_request when required fields missing
- [x] 🟩 authorization_code - 400 invalid_grant when code unknown
- [x] 🟩 authorization_code - 400 invalid_grant when expired (and code is consumed)
- [x] 🟩 authorization_code - 400 invalid_grant on PKCE mismatch (and code is consumed)
- [x] 🟩 authorization_code - 400 invalid_grant on client_id mismatch
- [x] 🟩 authorization_code - 400 invalid_grant on redirect_uri mismatch
- [x] 🟩 authorization_code - success issues access + refresh, code consumed
- [x] 🟩 refresh_token - 400 invalid_grant on unknown token
- [x] 🟩 refresh_token - 400 invalid_grant on expired token
- [x] 🟩 refresh_token - 400 invalid_grant on client_id mismatch
- [x] 🟩 refresh_token - success rotates (new pair issued, old consumed)

### tools/result.ts
- [x] 🟩 ok - wraps text in content array
- [x] 🟩 err - sets isError true
- [x] 🟩 runTool - success path with custom formatter
- [x] 🟩 runTool - success path without formatter JSON-stringifies
- [x] 🟩 runTool - ApiError becomes structured tool error with status
- [x] 🟩 runTool - generic Error becomes structured tool error
- [x] 🟩 runTool - non-Error throws coerced to string

### api-client.ts (api-client.test.ts)
- [x] 🟩 buildTaskQuery - serialization of all task filter params (13 tests, #57, incl. repeated-key array binding + text-trim)
- [x] 🟩 update_task - PATCH body omits an undefined field (keep)
- [x] 🟩 update_task - PATCH body includes `deadline: null` (clear)
- [x] 🟩 update_task - PATCH body includes a deadline value (set)
- [x] 🟩 update_task - PATCH body with title only
- [x] 🟩 update_task - PATCH body with both title and deadline
- [x] 🟩 Task.dueStatus - type carries dueStatus as one of the five buckets (#61, pass-through contract)
- [x] 🟩 bulk - complete body carries operation + taskIds + isCompleted (#63)
- [x] 🟩 bulk - assignProject null survives serialization (Inbox) (#63)
- [x] 🟩 bulk - setDeadline value sets / null clears (#63)
- [x] 🟩 priority - create/update body carries priority (#64)
- [x] 🟩 priority - buildTaskQuery serializes priorities as repeated keys + omits empty (#64)
- [x] 🟩 query - buildTaskQuery serializes createdAfter/createdBefore, sort+order, limit; omits when absent (#65)
- [x] 🟩 ergonomics - bulk setPriority body; assignProject-by-name body; setTaskProject projectName + setTaskLabels labelNames bodies (#66)
- [x] 🟩 description - create/update body sets it; update null clears (#67)
- [x] 🟩 comments - add_task_comment body; Task.comments optional Comment[] type (#69)
- [x] 🟩 recurrence - create/update bodies carry recurrence; update null clears; Task carries recurrence/seriesId/isRecurring (#70)
- [x] 🟩 recurrence - advanced rule strings (3TH, BYMONTHDAY=-1, INTERVAL=2, UNTIL, COUNT) pass through verbatim (#71)

### Not covered (and why)
- `tools/tasks.ts`, `tools/projects.ts`, `tools/labels.ts` - thin api-client wrappers; behavior is exercised through `runTool` tests + the end-to-end smoke run with claude.ai.
- `api-client.ts` - HTTP wrapper. Timeout path (R4 fix) is integration territory; would need a mocked .NET API to test cleanly.
- `oauth/authorize.ts` and `oauth/github.ts` - the 302 redirect + signed cookie + GitHub fetch flow is integration territory and is end-to-end smoke-tested via the live claude.ai connector.
- `oauth/register.ts` - DCR endpoint validation; primary surface is the Zod schema which is statically typed. Worth adding if/when #52 (rate limiting) lands.
- `oauth/well-known.ts` - returns fixed JSON metadata.
- `server.ts` - entry-point wiring (Hono mount order, request logger). Covered by middleware tests + end-to-end smoke.
