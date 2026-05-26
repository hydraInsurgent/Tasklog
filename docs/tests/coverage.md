# Test Coverage

**Last updated:** 2026-05-24 (#57 - task filter on GetAll + api-client query serialization)

---

## Coverage Report

> Updated by `/unit-test` each run. Use these numbers to assess impact without re-running tests.
> If a component is unchanged since this date and shows 100% branch coverage, it is unaffected.
> If a component changed, or any file it imports changed, re-run coverage to verify.

### .NET Backend - last run 2026-03-14

| Class | Lines | Branches | Notes |
|---|---|---|---|
| TasksController | 100% | 100% | All methods and branches covered. +13 tests for GetAll filters (#57, incl. text-trim) - 54 backend tests total |
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
| api-client.ts | ~80% | ~85% | 30% | `buildTaskQuery` now directly covered by 13 tests in api-client.test.ts (#57). HTTP/timeout paths still integration territory |
| config.ts | 89.83% | 40% | 100% | Production-only validation branches not fired in tests |
| oauth/authorize.ts | - | - | - | Not unit-tested; end-to-end smoke-tested via claude.ai connector |
| oauth/github.ts | - | - | - | Same - integration territory (GitHub fetch + signed cookie + redirect chain) |
| oauth/register.ts | - | - | - | Primary surface is Zod schema (statically typed) |
| oauth/well-known.ts | - | - | - | Returns fixed JSON metadata |
| server.ts | - | - | - | Hono mount order + request logger; covered by middleware tests + end-to-end smoke |

**60 tests, 0 failures** (was 46; +14 in api-client.test.ts for #57, incl. text-trim). Run with: `npm test --prefix mcp` (auto-rebuilds better-sqlite3 for host arch via pretest hook if needed).

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

### Not covered (and why)
- `tools/tasks.ts`, `tools/projects.ts`, `tools/labels.ts` - thin api-client wrappers; behavior is exercised through `runTool` tests + the end-to-end smoke run with claude.ai.
- `api-client.ts` - HTTP wrapper. Timeout path (R4 fix) is integration territory; would need a mocked .NET API to test cleanly.
- `oauth/authorize.ts` and `oauth/github.ts` - the 302 redirect + signed cookie + GitHub fetch flow is integration territory and is end-to-end smoke-tested via the live claude.ai connector.
- `oauth/register.ts` - DCR endpoint validation; primary surface is the Zod schema which is statically typed. Worth adding if/when #52 (rate limiting) lands.
- `oauth/well-known.ts` - returns fixed JSON metadata.
- `server.ts` - entry-point wiring (Hono mount order, request logger). Covered by middleware tests + end-to-end smoke.
