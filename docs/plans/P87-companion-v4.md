# v4.0 Journaling Companion (basic, task-only) - Implementation Plan

**Overall Progress:** `0%`

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

<!-- GUIDELINES CHECK:
     New patterns introduced (to graduate into engineering-guidelines.md via /document at ship):
       - First inbound LLM integration (Agent SDK) + provider-seam interface.
       - First first-party Next.js API route as a service (doppel was a package).
       - Capture inbox / staging-then-typed-home pattern.
       - A .NET endpoint that materializes a typed row (Task) from a staged proposal.
     Product scope: adds an AI companion capability -> product-design.md needs updating at ship.
     No known deviation from the deviations table is directly resolved here. -->

## Tasks

- [ ] 🟥 **Step 1: Backend data model - Capture + CompanionSession** `[parallel]` -> delivers: the two tables + migration
  - [ ] 🟥 `Capture` model: `Id`, `Type` (e.g. "task"), `Status` (proposed/confirmed/dismissed), `Source` (default "companion"; anticipates mcp/claude.ai/manual/upload), `SessionId` (nullable FK -> CompanionSession), `PayloadJson` (TEXT), `Span` (nullable), `Confidence` (nullable), `ConfirmedType`/`ConfirmedId` (nullable, set on confirm), `CreatedAt`, `UpdatedAt`
  - [ ] 🟥 `CompanionSession` model: `Id`, `StartedAt`, `UpdatedAt`, `MessagesJson` (TEXT, JSON array of `{role, content, at}`)
  - [ ] 🟥 Register both `DbSet`s in `TasklogDbContext`; `Capture.SessionId` -> `SetNull` on session delete (history preserved, existing v3.2 precedent)
  - [ ] 🟥 Generate + verify the EF migration (nullable columns, FK behavior)

- [ ] 🟥 **Step 2: Backend API - captures + sessions** `[sequential]` -> depends on: Step 1
  - [ ] 🟥 `CompanionSessionsController`: `POST /api/companion/sessions` (create), `PUT /api/companion/sessions/{id}` (save/append transcript)
  - [ ] 🟥 `CapturesController`: `POST /api/captures` (create a `proposed` capture), `GET /api/captures?sessionId=&status=` (list), `PATCH /api/captures/{id}` (edit payload before confirm)
  - [ ] 🟥 `POST /api/captures/{id}/confirm`: materialize the typed home (for `task`: create a `Tasks` row from payload), set `Status=confirmed` + `ConfirmedType`/`ConfirmedId`; idempotent (a re-confirm returns the existing task, no duplicate)
  - [ ] 🟥 `POST /api/captures/{id}/dismiss`: set `Status=dismissed`
  - [ ] 🟥 Follow existing controller conventions (records for bodies, present-key PATCH, response codes)

- [ ] 🟥 **Step 3: Companion Node route (Agent SDK)** `[sequential]` -> depends on: Step 2
  - [ ] 🟥 `frontend/src/app/api/companion/chat/route.ts`: an Agent SDK `query()` session (streaming input queue, `canUseTool`), model = subscription default
  - [ ] 🟥 In-process `propose_capture` tool (Zod schema, `type` fixed to `task` for v4.0): on call, `POST /api/captures` (status proposed) and return the created card so the UI can render it
  - [ ] 🟥 Thin provider seam: a small `LlmProvider` wrapper around the Agent SDK so API/local can be added later without touching callers
  - [ ] 🟥 System prompt authored as a **reusable spec artifact** (a file), not inline, so it can double as claude.ai custom instructions later
  - [ ] 🟥 Persist the transcript to `CompanionSession` (create on first message, save per turn)

- [ ] 🟥 **Step 4: Frontend companion UI** `[sequential]` -> depends on: Steps 2, 3
  - [ ] 🟥 `/companion` route + `NavTabs` entry (Tasks / Time / Journal / Companion)
  - [ ] 🟥 Chat surface: message list, composer, streaming assistant turns
  - [ ] 🟥 Inline proposal cards (the trust loop): each proposed `task` shows title + guessed project + the text span; keep / edit / toss -> calls confirm / patch+confirm / dismiss
  - [ ] 🟥 Typed API functions in `src/lib/api.ts` for sessions + captures (single-source contract, existing convention)

- [ ] 🟥 **Step 5: Degradability + end-to-end verification** `[sequential]` -> depends on: Step 4
  - [ ] 🟥 Transcript saves even if the AI call fails; the tab shows a soft error, never loses input
  - [ ] 🟥 Manual E2E: talk -> a task is proposed -> keep -> it appears in the real task list; edit path; toss path; confirm-twice does not duplicate
  - [ ] 🟥 Confirm the v3.x journal tab and existing flows are untouched

- [ ] 🟥 **Step 6: Tests** `[sequential]` -> depends on: Step 2 (can proceed alongside Steps 3-4)
  - [ ] 🟥 `CapturesController` tests: create proposed, confirm creates a task, confirm is idempotent, dismiss, edit-before-confirm
  - [ ] 🟥 `CompanionSessions` transcript save test
  - [ ] 🟥 Run the full backend + MCP suites to confirm no regressions

## Outcomes

<!-- Fill in after execution: decision-relevant deltas only. What changed vs. planned? Key decisions made? Assumptions invalidated? -->
