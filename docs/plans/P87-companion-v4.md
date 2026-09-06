# v4.0 Journaling Companion (basic, task-only) - Implementation Plan

**Overall Progress:** `100%`

## TLDR

Add a conversational AI companion (new tab) that talks with you and proposes actionable
`task` captures. Each proposal is confirmed via an inline trust loop (keep / edit / toss) and,
on keep, becomes a real row in the existing Tasks table. The raw conversation is saved. This
is the deliberately basic first slice of the v4.0 Living Profile line: it proves the core bet
(talk -> structured proposal -> confirm -> real data) end to end, on one provider, additively,
with the v3.x journal left untouched. Full context in
[docs/ideas/living-profile.md](../ideas/living-profile.md) and
[docs/ideas/keystone-flows.md](../ideas/keystone-flows.md).

## Goal State

**Current State:** No inbound LLM anywhere in the backend. AI is outbound only (the MCP
server) plus a disabled visitor-chat widget (`doppel`). Journaling is the v3.x template +
sections + `MoodCheckins` feature. Tasks live in the `Tasks` table via `TasksController`.

**Goal State:** A `/companion` tab where a Claude-Agent-SDK session (on the user's Claude
subscription) converses, proposes `task` captures into a generic Capture inbox, and the user
confirms them into real tasks. The conversation persists. Nothing existing is removed.

## Critical Decisions

- **Decision 1: Conversational companion on the Claude Agent SDK, one provider.**
  - **Options considered:** Anthropic API (BYOK, per-token cost in dev); local LLM (privacy, setup burden); Claude Code via the Agent SDK (runs on the user's subscription, no key, no per-token cost).
  - **Chosen:** Claude Agent SDK / Claude Code - free at dev time on the subscription, streaming + tool-use built in, and its confirm/ask pattern maps onto the trust loop. Wrapped behind a thin provider interface so API/local can be added later.
  - **Trade-offs accepted:** the Agent SDK is Node-only (so this code is not in .NET) and is heavier than a plain completion; acceptable because the companion is multi-turn + tool-driven, which is exactly its shape.

- **Decision 2: The Node / Agent-SDK code lives in a Next.js API route** (`/api/companion/chat`), mirroring the `doppel` `createChatRoute` precedent. Same-origin, no new process, no CORS. Not the MCP server (that is the outbound/public surface), not .NET (Agent SDK is Node-only).

- **Decision 3: A generic Capture inbox, built now even for one type.** It is the spine of the whole Living Profile (hybrid ingest -> typed homes). `task` is the only registered type in v4.0; the table shape lets v4.1+ types slot in without a migration.

- **Decision 4: Raw conversation stored in a new `CompanionSession` table** (`MessagesJson` as JSON-as-TEXT, the v3.0 journal precedent), not reused from `JournalEntry` (which is template/section shaped). The conversation is the source; a journal note is a later derived output.

- **Decision 5: `propose_capture` writes a `proposed` Capture via the .NET API immediately**, then confirm flips it and creates the Task. This shared-inbox shape is what lets MCP / claude.ai propose into the same place later (parity), and keeps the raw conversation degradable-independent of extraction.

- **Decision 6: Additive and degradable.** The v3.x journal tab is untouched. The transcript saves regardless of AI state; if the companion is unreachable the tab degrades but loses no data.

- **Decision 7: Semantic grounding ships in v4.0 (local embeddings, no vector extension).**
  - **Options considered:** (a) a keyword `find` tool - fails on paraphrase ("the tax thing" never substring-matches "File ITR"), grounding theater; (b) inject all open tasks into context - works at ~100 tasks but dilutes attention and is exactly the pattern that dies at CRM/vault scale; (c) local embeddings shortlist + the model judges the candidates.
  - **Chosen:** (c). Ollama `nomic-embed-text` on the dev PC (installed, verified); a generic `Embeddings` table (`EntityType`, `EntityId`, `Model`, `Vector` BLOB, `UpdatedAt`; unique on EntityType+EntityId+Model) so tasks now and people/notes/vault later share one store; **brute-force cosine in C#** over BLOB vectors (sub-ms at thousands of items) - no `sqlite-vec` native extension until counts demand it; embed-on-write is best-effort; `POST /api/search/tasks` does embed -> top-k with a LIKE fallback when Ollama is unreachable. Division of labor: embeddings shortlist, the LLM judges; type decisions stay LLM + registry enum.
  - **Trade-offs accepted:** Ollama is a soft dependency of the PC instance (absent on OCI/phone -> vectors stay null, search degrades to keyword, nothing breaks - the companion doesn't run there in v4.0 anyway); an embedding-model swap means a cheap local re-embed at this scale.

- **Decision 8: Deployment stance - PC/LAN-first; no public deploy until gated.** Subscription auth (`~/.claude`) exists only on this PC, and `tasklog.manudubey.in` is publicly reachable while the app has NO authentication - a public companion route would expose both the LLM and intimate transcripts. v4.0 runs on the PC instance (LAN; phone browser included). Deploying the companion to OCI is a deliberate later step requiring a gate (shared secret at minimum) + `claude setup-token` on the VM.

- **Decision 9: Per-turn `query()` with `resume: sessionId`, not a long-lived in-memory session.** Patternarium's live-queue pattern assumes one long-lived host process; Next.js route handlers are request-scoped (HMR in dev, multiple workers in prod). Resume-per-turn is the robust shape here.

<!-- GUIDELINES CHECK:
     New patterns introduced (to graduate into engineering-guidelines.md via /document at ship):
       - First inbound LLM integration (Agent SDK) + provider-seam interface.
       - First first-party Next.js API route as a service (doppel was a package).
       - Capture inbox / staging-then-typed-home pattern.
       - A .NET endpoint that materializes a typed row (Task) from a staged proposal.
       - First true DI service (EmbeddingService - needs HttpClient + DbContext, unlike the
         pure static helpers under Services/).
       - Embeddings as BLOB + brute-force cosine (deliberately NO sqlite-vec native extension).
     Product scope: adds an AI companion capability -> product-design.md needs updating at ship.
     No known deviation from the deviations table is directly resolved here. -->

## UI Decisions

> Design tokens and global rules inherited from [UI-SPEC.md](../../UI-SPEC.md).
> Only feature-specific decisions are recorded here. (Decided with user, 2026-09-05.)

### Companion surface (/companion)
- **Layout:** full-height chat - scrollable message stream + sticky bottom composer
  (keyboard-safe-area padding on mobile). Desktop: a centered column (~65ch) - a
  conversation, deliberately NOT a full-width dashboard. `NavTabs` gains a Companion entry.
- **Identity (Rosebud-like + a name):** page-scoped `--color-c-*` tokens (the journal's
  `--color-j-*` precedent): warm, soft, calm - rose/cream surface tints, `rounded-2xl`
  bubbles, gentle 150-200ms motion, minimal borders. Fonts stay Space Grotesk / DM Sans (no
  new fonts). Tints must still pass 4.5:1 contrast. The companion has a **display name**:
  working name **"Sage"** - it lives in ONE place (the persona spec file from Step 3), so
  renaming is a one-line change; surface it in the greeting, header, and typing indicator
  ("Sage is thinking..."). Avatar is a simple soft SVG glyph, not an emoji.
- **Opening:** on a fresh daily session, a static greeting from the persona spec + 2-3
  starter chips ("Plan my day", "Brain dump"). NO LLM call fires on page load - a turn only
  burns when the user sends.
- **Sessions: one per day**, auto-created on first visit of the day; the header shows the
  date. Maps 1:1 to the SDK `resume` id and, later, to the v4.1 daily note.
- **History calendar (added mid-execute at user request, 2026-09-06):** a month calendar
  with a dot on each day that has a conversation - the journal CalendarWidget pattern in the
  companion's own c- identity (deliberate copy, journal untouched). Desktop: right rail
  beside the chat. Mobile: a header calendar button toggles it. Selecting a past day loads
  that conversation **read-only** (no composer; a "back to today" bar instead), but its
  proposal cards STAY actionable - the talk is day-bound, the inbox is not. Backed by
  `GET /api/companion/sessions?date=` + `GET /api/companion/sessions/dates?from=&to=`
  (mirrors the journal's entries/dates).

### Proposal cards (the trust loop)
- **Inline in the stream**, rendered under the assistant message that proposed them. A card
  shows: task title, guessed-project chip (with project color dot), and the source quote
  (small, muted, truncated).
- **Actions:** Keep / Edit / Toss - each a >= 44px target. Buttons disable during the
  confirm/dismiss request.
- **Resolved cards stay in place**, dimmed, labeled with icon + text + color: "Added" (check,
  success) or "Dismissed" (x, muted) - never color alone.
- **Quick-edit on the card:** Edit turns the title into an input and the project chip into a
  dropdown, in place; Save / Cancel. Deadline/priority tuning is NOT on the card - that
  happens later on the real task (keeps the card light; the full TaskSheet stays where it
  already lives).
- **Errors:** inline under the failing card ("Couldn't add - retry"), not a page-top banner.

### Degraded states
- AI unreachable mid-conversation: the user's message stays in the stream (transcript is
  saved first), with a soft inline notice - "Sage is unreachable right now. Your words are
  saved." - and a retry affordance. Never a blank screen, never lost input.
- Streaming: progressive text render; while waiting, a subtle 3-dot pulse as the typing
  indicator (respect `prefers-reduced-motion`).

### UX Rules in scope for this feature
- [ ] `color-contrast` (CRITICAL) - the warm `--color-c-*` tints must pass 4.5:1 for text
- [ ] `focus-states` (CRITICAL) - composer, chips, card actions all show the accent focus ring
- [ ] `touch-targets` (CRITICAL) - Keep/Edit/Toss, starter chips, send button >= 44px
- [ ] `aria-labels` (CRITICAL) - icon-only send + card action buttons carry labels
- [ ] `font-size-minimum` (HIGH) - 16px body in bubbles and composer
- [ ] `line-height` (HIGH) - 1.6 for message text
- [ ] `no-horizontal-scroll` (HIGH) - stream + cards fit at 320px
- [ ] `loading-states` (HIGH) - typing indicator; card buttons show busy state
- [ ] `error-placement` (HIGH) - card errors inline under the card
- [ ] `color-not-only-indicator` (HIGH) - Added/Dismissed = icon + text + color
- [ ] `disable-during-async` (MEDIUM) - send + card actions disabled in flight
- [ ] `animation-duration` (MEDIUM) - 150-200ms; respect `prefers-reduced-motion`
- [ ] `no-emoji-icons` (MEDIUM) - SVG glyph avatar and icons only
- [ ] `consistent-icon-sizing` (MEDIUM) - 16px inline / 20px buttons

## Tasks

- [ ] 🟨 **Step 1: Backend data model - Capture + CompanionSession** `[parallel]` -> delivers: the two tables + migration
  - [ ] 🟩 `Capture` model: `Id`, `Type` (e.g. "task"), `Status` (proposed/confirmed/dismissed), `Source` (default "companion"; anticipates mcp/claude.ai/manual/upload), `SessionId` (nullable FK -> CompanionSession), `PayloadJson` (TEXT), `Span` (nullable), `Confidence` (nullable), `ConfirmedType`/`ConfirmedId` (nullable, set on confirm), `CreatedAt`, `UpdatedAt`
  - [ ] 🟩 `CompanionSession` model: `Id`, `StartedAt`, `UpdatedAt`, `MessagesJson` (TEXT, JSON array of `{role, content, at}`)
  - [ ] 🟩 `Embedding` model: `Id`, `EntityType` (e.g. "task"), `EntityId`, `Model` (e.g. "nomic-embed-text"), `Vector` (BLOB, float32 array), `UpdatedAt`; unique index on (EntityType, EntityId, Model)
  - [ ] 🟩 Register all three `DbSet`s in `TasklogDbContext`; `Capture.SessionId` -> `SetNull` on session delete (history preserved, existing v3.2 precedent)
  - [ ] 🟩 Generate + verify the EF migration (nullable columns, FK behavior, unique index)

- [ ] 🟩 **Step 2: Backend API - captures + sessions** `[sequential]` -> depends on: Step 1
  - [ ] 🟩 `CompanionSessionsController`: `POST /api/companion/sessions` (create), `PUT /api/companion/sessions/{id}` (save/append transcript)
  - [ ] 🟩 `CapturesController`: `POST /api/captures` (create a `proposed` capture), `GET /api/captures?sessionId=&status=` (list), `PATCH /api/captures/{id}` (edit payload before confirm)
  - [ ] 🟩 `POST /api/captures/{id}/confirm`: materialize the typed home (for `task`: create a `Tasks` row from payload), set `Status=confirmed` + `ConfirmedType`/`ConfirmedId`; idempotent (a re-confirm returns the existing task, no duplicate)
  - [ ] 🟩 `POST /api/captures/{id}/dismiss`: set `Status=dismissed`
  - [ ] 🟩 Follow existing controller conventions (records for bodies, present-key PATCH, response codes)

- [ ] 🟩 **Step 2b: Semantic search (embeddings)** `[sequential]` -> depends on: Step 1
  - [ ] 🟩 Setup: `ollama pull nomic-embed-text` (Ollama already installed); `Ollama:Url` config in appsettings (default `http://localhost:11434`)
  - [ ] 🟩 `EmbeddingService` (injected service - first true DI service, per the guidelines' "when it needs dependencies" rule): call Ollama's embed endpoint, upsert into `Embeddings`; best-effort (failures swallowed, never blocks a write)
  - [ ] 🟩 Embed-on-write: task create / title-update upserts the task's vector; bounded startup backfill for open tasks missing vectors (silently skipped when Ollama absent)
  - [ ] 🟩 `POST /api/search/tasks` `{ query, limit? }`: embed the query, brute-force cosine over open-task vectors in C#, return top-k with scores; **fallback to LIKE substring** when Ollama is unreachable or vectors are missing (degradable)

- [ ] 🟩 **Step 3: Companion Node route (Agent SDK)** `[sequential]` -> depends on: Steps 2, 2b
  - [ ] 🟩 `frontend/src/app/api/companion/chat/route.ts`: per-turn Agent SDK `query()` with `resume: sessionId` (Decision 9), streaming response, `canUseTool` auto-allowing our own tools, model = subscription default
  - [ ] 🟩 In-process `propose_capture` tool (Zod schema, `type` fixed to `task` for v4.0): on call, `POST /api/captures` (status proposed) and return the created card so the UI can render it
  - [ ] 🟩 In-process `find_relevant_tasks` tool wrapping `POST /api/search/tasks`: the companion checks what already exists before proposing (grounding; enables "that's already on your list" instead of a duplicate card)
  - [ ] 🟩 Propose dedupe: skip re-proposing when a same-type capture with the same normalized title already exists for the session (proposed or dismissed)
  - [ ] 🟩 Inject the projects + clients list into the session context (small, bounded) so project guesses on task cards are real
  - [ ] 🟩 Thin provider seam shaped around **messages + tools** (not `complete(text)`), so a Messages-API tool loop or a local model can implement it later without touching callers
  - [ ] 🟩 System prompt authored as a **reusable spec artifact** (a file), not inline, so it can double as claude.ai custom instructions later
  - [ ] 🟩 Persist the transcript to `CompanionSession` (create on first message, save per turn)

- [ ] 🟩 **Step 4: Frontend companion UI** `[UI]` `[sequential]` -> depends on: Steps 2, 3
  - [ ] 🟩 `/companion` route + `NavTabs` entry (Tasks / Time / Journal / Companion) + the `--color-c-*` calm identity tokens (light + dark blocks in globals.css, journal precedent)
  - [ ] 🟩 Chat surface: message stream, sticky composer, streaming assistant turns, "Sage" greeting + starter chips (no LLM call on load), daily-session header
  - [ ] 🟩 Inline proposal cards (the trust loop): title + guessed-project chip + source quote; keep / quick-edit-in-place / toss -> calls confirm / patch+confirm / dismiss; resolved cards stay dimmed with Added/Dismissed state
  - [ ] 🟩 Typed API functions in `src/lib/api.ts` for sessions + captures (single-source contract, existing convention)

- [ ] 🟩 **Step 5: Degradability + end-to-end verification** `[sequential]` -> depends on: Step 4
  - [ ] 🟩 Transcript saves even if the AI call fails; the tab shows a soft error, never loses input
  - [ ] 🟩 Manual E2E: talk -> a task is proposed -> keep -> it appears in the real task list; edit path; toss path; confirm-twice does not duplicate
  - [ ] 🟩 Grounding E2E: with "File ITR" already open, say "I still haven't done the tax thing" -> the companion references the existing task instead of proposing a duplicate
  - [ ] 🟩 Degradation check: stop Ollama -> search falls back to keyword, companion still works end to end
  - [ ] 🟩 Confirm the v3.x journal tab and existing flows are untouched; companion route reachable on LAN only (Decision 8)

- [ ] 🟩 **Step 6: Tests** `[sequential]` -> depends on: Steps 2, 2b (can proceed alongside Steps 3-4)
  - [ ] 🟩 `CapturesController` tests: create proposed, confirm creates a task, confirm is idempotent, dismiss, edit-before-confirm
  - [ ] 🟩 `CompanionSessions` transcript save test
  - [ ] 🟩 Search tests: cosine ranking (pure math, no Ollama needed), LIKE fallback path when no vectors exist
  - [ ] 🟩 Run the full backend + MCP suites to confirm no regressions

## Outcomes

Built 2026-09-05, all steps complete. Deltas vs. the plan:

- **Schema additions beyond the planned columns:** `CompanionSession.SessionDate` with a
  UNIQUE index (one-session-per-day enforced at the DB, the JournalEntry precedent) and
  `CompanionSession.SdkSessionId` (the Agent SDK resume cursor Decision 9 implies but the
  plan's column list omitted).
- **The route resolves "today" itself.** The client sends only `{ message }`; the route
  get-or-creates today's session, appends + saves the user's words BEFORE the AI runs, and
  saves the assistant turn + sdk cursor after. Server-owned transcript = the degradability
  contract holds even if the browser dies mid-turn.
- **Resume self-heal (unplanned, found by testing):** a stale/invalid stored SDK session id
  made every turn fail. `ClaudeCodeProvider` now retries the turn fresh when resume errors,
  and the new id overwrites the stale one on done. Without this, one cleaned SDK cache would
  brick the day's session.
- **EmbeddingService as an optional ctor param** on Tasks/Captures controllers (default
  null): DI supplies it in the app, the 112 existing direct controller constructions in
  tests compile unchanged, and tests correctly run without embedding.
- **Verified live end to end** on the subscription: "the tax thing" -> semantic search
  ranked "File the income tax return" 0.649 (keyword mode: zero hits - the exact argument
  for embeddings); Sage referenced the existing task instead of duplicating (grounding E2E);
  an implied task ("gift for mom before sunday") became a card with span, 0.95 confidence,
  and the correct 2026-09-06 deadline; keep/edit/toss lifecycle + idempotent confirm all
  green; turn 2 recalled turn 1 (resume works); Ollama-down degrades to keyword + task
  writes survive; the v3.x journal untouched.
- **Tests:** backend 379/379 (24 new: captures trust loop, sessions, cosine math + keyword
  fallback), MCP 106/106, frontend tsc + production build clean. (MCP node_modules were
  stale from the phone-deploy work - `tsx` missing, better-sqlite3 native clobbered by the
  arm64 Docker build; fixed with npm install + rebuild, unrelated to this feature.)
- **Deployment stance holds:** the companion ran only on the PC instance. The route must NOT
  ship to OCI until gated (Decision 8) - flag this at /ship time.

**Post-review round (2026-09-06, from the first real conversations):**

- **Sage was time-blind** - the user hit it live ("wdym tonight tomorrow?"... "its 7 33 am").
  Fixed: local date + time + weekday injected into the system prompt every turn (`nowContext`).
- **Timestamps were stored UTC** (`toISOString`) against the codebase's local-no-suffix
  convention - a 7:33am chat was recorded as 01:56Z. Fixed: `localIso()` in route + client;
  timeline now sorts by parsed time so legacy Z-strings and local strings coexist.
- **History calendar shipped** (see UI Decisions): sessions?date= + sessions/dates endpoints
  (+3 tests, backend 382/382), CompanionCalendar (c- identity copy of the journal widget),
  desktop rail + mobile toggle, read-only past days with actionable cards.
- **canUseTool shadow warning silenced** - removed `allowedTools` (bare entries auto-approve
  before the callback); gating now runs entirely through `canUseTool` + `disallowedTools`.
- Session 1's test debris (curl smoke-test messages) deliberately KEPT as history-view test
  data, per user.
- Dev-LAN note: the PC's DHCP IP drifted .41 -> .47; `allowedDevOrigins` now lists both.
