# Feature Implementation Plan: list_tasks query completeness

**Overall Progress:** `75%`

**Tracking issue:** [#65](https://github.com/hydraInsurgent/Tasklog/issues/65)
**Branch:** `feature/list-tasks-query-completeness-#65`
**Target version:** v2.10.6 (patch) - first of [proposal-next-versions.md](proposal-next-versions.md)

## TLDR

Extend `GET /api/tasks` and the MCP `list_tasks` tool with the query controls that were missing after the v2.10.x run: `createdAfter`/`createdBefore` date-range filters, `sort` + `order`, and a `limit`. The headline gap - "what did I add today" - currently forces pulling everything and eyeballing dates. No DB migration; MCP-facing (the web UI filters client-side and is untouched).

## Goal State

**Current State:** `list_tasks` filters by project/inbox/labels/deadline/completed/text/priority, always returns every match ordered newest-first, with no way to filter by creation date or cap the result.

**Goal State:** Callers can filter by creation-date range, choose the sort field + direction, and cap the count - all additive query params on the same endpoint.

## Critical Decisions

- **Decision 1: `createdAfter`/`createdBefore` are inclusive datetime comparisons on `CreatedAt`.** Mirrors `dueBefore`/`dueAfter` (`>=`/`<=`). `CreatedAt` is non-null so no `HasValue` guard. Nuance: unlike date-only `Deadline`, `CreatedAt` carries a time, so "what did I add today" = `createdAfter=<today>` (everything from midnight on); `createdBefore=<date>` means up to that instant (midnight of that date). Documented in the MCP description.
- **Decision 2: sort = two fields, `sort` (`created`/`deadline`/`priority`) + `order` (`asc`/`desc`).** Default `created`/`desc` (today's exact behaviour, so the change is backwards-compatible). Deadline sort is **nulls-last** via `OrderBy(t => t.Deadline == null).Then[By|ByDescending](t => t.Deadline)` - the `== null` boolean orders non-null (false) before null (true), and this translates correctly in both SQLite and EF Core InMemory. Priority `asc` = P1 first (1..4). Stable tiebreak: `.ThenByDescending(t => t.CreatedAt)`.
- **Decision 3: `limit` is a post-sort count cap (`.Take(N)`), opt-in.** Omitted = return all (unchanged). `limit < 1` → 400. Not cursor pagination - a count cap is enough for a single-user app and keeps the MCP context budget in check.
- **Decision 4: new `TaskFilterQuery` params get `= null` defaults.** So the existing positional `new TaskFilterQuery(...)` call sites in the tests keep compiling (same approach used for `Priorities` in #64). Unknown/invalid `sort`/`order` strings fall back to the default rather than erroring (lenient, matches the forgiving filter style).

<!-- GUIDELINES CHECK: no new pattern, no migration, no product-scope change. Pure additive extension of the existing [FromQuery] filter + the established OrderBy chain. -->

## API contract

```
GET /api/tasks  - new optional query params (all additive):
  createdAfter   ISO date   tasks with CreatedAt >= value
  createdBefore  ISO date   tasks with CreatedAt <= value
  sort           string     created | deadline | priority   (default: created)
  order          string     asc | desc                       (default: desc)
  limit          int        cap result to most N after sort; <1 -> 400; omit = all

list_tasks (MCP): same params surfaced on the tool; arrays/dates serialized as today.
```

## Tasks

- [x] 🟩 **Step 1: Backend - filters, sort, limit on GetAll** `[sequential]` → depends on: nothing
  - [x] 🟩 1.1 `TaskFilterQuery` gained `CreatedAfter`/`CreatedBefore`/`Sort`/`Order`/`Limit`, all `= null`.
  - [x] 🟩 1.2 Added the two `CreatedAt` range `.Where` clauses; `Limit is < 1` returns 400.
  - [x] 🟩 1.3 Replaced the fixed order with a created/deadline/priority x asc/desc switch; deadline nulls-last via `OrderBy(t => t.Deadline == null)`; tiebreak `ThenByDescending(CreatedAt)` for deadline/priority sorts.
  - [x] 🟩 1.4 `.Take(Limit.Value)` after ordering when set.
  - [x] 🟩 1.5 10 tests (createdAfter/before, deadline asc+desc nulls-last, priority asc/desc, created asc, limit caps to N, limit<1 400, default unchanged). 109 backend tests pass.

- [x] 🟩 **Step 2: MCP - surface on list_tasks** `[sequential]` → depends on: Step 1
  - [x] 🟩 2.1 `TaskFilter` gained `createdAfter`/`createdBefore`/`sort`/`order`/`limit`; `buildTaskQuery` serializes them via `params.set`.
  - [x] 🟩 2.2 `list_tasks` schema: 5 params (`sort`/`order` as Zod enums, `limit` int min 1) with describe text incl. the "createdAfter for added-today" + "top 5 by priority" hints. Returns shape unchanged.
  - [x] 🟩 2.3 4 buildTaskQuery tests (createdAfter/before, sort+order, limit incl 0 pass-through, omitted absent). Typecheck clean; 78 MCP tests pass.

- [x] 🟩 **Step 3: Docs + CHANGELOG** `[sequential]` → depends on: Steps 1-2
  - [x] 🟩 3.1 architecture.md: rewrote the `GET /api/tasks` row with createdAfter/before, sort/order, limit.
  - [x] 🟩 3.2 CHANGELOG.md: v2.10.6 section. coverage.md: counts (109 backend / 78 MCP) + query checklists.

- [ ] 🟥 **Step 4: Deploy + smoke test** `[sequential]` → depends on: Step 3
  - [ ] 🟥 4.1 `./scripts/deploy-phone.sh`.
  - [ ] 🟥 4.2 Live curl: `?createdAfter=<today>` returns only today's tasks; `?sort=deadline&order=asc` orders with nulls last; `?sort=priority` P1 first; `?limit=3` returns 3; `?limit=0` -> 400.
  - [ ] 🟥 4.3 DEFERRED user spot-check (non-blocking): in Claude, "what did I add today", "show my tasks by deadline", "top 5 by priority".

## Outcomes

<!-- Fill in after execution: decision-relevant deltas only. What changed vs. planned? Key decisions made? Assumptions invalidated? -->
