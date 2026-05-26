# Tasklog Engineering Guidelines

This document describes how the codebase is currently structured and why.
It is not a rulebook - it is context. When something deviates from these patterns,
that is worth a conversation, not necessarily a blocker.

Read `docs/architecture.md` first to understand the system structure.

---

## Core principle

**Right-sized, not over-engineered.**

Add abstraction when it removes real duplication or makes something genuinely clearer.
The codebase should be understandable by reading it top to bottom.
When in doubt, prefer the simpler approach and evolve later.

---

## Backend (ASP.NET Core Web API)

### Current patterns

- Controllers handle HTTP concerns: routing, input validation, response codes.
- Controllers call `DbContext` directly - no repository or service layer yet.
- Request bodies use C# `record` types (immutable, concise).
- All database operations are `async`/`await`.
- Route constraints enforce types at the URL level (e.g. `{id:int}`).
- Timestamps are stored in UTC (`DateTime.UtcNow`).

### Current patterns - additions from v2.4

- **EF Core eager loading with `.Include()`** - used in `TasksController` to load `Labels` alongside tasks. All task queries use `.Include(t => t.Labels)` so callers always receive a populated `labels` array. Use the same pattern for any future navigation property that is always needed with the parent entity.
- **Many-to-many via implicit join table** - `TaskModel` and `Label` use EF Core's `HasMany/WithMany` to configure a join table (`LabelTaskModel`) without an explicit join entity. Cascade deletes on the join table are handled automatically by the database.

### Current patterns - additions from v2.10.2

- **`JsonElement` partial PATCH (present-key detection)** - `TasksController.Update` (`PATCH /api/tasks/{id}`) binds the body to `[FromBody] JsonElement` and inspects each field with `TryGetProperty`, rather than binding to a typed record. This is the only way to distinguish "field omitted" (keep the current value) from "field set to `null`" (clear it). A typed record with nullable properties collapses both cases to `null`, so it cannot express a clear-vs-keep difference. Reach for this whenever a PATCH needs nullable-clear semantics. Unlike query-string array binding, the present-key logic is directly unit-testable: build a `JsonElement` from a JSON string with `JsonDocument.Parse(json).RootElement.Clone()` and pass it to the action, which exercises the same branching the HTTP body would.

### Patterns not yet in use - and when to consider them

**Repository pattern** - not used currently. DbContext is injected directly into controllers.
Worth considering if the data access layer needs to be swapped out or tested in isolation.

**Service layer** - not used currently. Business logic (minimal right now) lives in the controller.
Worth introducing when controller actions contain logic that is not HTTP-specific
and is shared across more than one action.

**AutoMapper / object mapping** - not used. Models are simple enough to map by hand.
Worth considering if the gap between API response shapes and database models grows significantly.

**Global exception handling middleware** - not used. Controllers return explicit error responses.
Worth adding when error handling becomes repetitive across many endpoints.

### Response codes

| Situation | Code |
|-----------|------|
| Success with data | 200 OK |
| Created | 201 Created (with `CreatedAtAction`) |
| Success, nothing to return | 204 No Content |
| Invalid input | 400 Bad Request |
| Not found | 404 Not Found |

---

## Frontend (Next.js App Router)

### Server Components vs Client Components

Default to Server Components. Add `"use client"` when the component needs:
- `useState` or `useEffect`
- Browser event handlers (onClick, onChange, onSubmit)
- Browser-only APIs

Current component breakdown:

| Component | Type | Reason |
|-----------|------|--------|
| `layout.tsx` | Server | Static shell, no interaction |
| `page.tsx` | Server | Renders client component, no state |
| `tasks/[id]/page.tsx` | Server | Fetches task and projects, no interaction |
| `ProjectLayout.tsx` | Client | Owns activeView and projects state, handles project CRUD |
| `ProjectSidebar.tsx` | Client | Project nav with create/rename/delete interactions |
| `TasksClient.tsx` | Client | Owns task list state, handles mutations, filters by activeView |
| `AddTaskForm.tsx` | Client | Controlled inputs, form submission, project dropdown |
| `AssignProjectButton.tsx` | Client | Select element, PATCH on change, router.refresh() |
| `DeleteTaskButton.tsx` | Client | Click handler, redirect |
| `CompleteTaskButton.tsx` | Client | Click handler, router.refresh() (no redirect) |

### API calls

Fetch calls currently live in `src/lib/api.ts`. This keeps the API contract
in one place and makes it easy to see what the frontend depends on.
If a new pattern is needed (e.g. React Query, SWR), that is a good conversation
to have before adding ad-hoc fetch calls elsewhere.

### Component responsibilities

- One component, one job as a starting point.
- Components that manage data should not also own complex layout - but use judgement.
- Error and loading states should always be handled. A blank screen is never intentional.

### Styling

- Tailwind utility classes are the current approach.
- The default Tailwind colour scale maps to the UI spec - see `UI-SPEC.md`.
- Arbitrary values (e.g. `w-[137px]`) are a signal to check if a scale value would work instead.
- Responsive: mobile-first. `sm:` prefix for desktop variants.

### Custom hooks

Reusable hooks live in `src/hooks/`. Current hooks:

| Hook | Purpose |
|------|---------|
| `usePolling(fetchFn, intervalMs, enabled)` | Background data refresh on a timer. Pauses when the tab is hidden (Page Visibility API) and when `enabled` is false (e.g. during in-flight operations). Fires an immediate fetch when the tab becomes visible again. Used in TasksClient, ProjectLayout, and LabelsClient. |

When adding a new hook, place it in `src/hooks/` and follow the same pattern: accept a callback, an interval or config, and an `enabled` flag for conditional execution.

### Shared utilities

When the same logic appears in more than one place, extracting it to `src/lib/`
is worth considering. Current candidates: `formatDate`, `deadlineColorClass` (issue #5).

---

## MCP server (Node/TypeScript, v2.10+)

The MCP server is the first Node.js service in the repository. Different patterns
from the .NET backend and Next.js frontend; documented here so the precedent is explicit.

### Current patterns

- **Hono with `@hono/node-server`** as the HTTP framework. Chosen over Express for modern TypeScript-native types, smaller dep tree, equivalent capability for this scope.
- **TypeScript strict mode + NodeNext module resolution.** All imports use explicit `.js` extensions (NodeNext requires this, even when importing from TypeScript source).
- **Hand-rolled OAuth 2.1** rather than a library. Visibility into every spec requirement was prioritized over ergonomics, given this was the project's first OAuth implementation.
- **Opaque tokens (not JWT).** Random 32-byte hex strings stored in SQLite with metadata. Simpler than JWT (no key management) and trivially revocable.
- **Zod schemas inlined** per tool file (not centralized in a `schemas.ts`). With 16 small tools across 3 files, the indirection of a separate schemas file would not pay back.
- **`node:test` for unit tests** (not Jest or Vitest). Built into Node 20+, no extra dependency. Test files are `*.test.ts` next to the code they test; excluded from production build via tsconfig.
- **`better-sqlite3` for the auth DB.** Synchronous API matches the rest of the request-handler shape; performance is microsecond-scale for the kinds of lookups we do (single token, single client).

### Patterns not yet in use - and when to consider them

**Refactor `store.ts` to accept an injected DB path / in-memory mode** - currently it opens the configured file at module load. Worth doing if we ever want to add DB-backed unit tests (currently we rely on end-to-end smoke testing for rotation, audience, expiry).

**ESLint / Prettier** - skipped in the initial scaffold. TypeScript strict mode catches most issues; editor-side formatting handles consistency. Worth adding if collaborators join, or if drift becomes a problem.

**A library-based OAuth server** (e.g. `mcp-auth`) - hand-rolled was correct for learning, but if requirements grow (refresh token chains, multiple upstream IdPs, scoped consent), a library may be worth migrating to.

### Response codes (MCP server specific)

| Situation | Code |
|-----------|------|
| Missing or bad Bearer token on `/mcp` | 401 + RFC 9728 `WWW-Authenticate` |
| Wrong Origin on `/mcp` | 403 |
| Unsupported MCP-Protocol-Version | 400 |
| Bad OAuth request (missing params, bad PKCE, etc.) | 400 with RFC 6749 error code in JSON body |
| `GET /mcp` (no server-initiated push) | 405 with `Allow: POST` |

---

## Known deviations from these patterns

These are open issues - areas where the current code does not yet match the patterns above.
They are tracked rather than hidden so they can be addressed deliberately.

| Issue | What's not yet in place |
|-------|------------------------|
| [#1](https://github.com/hydraInsurgent/Tasklog/issues/1) | CORS not applied outside dev; server-side fetch uses localhost |
| [#2](https://github.com/hydraInsurgent/Tasklog/issues/2) | Feedback timer not cleared; optimistic delete before API confirms |
| [#3](https://github.com/hydraInsurgent/Tasklog/issues/3) | Database path is relative; API URL has no startup validation |
| [#4](https://github.com/hydraInsurgent/Tasklog/issues/4) | Contrast and focus indicators below WCAG AA in places |
| [#5](https://github.com/hydraInsurgent/Tasklog/issues/5) | Utility functions duplicated; DateTime.Now instead of UtcNow |
| [#6](https://github.com/hydraInsurgent/Tasklog/issues/6) | CORS policy too broad; AllowedHosts is wildcard |
| [#17](https://github.com/hydraInsurgent/Tasklog/issues/17) | ProjectsController CreatedAtAction points to wrong route |
| [#18](https://github.com/hydraInsurgent/Tasklog/issues/18) | Inconsistent DateTime.Now vs UtcNow across controllers |
| [#19](https://github.com/hydraInsurgent/Tasklog/issues/19) | Assigning task to non-existent project returns 500 not 400 |

---

## When adding a feature

A useful checklist - not a gate:

1. Read `docs/architecture.md` to understand where the change fits.
2. Glance at `docs/product-design.md` - if the feature shifts the product scope, that is worth noting before building.
3. Add an API endpoint if new data operations are needed.
4. Add a typed function in `src/lib/api.ts` for any new endpoint.
5. Build UI in the right component type (Server if read-only, Client if interactive).
6. If logic is shared across components, extract it to `src/lib/` rather than copying.
