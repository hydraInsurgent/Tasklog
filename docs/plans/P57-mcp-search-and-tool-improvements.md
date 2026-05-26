# Feature Implementation Plan: MCP search/filter + tool surface improvements

**Overall Progress:** `85%`

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

- [x] 🟩 **Step 1: Backend - extend `GET /api/tasks` with filter query params** `[sequential]` → depends on: nothing
  - [x] 🟩 1.1 Added `TaskFilterQuery` record + `[FromQuery]` binding on `TasksController.GetAll()`.
  - [x] 🟩 1.2 EF Core IQueryable composition: each filter applied conditionally, preserves `OrderByDescending(CreatedAt)`.
  - [x] 🟩 1.3 `inbox=true` + non-empty `projectIds` returns 400.
  - [x] 🟩 1.4 12 new tests in `TasksControllerTests.cs`. Total backend tests: 53/53 passing. Note: text filter required explicit `ToLower()` on both sides because EF Core InMemory doesn't simulate SQLite's case-insensitive `LIKE`.
  - [ ] 🟥 1.5 Smoke test via curl - defer until after Step 2 so we can curl with real data via the live backend.

- [x] 🟩 **Step 2: MCP - extend `listTasks()` and `list_tasks` tool with filter support** `[sequential]` → depends on: Step 1
  - [x] 🟩 2.1 `api.listTasks(filter?)` + `buildTaskQuery()` helper in `api-client.ts`; omits undefined/empty fields, comma-joins arrays.
  - [x] 🟩 2.2 `list_tasks` Zod schema extended with all 7 optional filter params.
  - [x] 🟩 2.3 Tool description updated with filter explanation, example phrasings, and a "Returns:" shape hint.
  - [x] 🟩 2.4 13 tests in new `mcp/src/api-client.test.ts` covering `buildTaskQuery` serialization (undefined omit, empty-array omit, comma-join, boolean false survives, whitespace text omit, combined). 59/59 MCP tests pass. (Tested the query-builder directly rather than the tool passthrough - higher value, no fetch mocking.)
  - [ ] 🟥 2.5 End-to-end verification deferred to Step 6 (deploy + live phone test).

- [x] 🟩 **Step 3: MCP - merge `complete_task` + `uncomplete_task` into `set_task_completion`** `[sequential]` → depends on: Step 2
  - [x] 🟩 3.1 Removed both old tool registrations.
  - [x] 🟩 3.2 Added `set_task_completion(id, isCompleted)`, reuses existing `api.setTaskComplete`.
  - [x] 🟩 3.3 Description guides the LLM on both directions (mark done / reopen).
  - [x] 🟩 3.4 No test changes needed - the old tools had no unit tests; the file header comment updated to reflect 7 tools.

- [x] 🟩 **Step 4: Web UI - add text-search input to `FilterPanel`** `[parallel]` → delivers: client-side text search on the existing filter panel
  - [x] 🟩 4.1 `FilterState` gained `text: string`.
  - [x] 🟩 4.2 `EMPTY_FILTER`, `hasActiveFilters`, `activeFilterCount` updated (whitespace-only text = inactive).
  - [x] 🟩 4.3 Text input at the top of the panel (above Labels). Applies on Apply click or Enter key. Matches existing input styling + focus ring.
  - [x] 🟩 4.4 Filter clause #5 in `TasksClient.tsx`: case-insensitive `.includes()` on title.
  - [x] 🟩 4.5 Frontend type-check + 37 jest tests pass. **Extra:** hardened `ProjectLayout` sessionStorage restore to merge over `EMPTY_FILTER`, so a filter state persisted before the `text` field existed doesn't break `.trim()`.

- [x] 🟩 **Step 5: Docs + CHANGELOG** `[sequential]` → depends on: Steps 1-4
  - [x] 🟩 5.1 architecture.md: `GET /api/tasks` filter params documented in the endpoint table; MCP tool count corrected 16 → 15 (two spots) + list_tasks/set_task_completion note in the tool-layer section.
  - [x] 🟩 5.2 CHANGELOG.md: new v2.10.1 section (Added: filters + UI search; Changed: tool merge, no-deadline + contradictory-param rules).
  - [x] 🟩 5.3 coverage.md: backend 53 tests, MCP 59 tests, api-client.ts coverage bumped, last-updated date.

- [ ] 🟥 **Step 6: Deploy + smoke test on phone** `[sequential]` → depends on: Step 5. Script changes none; just running the existing deploy.
  - [ ] 6.1 🟥 Run `./scripts/deploy-phone.sh` from the laptop.
  - [ ] 6.2 🟥 Smoke test from Claude on phone: "what tasks do I have in the Work project?" should call `list_tasks({projectIds: [...]})`. "Mark task 42 done" should call `set_task_completion({id:42, isCompleted:true})`.
  - [ ] 6.3 🟥 Verify the old `complete_task` / `uncomplete_task` tools are gone from claude.ai's tool list after reconnecting the connector.

## Outcomes

<!-- Fill in after execution: decision-relevant deltas only. What changed vs. planned? Key decisions made? Assumptions invalidated? -->
