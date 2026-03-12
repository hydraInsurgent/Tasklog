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
| `tasks/[id]/page.tsx` | Server | Fetches data, no interaction |
| `TasksClient.tsx` | Client | Owns task list state, handles mutations |
| `AddTaskForm.tsx` | Client | Controlled inputs, form submission |
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
- The default Tailwind colour scale maps to the UI spec - see `UI-SPEC-v2-migration-plan.md`.
- Arbitrary values (e.g. `w-[137px]`) are a signal to check if a scale value would work instead.
- Responsive: mobile-first. `sm:` prefix for desktop variants.

### Shared utilities

When the same logic appears in more than one place, extracting it to `src/lib/`
is worth considering. Current candidates: `formatDate`, `deadlineColorClass` (issue #5).

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

---

## When adding a feature

A useful checklist - not a gate:

1. Read `docs/architecture.md` to understand where the change fits.
2. Glance at `docs/product-design.md` - if the feature shifts the product scope, that is worth noting before building.
3. Add an API endpoint if new data operations are needed.
4. Add a typed function in `src/lib/api.ts` for any new endpoint.
5. Build UI in the right component type (Server if read-only, Client if interactive).
6. If logic is shared across components, extract it to `src/lib/` rather than copying.
