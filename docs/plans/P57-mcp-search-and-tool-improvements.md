# Feature Implementation Plan: MCP search/filter + tool surface improvements

**Overall Progress:** `0%`

**Tracking issue:** [#57](https://github.com/hydraInsurgent/Tasklog/issues/57)
**Branch:** `feature/mcp-search-and-tool-improvements-#57`
**Target version:** v2.10.1 (first patch toward v2.11.0 rollup per [proposal-mcp-and-ui-additions.md](proposal-mcp-and-ui-additions.md))

## TLDR

Extend the existing `GET /api/tasks` endpoint with optional filter query params (project, inbox, labels, deadline range, completion, text-substring on title). Surface the same filtering through the MCP `list_tasks` tool. Replace the two-tool `complete_task` / `uncomplete_task` pair with a single `set_task_completion(id, isCompleted)`. Add a text-search input to the web UI's existing filter panel (client-side).

No new MCP tool. No new API endpoint. No DB schema changes. Backwards compatible: no-args `list_tasks` keeps existing meaning of "return all".

## Goal State

**Current State:** `list_tasks` returns the firehose unconditionally. The LLM has to fetch everything and filter client-side to answer "what's due this week?" or "what's in Work?" The MCP tool surface has 16 tools, two of which (`complete_task` / `uncomplete_task`) do the same thing with opposite booleans.

**Goal State:** `list_tasks` accepts optional filters that the backend applies via EF Core. The MCP tool surface drops from 16 → 15 tools (one less by merging completion tools). The web UI gains a text-search box on the existing filter panel.

## Critical Decisions

- **Decision 1: Extend `list_tasks`, do NOT add `search_tasks` as a new tool.**
  - **Options considered:** (a) Replace `list_tasks` with new `search_tasks(filter)`. (b) Keep `list_tasks` and add `search_tasks` alongside. (c) Just extend `list_tasks` to accept optional filter params.
  - **Chosen:** (c) - cleanest abstraction. "List, optionally filtered" is the same mental model whether you filter or not.
  - **Trade-offs accepted:** None functionally; the "search" framing in the proposal was a leftover that didn't survive scrutiny.

- **Decision 2: Filter combination semantics: AND across dimensions, OR within `projectIds` and within `labelIds`.**
  - Mirrors what the existing web UI FilterPanel does (`FilterPanel.tsx` already has `projectIds: number[]` and `labelIds: number[]` arrays with OR-within semantics).
  - Tasks with no deadline are excluded from `dueBefore` / `dueAfter` filters (Q3 decision).
  - `inbox=true` + non-empty `projectIds` → 400 Bad Request (Q2 decision: fail loudly on contradictory filters).

- **Decision 3: Web UI keeps client-side filtering. Server-side filter is for MCP consumers only.**
  - Web UI currently fetches all tasks once and filters in `TasksClient.tsx` via `FilterPanel`. Works fine, instant filter UI.
  - Moving the UI to server-side would mean a round-trip per filter change. No UX win, more plumbing.
  - The text-search box (Q6: in scope) filters client-side too, consistent with the rest of FilterPanel.

- **Decision 4: Delete `complete_task` and `uncomplete_task` immediately, no deprecation period.**
  - claude.ai re-fetches tool definitions on every connector reconnect; old tools just disappear from the list.
  - Single-user app, no migration risk.

- **Decision 5: No DB schema changes, no new endpoints.**
  - Backend change is purely additive query-param handling on the existing `GET /api/tasks`. No-args call preserves existing behavior.

## API contract (the change in one block)

```
GET /api/tasks
  Query parameters (all optional):
    projectIds  comma-separated ints, e.g. "3,5"       (OR-within)
    inbox       "true" | "false"                       (mutually exclusive with projectIds)
    labelIds    comma-separated ints, e.g. "1,2,7"     (OR-within)
    dueBefore   ISO 8601 date, e.g. "2026-12-31"       (inclusive; excludes no-deadline tasks)
    dueAfter    ISO 8601 date                          (inclusive; excludes no-deadline tasks)
    completed   "true" | "false"                       (omit for both)
    text        substring on title, case-insensitive   (e.g. "?text=review")

  Combination semantics:
    - All params AND together across dimensions.
    - Within projectIds/labelIds arrays, OR semantics.
    - No params = current behavior (all tasks).
    - inbox=true + projectIds= ... → 400 "use one or the other"
```

```
list_tasks (MCP tool) - extended Zod schema:
  list_tasks({
    projectIds?: number[],
    inbox?: boolean,
    labelIds?: number[],
    dueBefore?: string (ISO date),
    dueAfter?: string (ISO date),
    completed?: boolean,
    text?: string
  }) -> Task[]
```

```
set_task_completion (MCP tool) - new, replaces complete_task + uncomplete_task:
  set_task_completion({
    id: number,
    isCompleted: boolean
  }) -> Task
```

## Tasks

- [ ] 🟥 **Step 1: Backend - extend `GET /api/tasks` with filter query params** `[sequential]` → depends on: nothing
  - [ ] 🟥 1.1 Add query-param binding to `TasksController.GetAll()`: `projectIds`, `inbox`, `labelIds`, `dueBefore`, `dueAfter`, `completed`, `text`. Use `[FromQuery]` model binding with a `TaskFilterQuery` record for shape.
  - [ ] 1.2 🟥 Implement filter logic via EF Core. Build `IQueryable<TaskModel>` from `_context.Tasks.Include(t => t.Labels)`; conditionally apply each filter; preserve `OrderByDescending(t => t.CreatedAt)`.
  - [ ] 1.3 🟥 Validate `inbox=true` + non-empty `projectIds` → 400 with descriptive error.
  - [ ] 1.4 🟥 Unit tests in `backend/Tasklog.Api.Tests/`: each filter dimension individually, AND-across, OR-within, no-args (full list), edge cases (empty arrays, invalid dates, contradictory inbox+projectIds).
  - [ ] 1.5 🟥 Smoke test via `curl`: a few representative queries against the running backend.

- [ ] 🟥 **Step 2: MCP - extend `listTasks()` and `list_tasks` tool with filter support** `[sequential]` → depends on: Step 1
  - [ ] 2.1 🟥 Extend `api.listTasks()` in `mcp/src/api-client.ts` to accept optional `TaskFilter` object; serialize each provided field into the query string (omit undefined fields).
  - [ ] 2.2 🟥 Extend the `list_tasks` tool's Zod input schema in `mcp/src/tools/tasks.ts` with all filter params optional.
  - [ ] 2.3 🟥 Update the tool description to mention filtering, with one-line "Returns:" hint per the new toolkit pattern. Include example phrasing the LLM can match ("tasks due this week", "in Work project", "tagged urgent").
  - [ ] 2.4 🟥 Add unit tests in `mcp/src/tools/tasks.test.ts` (new file - matches the test layer convention from P50) covering the filter wiring: no-args, single dimension, multi-dimension AND, OR-within array, edge cases.
  - [ ] 2.5 🟥 Verify end-to-end by running the MCP server locally and calling `list_tasks` with a few filter combinations via the test harness or a manual JSON-RPC payload.

- [ ] 🟥 **Step 3: MCP - merge `complete_task` + `uncomplete_task` into `set_task_completion`** `[sequential]` → depends on: Step 2
  - [ ] 3.1 🟥 Remove `complete_task` and `uncomplete_task` tool registrations from `mcp/src/tools/tasks.ts`.
  - [ ] 3.2 🟥 Add `set_task_completion(id, isCompleted)` tool. Reuse the existing `api.setTaskComplete(id, isCompleted)` client function (already takes the boolean - no api-client change needed).
  - [ ] 3.3 🟥 Description: explicit guidance for the LLM that this is the toggle for both "mark done" and "undo completion".
  - [ ] 3.4 🟥 Update tests to remove old tool references and add `set_task_completion` coverage.

- [ ] 🟥 **Step 4: Web UI - add text-search input to `FilterPanel`** `[parallel]` → delivers: client-side text search on the existing filter panel (independent of Steps 1-3; touches frontend files only)
  - [ ] 4.1 🟥 Extend `FilterState` interface in `FilterPanel.tsx` with `text: string`.
  - [ ] 4.2 🟥 Update `EMPTY_FILTER`, `hasActiveFilters`, `activeFilterCount` to account for `text`.
  - [ ] 4.3 🟥 Add a text input field at the top of the FilterPanel popover (above Labels section). Apply on Apply button click (consistent with rest of panel - no live filtering).
  - [ ] 4.4 🟥 Apply the text filter in `TasksClient.tsx`'s client-side filter logic: case-insensitive `.includes()` on `task.title`.
  - [ ] 4.5 🟥 Visual check across desktop and mobile breakpoints. Confirm focus indicator on the input meets the existing WCAG AA expectation.

- [ ] 🟥 **Step 5: Docs + CHANGELOG** `[sequential]` → depends on: Steps 1-4
  - [ ] 5.1 🟥 Update `docs/architecture.md` API endpoints table: `GET /api/tasks` now accepts query params (one-line note + link to this plan for the full shape).
  - [ ] 5.2 🟥 Update `CHANGELOG.md` with a v2.10.1 section describing the new filter capability and the tool consolidation.
  - [ ] 5.3 🟥 Update `docs/tests/coverage.md` with the new test counts for the MCP layer and the backend layer.

- [ ] 🟥 **Step 6: Deploy + smoke test on phone** `[sequential]` → depends on: Step 5. Script changes none; just running the existing deploy.
  - [ ] 6.1 🟥 Run `./scripts/deploy-phone.sh` from the laptop.
  - [ ] 6.2 🟥 Smoke test from Claude on phone: "what tasks do I have in the Work project?" should call `list_tasks({projectIds: [...]})`. "Mark task 42 done" should call `set_task_completion({id:42, isCompleted:true})`.
  - [ ] 6.3 🟥 Verify the old `complete_task` / `uncomplete_task` tools are gone from claude.ai's tool list after reconnecting the connector.

## Outcomes

<!-- Fill in after execution: decision-relevant deltas only. What changed vs. planned? Key decisions made? Assumptions invalidated? -->
