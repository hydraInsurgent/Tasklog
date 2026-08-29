# Flexible Time Tracking - Implementation Plan (#86)

**Overall Progress:** `100%`

## TLDR
Make time tracking Toggl-grade flexible so Tasklog becomes a daily-use tool. Two structural changes: (1) add a **Client** grouping level above Project (`Client -> Project`), app-wide; (2) **decouple time entries from tasks** - `TimeEntry.TaskId` becomes optional and each entry carries its own free-text description and its own project. Plus composer autocomplete (from past entries + open tasks), a journal/actuals breakdown by Client/Project, and a mobile-first redesign of the tracking surface. This is the *actuals* half of the Toggl model; the plan-vs-actual calendar is the deliberate next build.

## Goal State
**Current State:** `TimeEntry.TaskId` is required ([TimeEntry.cs:15](../../backend/Tasklog.Api/Models/TimeEntry.cs#L15)); the tracking bar quick-start silently creates a phantom Inbox task for anything ad-hoc ([TrackingBar.tsx:46-60](../../frontend/src/components/TrackingBar.tsx#L46-L60)). Grouping is a single flat `Project` level. Time entries derive project/color from their task. The journal sums a single time-logged total.

**Goal State:** Start a timer with just a description (+ optional project), or leave it running and categorize later - no phantom task. Entries and tasks both hang off a shared `Client -> Project` tree; an entry's task link is optional. The journal shows a time breakdown by Client/Project. The tracking bar and `/time` are redesigned mobile-first.

## Critical Decisions

- **Client vs Area naming:** the new grouping level is called **Client** (user preference - "a part of life you owe honest time to"). Pure label, mirrors the existing `Project` entity shape.
- **Task and TimeEntry stay distinct entities** sharing the `Client -> Project` tree; the entry -> task link is optional (1 task : many entries; most life entries have no task). Unify the UI later, never the schema.
- **Entry carries its own `ProjectId` (snapshot), not just via its task.** When a timer starts on a task, the entry's `ProjectId` defaults from that task's current project but is independently editable. This makes "categorize later" work for task-linked entries too, keeps the response self-contained, and makes the delete rules below safe.
- **Entry descriptions are free-text, not a managed entity.** Reuse is served by an autocomplete lookup over recent entries (distinct description -> last project/client). No "activity" table. Does not foreclose future routines (those build on tasks-with-subtasks).
- **Delete/cascade rules (data-safety - logged time is history, never silently lost):**
  - Task deleted -> its `TimeEntries.TaskId` set **NULL** (was cascade-delete). The entry survives with its own description + project.
  - Client deleted -> its `Projects.ClientId` set **NULL** (projects survive, ungrouped). Not cascade.
  - Project deleted -> its `TimeEntries.ProjectId` set **NULL** (entry survives, ungrouped). Project->task cascade is unchanged (deleting a project still deletes its tasks).
- **Nullable columns, no `HasDefaultValue`:** `TimeEntry.TaskId` (int -> int?), `TimeEntry.ProjectId`, `TimeEntry.Description`, `Project.ClientId` all migrate existing rows to null cleanly - the Priority-default footgun (guidelines v2.10.5) does not apply to nullable columns.
- **`DateTime.Now` (not `UtcNow`)** throughout, matching the existing time-tracking code and the #18 deviation - one clock inside the feature.
- **Custom project ordering (added during /ui-spec):** projects gain a manual `Position` and are drag-reorderable in the sidebar (All Tasks + Inbox stay pinned). Small scope addition beyond the original plan, mirrors the existing `Subtask.Position` + reorder machinery. **Task reordering is deferred to the backlog.**

<!-- GUIDELINES CHECK:
  - New product concept (Client level; task-optional time entries) -> product-design.md + architecture.md need syncing at /document time.
  - No new backend pattern: Client controller mirrors ProjectsController; JsonElement present-key PATCH reused for entry edits.
  - Cascade-rule change (cascade -> SetNull) is new for this codebase; captured as a decision above.
  - No new frontend runtime dependency. -->

## UI Decisions

> Design tokens, fonts, and the global UX-rule checklist are inherited from [UI-SPEC.md](../../UI-SPEC.md). Only feature-specific decisions are recorded here.

### Sidebar - Client grouping + project ordering
- **Grouping:** a flat project list **clustered by Client** (client is a light section label/divider + color swatch, ordered), not collapsible nested trees. Client-less projects fall under an "Ungrouped" cluster. "All Tasks" and "Inbox" stay pinned at the top, outside any client.
- **Manual order:** projects are **drag-reorderable** (persisted `Project.Position`), reusing the `@dnd-kit` pattern from `SubtaskSection`. **Inbox and All Tasks are pinned, never draggable.** (Task reordering deferred to backlog.)
- **Client color:** small swatch on the client label, set via the existing `ColorPickerButton` popover (same as projects).

### Entry composer (tracking bar) - mobile-first
- **Mobile:** tapping the bottom bar **expands into a bottom sheet** (reuse the `TaskSheet` bottom-sheet pattern) holding the description field, merged suggestions list, and project picker. Desktop keeps the compact inline bar + a floating popover.
- **No phantom task:** the composer starts a task-free entry; the old quick-create-Inbox-task behavior is removed.
- **Running state:** description + project editable inline; Stop is an always-reachable >= 44px control.

### Suggestions (autocomplete)
- **One merged, ranked list:** best text matches first regardless of type. Each row carries a **type icon** (Lucide `Clock` = past entry, `ListChecks` = open task) plus a muted project/client chip - color paired with the name.
- Picking a **past entry** pre-fills its last project/client; picking a **task** links the entry and defaults its project.
- Debounced fetch with a subtle inline loading state; no-match shows a quiet "start a new entry" hint.

### Timeline (/time) - entry add/edit
- **Bottom sheet on mobile, popover on desktop** for the add (empty-slot) and edit (click-a-block) form, now carrying description + project picker + optional task link. Blocks colored by the **entry's own project** (Inbox/ungrouped uses the existing localStorage color).

### Client entity visuals
- Client CRUD mirrors the project-management affordances; delete warns that its projects become **Ungrouped** (not deleted).

### Journal "Today so far" - actuals breakdown
- A **compact breakdown** beside the existing single total: rows of `Client / Project -> duration` with a thin proportion bar in the project color, top few + an "other" roll-up. Uses the journal's `--color-j-*` tokens. **Plan section stays task/habit intent-only** (unchanged).

### UX Rules in scope for this feature
- [ ] `touch-targets` (CRITICAL) - bottom-sheet controls, drag handles, project picker, start/stop all >= 44px.
- [ ] `focus-states` (CRITICAL) - suggestion rows, sheet fields, drag handles, color swatches show the accent focus ring.
- [ ] `aria-labels` (CRITICAL) - icon-only controls (start/stop, color swatch, drag handle, sheet close) labeled.
- [ ] `color-contrast` (CRITICAL) - project/client chips and timeline block text pass 4.5:1.
- [ ] `color-not-only-indicator` (HIGH) - project/client identity always pairs color with the name/label, never color alone.
- [ ] `form-labels` (HIGH) - description and project picker have visible labels (not placeholder-only).
- [ ] `error-placement` (HIGH) - start/save errors show inline in the sheet/bar, near the control.
- [ ] `loading-states` (HIGH) - suggestion fetch and reorder show feedback.
- [ ] `no-horizontal-scroll` (HIGH) - timeline, sheets, and breakdown hold at 320px.
- [ ] `disable-during-async` (MEDIUM) - start/stop/save/reorder disabled while in flight.
- [ ] `animation-duration` (MEDIUM) - sheet/popover transitions 150-300ms; respect `prefers-reduced-motion` for drag + sheet.
- [ ] `consistent-icon-sizing` (MEDIUM) - 16px inline (suggestion type icons, chips), 20px buttons.
- [ ] `no-emoji-icons` (MEDIUM) - Lucide icons for UI chrome (emoji *inside* a user's description text is content, allowed).

## Tasks

- [x] 🟩 **Step 1: Backend data model + migration** `[sequential]` -> depends on: none
  - [x] 🟩 Add `Models/Client.cs` (`Id`, `Name`, `Color?` hex, `CreatedAt`) - mirror the Project shape.
  - [x] 🟩 `Project`: add nullable `ClientId` FK + `Client?` nav; add `Position` (int, manual order, assigned max+1 on create - mirror `Subtask.Position`).
  - [x] 🟩 `TimeEntry`: `TaskId` int -> `int?`; add `Description` (string?, <= 500), add nullable `ProjectId` FK + `Project?` nav.
  - [x] 🟩 `TasklogDbContext`: add `DbSet<Client>`; configure `Project -> Client` (SetNull on client delete), `TimeEntry -> Task` (SetNull on task delete), `TimeEntry -> Project` (SetNull on project delete).
  - [x] 🟩 Migration `20260829081457_AddClientsAndDecoupleTimeEntries` generated + applied. Verified: nullable columns, existing rows -> null, FKs read `SetNull` (TaskId FK changed from Cascade). `Projects.Position` defaults 0 for existing rows (secondary sort by name breaks ties).

- [x] 🟩 **Step 2: Backend API** `[sequential]` -> depends on: Step 1
  - [x] 🟩 `ClientsController` (mirror ProjectsController): GET/POST/PATCH/DELETE; delete un-groups projects (ClientId -> null), does not delete them.
  - [x] 🟩 `ProjectsController`: create accepts `clientId` + assigns `Position` max+1; `Update` moved to present-key `JsonElement` (name/color/clientId, null clears); GetAll ordered by Position, ThenBy Name, includes Client.
  - [x] 🟩 `POST /api/projects/reorder` - rewrite `Position` from `{ orderedIds }` (must be a permutation), mirroring subtasks reorder.
  - [x] 🟩 `TimeEntriesController.Start`: `taskId`/`description`/`projectId` all optional; project defaults from the task when omitted; validates supplied task/project (404).
  - [x] 🟩 `TimeEntriesController.AddManual`: same optionality (`ManualRequest` reordered so required timestamps lead).
  - [x] 🟩 `TimeEntriesController.Update`: present-key PATCH extended to `description`, `projectId` (null clears), `taskId` (null unlinks).
  - [x] 🟩 `TimeEntryResponse` + projection: effective project = entry's own else linked task's (legacy fallback); added `Description`, `ClientId`/`ClientName`/`ClientColor`; `TaskId` now nullable.
  - [x] 🟩 `GET /api/time-entries/suggestions?text=&limit=` - distinct recent descriptions (case-insensitive, most-recent wins) with their last `projectId`; bounded to last 500 entries.
  - [x] 🟩 Tests: +12 across `TimeEntriesControllerTests` (task-free start, project defaulting, present-key edits, suggestions) and `ProjectsControllerTests` (position, reorder, clientId) + new `ClientsControllerTests`. **351 pass.** (Delete->SetNull is DB-enforced, verified in the migration; the InMemory test provider can't model relational SetNull, so it's covered at the migration level not unit level.)

- [x] 🟩 **Step 3: MCP tools** `[parallel]` -> delivers: Claude can manage clients + task-free entries; depends on: Step 2 contract
  - [x] 🟩 New client family `mcp/src/tools/clients.ts` (list/create/rename/delete client), registered in `registry.ts` (40 tools now).
  - [x] 🟩 `projects.ts`: create/rename accept optional `clientId` (rename present-key, null un-groups); `api-client` types carry `client`/`clientId`/`position`; added `reorderProjects`.
  - [x] 🟩 `time.ts`: `start_timer`/`log_time` take optional `taskId` + `description` + `projectId` (task-free entries); `edit_time_entry` edits description/project/task (null clears); summaries use an `entryLabel` helper; `get_time_summary` groups by client/project (fetches project names); added `getEntrySuggestions` to api-client.
  - [x] 🟩 Tool descriptions updated so the LLM knows a timer no longer requires a task. MCP `tsc` clean, **106 tests pass** (after a local `better-sqlite3` native rebuild - env only, unrelated to code).

- [x] 🟩 **Step 4: Frontend data layer + Client CRUD + sidebar grouping** `[UI]` `[parallel]` -> delivers: shared client state + grouped nav; depends on: Step 2 contract
  - [x] 🟩 `lib/api.ts`: `Client` type + `Project.clientId/client/position`; decoupled `TimeEntry` (nullable `taskId`, `description`, `clientId/clientName/clientColor`) + `EntrySuggestion`; client CRUD (`getClients`/`createClient`/`renameClient`/`deleteClient`); `updateProject` (present-key) + `reorderProjects`; `startTimer` (union: id or body), `addTimeEntry`(body), `updateTimeEntry` (+description/project/task), `getEntrySuggestions`. (`renameProject` kept as a wrapper so existing callers compile.)
  - [x] 🟩 Client CRUD UI: collapsible "Clients" manager in the sidebar (create/rename/recolor via `ColorPickerButton`/delete); delete dialog states projects become Ungrouped, not deleted.
  - [x] 🟩 `ProjectSidebar` / `ProjectLayout`: per the user's answer, a **flat** project list (Position order) with a **per-row client chip** (name + swatch) rather than nested groups; "All Tasks"/"Inbox" pinned on top; project edit modal gains a Client dropdown (assign / Ungrouped). `ProjectLayout` loads + polls clients, holds client CRUD + reorder handlers.
  - [x] 🟩 Drag-reorder projects via `@dnd-kit` (drag handle so a tap still selects); Inbox/All Tasks not draggable; optimistic with revert-on-failure. Sidebar files typecheck clean.

- [x] 🟩 **Step 5: Tracking surface redesign (mobile-first)** `[UI]` `[sequential]` -> depends on: Step 4
  - [x] 🟩 `TimeTrackingContext`: `quickStart(description, projectId?)` starts a **task-free** entry (no phantom task); added `startEntry(input)` (any of task/description/project) + `updateActive` (edit the running entry in place); `start(taskId)` kept as a wrapper.
  - [x] 🟩 `TrackingBar` fully rewritten: idle launcher -> composer (bottom sheet on mobile, floating card on desktop) with description input + merged autocomplete (past entries via `getEntrySuggestions` + open tasks via `searchOpenTasks`) + project picker; running state shows the entry label + project dot + live clock, tap-to-edit via `updateActive`. No more Inbox-task creation.
  - [x] 🟩 `TimelineView`: blocks + tooltip use `entryLabel` (task-free entries show their description); edit/add form gains a description field, optional task ("No task"), and a project picker (defaulted from a picked task); save/add use the decoupled `addTimeEntry`/`updateTimeEntry` bodies. Breakdown renamed to "By activity".
  - [x] 🟩 `lib/time.ts`: `perTaskTotals` -> `perActivityTotals` (groups task-free entries by description) + new `perProjectTotals` (client/project `GroupTotal`) + `entryLabel` helper. Frontend typechecks clean; `jest` 185 pass (3 failures are a pre-existing `TaskCard` drift, unrelated - confirmed by stashing my test edit).

- [x] 🟩 **Step 6: Journal / actuals breakdown** `[UI]` `[sequential]` -> depends on: Step 5
  - [x] 🟩 `JournalClient`: keeps the day's `timeEntries` and derives `perProjectTotals` via a memo (recomputes as entries/projects load).
  - [x] 🟩 `TodaySoFarWidget` gains a compact Client/Project breakdown (top 5 + "other" roll-up, thin proportion bars in the project color, journal `--color-j-*` tokens) beside the existing total. Plan section unchanged (intent-only). Production `next build` compiles.

## Outcomes

Built as planned across all 6 steps; backend + MCP fully tested (351 .NET, 106 MCP), frontend typechecks clean and `next build` compiles (185 jest pass; 3 pre-existing `TaskCard` failures are unrelated branch drift).

Deltas vs. the plan worth recording:

- **Sidebar model simplified to the user's answer.** The plan floated nested client groups; the user chose a **flat list with a per-row client chip** ordered by drag Position (not re-grouped on render). Implemented that way. A drag handle starts a drag so a plain tap still selects the project. Cross-client moves happen via the edit modal's Client dropdown, not by dragging across a boundary.
- **Client CRUD lives in a collapsible "Clients" manager** in the sidebar (create/rename/recolor/delete) rather than a separate page - keeps it beside the projects it groups.
- **Entry-carries-its-own-project** proved its worth: `TimelineView` and the tracking bar set the entry's `projectId` directly, and the projection falls back to the task's project for legacy entries. When a task is picked in the timeline form, its project defaults in (still overridable).
- **`start`/`quickStart` signatures changed** (quickStart is now `(description, projectId?)` and starts a task-free entry). `startEntry` is the general primitive; `updateActive` lets the bar edit the running entry without stopping it.
- **Delete->SetNull is DB-enforced only.** The EF InMemory test provider can't model relational SET NULL, so that guarantee is verified at the migration level, not in unit tests. If it ever needs unit coverage, switch that suite to a real SQLite in-memory connection.
- **`get_time_summary` (MCP) regrouped by client/project** (was per-task); it fetches project names since the entry only carries `projectId` + `clientName`.
- **Not yet verified in a running app.** Everything is typechecked/built/tested; the mobile-first surfaces (tracking bottom sheet, timeline form, sidebar drag) still want a live pass on a phone-width viewport. The timeline entry editor stays an anchored popover (full-width on mobile) rather than a dedicated bottom sheet - a reasonable follow-up polish if it feels cramped in use.
- **Pre-existing `TaskCard` test drift** (3 failing) surfaced during this work; unrelated to #86, worth a separate fix.
