# The Living Profile (Tasklog v4.0 north star)

**One line:** an app that captures you and keeps you. You flow, it structures. The map,
the CRM, the goals, the feelings are all lenses on one profile that grows with you, owned
by you, on your own machine.

**What this doc is:** an idea doc, written to stand alone. A fresh agent should be able to
read only this file and understand the vision, the data model, the decisions already made,
and the order to build in. It is not a plan. Each concrete feature still gets its own
`/explore` + `/create-plan`. This is the star they steer by.

**Status:** idea, nothing built yet. Current shipped line is v3.2.0 (flexible time tracking:
clients as life areas, task-free time entries). This is the next major version (v4.0).

---

## Context: what Tasklog is today

Self-hosted personal task manager. Three processes: .NET 10 Web API (EF Core 9 / SQLite),
Next.js frontend, and a Node/TypeScript MCP server that exposes the API to Claude as a
custom connector (OAuth 2.1 + Cloudflare Tunnel).

Already exists and is the spine to build on:

- **Clients** = life areas (the grouping level above projects).
- **Projects**, **Tasks** (+ subtasks, comments, labels), **TimeEntries** (task-linked or
  task-free), **Habits** (with check-ins and streaks).
- A **journaling** feature (the v3.x line).
- ~45 tools exposed over **MCP** to Claude, plus an in-app chat route.

(Verify exact current state in `docs/architecture.md` before building; this list is a
pointer, not a contract.)

---

## The itch (re-grounded)

This is not greenfield. **The user already built this system by hand** and it works:
`/home/manu/Personal/Vault/Second Brain/` is an Obsidian PARA vault (~1300 notes) driven by
Claude + Google Drive. See its `JournalingSystem.md`. The loop:

- Claude is the conversational interface across the day (morning / mid-day / evening).
- "The chat is the medium, the note is the artifact." You talk, it writes the note.
- At session close the note is produced, **shown, confirmed, then saved** (a trust loop).
- Stable facts (projects, people, patterns) live in memory; episodic detail lives in daily
  notes. Its own stated vision: "a second brain that actually knows you... not on anyone
  else's server, yours."

So the concept is already proven in the user's real life. The itch is the **limits of the
substrate**, not the idea:

- It is hand-maintained markdown. Schemas (`FileClasses`), templates, and Dataview queries
  are all upkeep the user carries. That is the same maintenance tax that kills Monica-style
  CRMs, just self-inflicted.
- Markdown + frontmatter has **no real query engine and no relational integrity**. Reporting,
  rollups, and cross-links are DIY.
- It is glue, not an app. A vault plus a chat plus Drive, wired by hand. No dashboard, no
  structured live views, nothing that *is* the profile.

The goal of v4.0: **fold that proven capture-and-structure loop into Tasklog as a
first-class app** where the captured data is typed and queryable, the home screen is your
profile/dashboard, and new facets of life can be added forever without a rebuild.

Reference points the user named: Rosebud AI (free-flow journaling that extracts structure),
Monica CRM (fails because structure is manual), Notion personal dashboards (presentation
inspiration), their company HRMS **DarwinBox** (the "SonataOne" instance; an editable profile
section with rich identity fields and document safekeeping), and the old idea of a life
"scrapbook" you paste everything into.

---

## The spine (the one idea)

> **Capture is free-form. Structure is extracted. Everything else is a lens.**

- **Capture** is low-friction flow: you write or talk. No forms, no schema to obey up front.
  Forcing structure first is the pain that killed the "clean journaling" design.
- **Extraction** is where the LLM earns its place. Rosebud leans on keyword tracking; we go
  further and **infer**, so an implied task or a mood with no matching keyword is still
  caught. Keywords can stay as a cheap first pass or an offline fallback, but the default is
  LLM inference. It reads the flow and proposes structured items (a task, a person, a mood,
  movement on a goal).
- **Lenses** are views over the accumulated structure: the life map, the CRM, the goals
  board, the mood timeline. Easy *if* extraction works, because they are just queries. If
  extraction fails, no lens saves it.

**The load-bearing bet is the extraction pipeline and the data model it writes into.** Build
and prove that first. Not the pretty map.

---

## Decisions locked (do not re-litigate without cause)

- **Privacy / LLM (this is the ethos made real):** the LLM sits behind a **provider seam**
  with three implementations: **Claude Code** via the Claude Agent SDK (dev + single-user,
  runs on the user's own subscription, no API key, no per-token cost), **Anthropic API BYOK**
  (the swap target later, and for anyone without a subscription), and a **local LLM** (the
  full-privacy option). The most intimate data a person has must not be forced through someone
  else's server. See "The AI provider seam" below.
- **Positioning:** the **profile is the centerpiece**. Home becomes a dashboard/profile, not
  the all-tasks list. Tasks become one tab among many. (UI concern, noted, deferred.)
- **Priority:** **data first.** Get the captured data model right before UI/UX. This is the
  user's explicit rule for the whole effort.
- **Capture surface (conversational-first):** the primary surface is a **companion
  conversation**, Rosebud-style, not a passive journal box. It opens with a prompt or a
  question, reflects on your answers, cross-questions, digs deeper, suggests alternatives,
  explores options, and **recalls relevant earlier context** so it feels like something that
  knows you, not a stranger each time. Structured cards (task / mood / mention) are proposed
  *during* the dialogue and confirmed inline (keep / tweak / toss). Free-form "write about my
  day" is supported as one input within the conversation, not the default. A companion that
  journals you, not a text area with AI attached. The earlier two-pane write-left /
  cards-right box is the lighter fallback, not the lead. Discipline that keeps this buildable:
  the companion can *talk* about anything, but what it *saves* as structured captures in
  the early 4.x line stays the three keystone types. Richness is conversation behavior (prompt + tools),
  not new data types.

---

## A. The data model (finalized): hybrid ingest + typed homes

The user asked whether a single generic "capture" record is really best for a scalable
system. Honest answer: as a store-everything-forever table, no. As an **ingest layer**, yes.
The best-for-scale design is a **hybrid**. The spectrum:

| Approach | Add a facet | Query / aggregate | Integrity | Who does this |
|---|---|---|---|---|
| Table-per-type | migration + code (slow) | excellent | DB-enforced | Tasklog today; the vault's FileClasses |
| Generic item + JSON payload | register a type (instant) | weak (esp. SQLite JSON) | app-only | a pure "capture" table |
| EAV (row per attribute) | instant | painful | none | anti-pattern, skip |
| Document / block store | instant | DIY search | none | Notion; the Obsidian vault |
| **Hybrid: generic ingest + typed homes** | instant, promote when earned | excellent where it matters | tiered | the chosen design |

The two extremes are the tools the user already knows: table-per-type (Tasklog's fast, rigid
tasks) and the document model (the flexible, hand-maintained vault). Neither pure extreme is
the answer.

### The design

```
  write · talk · edit · upload            (4 sources)
                 │
                 ▼
         ┌────────────────┐
         │    CAPTURE      │   generic: { type, subject, payload,
         │  inbox + trust  │              source, confidence, status }
         └───────┬────────┘   status: proposed → confirmed / dismissed
                 │ on confirm
        ┌────────┴────────────────┐
        ▼                         ▼
   TYPED HOMES                GENERIC STORE
   (system of record)         (un-graduated long tail)
   task, person, goal,        a confirmed fact with no typed
   mood, project, area …      home yet, kept with its payload
   real tables, real          (scrapbook items, one-off facts)
   queries & rollups
```

- **Capture is the ingest + trust + audit layer, not the storage.** This is where the
  agile, plugin-like feeling belongs, and where it does no harm.
- **The four sources** all produce the same Capture: you **write** (AI box), **talk**
  (conversational), **edit** (Diamond-Box-style profile fields filled by hand), **upload**
  (scrapbook: documents, photos, receipts). Source differs; shape does not.
- **On confirm, a capture flows into its typed home.** A confirmed `task` writes to the
  existing Tasks table (do not fork it). A confirmed `mood` writes a mood row. A confirmed
  `person` seeds the people table.
- **The long tail stays generic** until it earns a table. This is the **graduation rule**: a
  new facet starts as a Capture type with a JSON payload (instant, no migration). When it
  needs aggregation, relations, or reporting (finance totals, CRM timelines, goal rollups),
  promote it to a typed table and add a `capture → table` projection. Not before.

This is the standard raw-inbox to typed-projection pattern (staging-then-model /
event-sourcing-lite). Not a fence-sit: plugin-speed to add facets, relational power exactly
where the data is heavy, paid for per-facet only when earned.

### Capture record (shape)

```
Capture {
  type        registered type name (see registry below)
  subject     what it is about: self | person | life-area | project | goal | day
  payload     type-specific data (JSON)
  source      journal-entry | conversation | manual | upload
  confidence  for extracted items
  status      proposed | confirmed | dismissed        (the trust loop)
  occurredAt / createdAt
}
```

### Two axes, do not fuse them

- **Life areas** = the user's categories (Career, Finances, Health, Relationships…).
  User-defined. These already exist as **Clients**. Seed sensible defaults. "Finance as an
  area" lives here.
- **Capture types** = the *kinds* of facts (a task, an expense, a mood). System-defined but
  extensible via the registry. "Expense as a type" lives here. An expense capture can be
  filed under the Finance area. Areas are the folders; types are the shapes of what goes in.

---

## The AI provider seam (dev on Claude Code, later API or local)

The LLM sits behind one interface with swappable providers, so the app never hard-codes where
inference runs. Three providers, matching the trajectory single-user-now to distributed-later:

- **Claude Code (dev + single-user):** drive a Claude Code session via
  `@anthropic-ai/claude-agent-sdk` (`query({ prompt, options })`). Runs on the user's own
  Claude subscription: no API key, no per-token cost during development. This is the pattern
  Patternarium already uses (`extension/src/claude-session.ts`): a streaming input queue,
  session resume, model alias (opus/sonnet/haiku/default), and a `canUseTool` permission hook.
- **Anthropic API (BYOK):** the raw Messages API with a user-supplied key. The swap target
  once past dev, and for anyone without a subscription.
- **Local LLM (privacy):** a small model on the user's own machine (e.g. via Ollama). The
  option that honors principle #2 fully.

Two consequences to design around:

1. **The Agent SDK is Node-only.** The Claude Code provider lives in the Node layer (the
   existing MCP server or a small sidecar), not in the .NET backend. Expose extraction as an
   HTTP call the backend makes, so the provider behind it can be Node (Claude Code) or .NET
   (API / local) without the backend caring.
2. **The Agent SDK is an agent, not a plain completion.** For one-shot extraction that is a
   heavy hammer; constrain it (single turn, tools disallowed) or use a plain completion. But
   for the **conversational capture mode it is the ideal engine**: multi-turn, it calls
   in-process tools to propose captures, and its permission / ask cards map directly onto the
   trust loop (confirm each proposed capture). Patternarium's `ask_choice` in-process MCP tool
   is the template.

Cost sanity (from Patternarium's measured spike): ~$0.13 first turn, ~$0.03 subsequent with a
hot prompt cache. Fine at single-user journaling volume.

---

## Reliability, topology, and determinism

**Topology: a seam, not a microservice.** For a single-user self-hosted app, fewer moving
parts wins (project ethos: understandable by one developer). So:

- Keep the AI behind a clean **module / interface**, and make "separate process" a
  *deployment* choice, not an architectural mandate. This is a modular monolith, not
  microservices.
- **Now (resolved at plan stage, P87):** the companion + its tools live in a **Next.js API
  route** (`/api/companion/chat`, the doppel precedent) - no new process; the frontend talks
  to the route, the route talks to the .NET API. The .NET backend never calls the chat LLM;
  its only AI-adjacent call is **Ollama for embeddings** (embed-on-write, best-effort). The
  older ".NET calls the AI service over HTTP" framing belongs to the deferred batch-extraction
  path (keystone Flow B) if it is ever built.
- **Later (only if a real force appears):** because the backend talks to it through an HTTP
  seam + provider interface, you can lift the AI service into its own container, run replicas,
  or vary the provider per tenant, with no backend change. Split when scaling or isolation
  demands it, not before.

**Keeping the polyglot seam clean** (the .NET backend and a Node AI service have different
dependency trees; this is how they do not bleed into each other):

- Each process owns its own dependency manifest. The Agent SDK, Zod, etc. live only in the
  Node service's `package.json`; the .NET backend never references them. A provider keeps its
  own deps internal to the module behind the interface.
- The seam is a **contract, not shared code**: HTTP plus a defined request/response schema. No
  shared library across the language boundary.
- **One schema, mirrored** on each side (Zod on Node, C# DTO on .NET), kept in sync as a
  paired cross-language contract, the pattern the project already uses for the journal
  (`frontend/lib/journal.ts` <-> `Services/JournalMarkdown.cs`: "change both together").
- The backend depends only on "POST text, get proposed captures." It must not know that Node,
  Claude, or the Agent SDK exist behind the seam.
- Independent build / test / deploy per process (the repo already works this way for .NET /
  Next.js / MCP). The active provider is chosen by config, not code.

These graduate into `docs/engineering-guidelines.md` once built, the same way the MCP server
(the first Node service) documented its own patterns there.

**Failure: extraction must be async and degradable.** Never put a probabilistic,
network-dependent, rate-limitable LLM call in the write path. The raw capture (the journal
entry) **saves locally first, synchronously, always.** Extraction is an async enrichment that
may fail, retry, or be re-run later. AI down = no cards this time (soft degrade), never data
loss or an unusable app.

**Config: one small block.** Provider choice, model, API key or local endpoint. That is the
whole prod config surface, not a per-service sprawl.

**Determinism: two layers, because an LLM's content is never fully deterministic.** Do not
chase a deterministic *model*. Chase a deterministic *shape* and *verified content*:

1. **Deterministic shape** - the model does not emit free text you parse. It fills a typed
   slot: a `propose_capture` tool call whose args are a strict schema, with `type` constrained
   to the registry enum (task | person | mood | ...). Low temperature. The Agent SDK + Zod
   tool pattern Patternarium uses already guarantees this: output is schema-valid or it does
   not count. Same schema across all three providers, so the seam enforces shape-determinism.
2. **Verified content** - the human confirm step is the backstop. The model can be wrong;
   nothing lands in a typed home until confirmed. Add **idempotency** (key a capture by source
   + text-span + type) so re-running extraction never duplicates.

So "always deterministic" is achieved not by making the model perfect, but by guaranteeing the
output shape and gating the content through confirm. Good-enough model + strict schema + human
gate = reliable structure.

**Vector embeddings (decided 2026-09-05: semantic-first, from v4.0).** Embeddings are the
right tool for two jobs and the wrong tool for one:

- **Right - entity resolution / grounding:** "the tax thing" → the existing "File ITR" task;
  "had coffee with Sam" → an existing person or new? Keyword search cannot do this (substring
  match fails on paraphrase), so this ships with the v4.0 companion, not later.
- **Right - semantic search over history:** "what did I write when I felt burnt out",
  "everything about this person". The vault's own `JournalingSystem.md` already anticipates
  this ("MemPalace for RAG once the vault is large enough"). Same store, later increment.
- **Wrong - deciding the type.** Task-vs-person-vs-mood is a classification the LLM does better
  via the registry enum than embedding similarity does. Type = LLM + enum; embeddings = linking
  and search.

The shape (personal scale, AI-native): **local Ollama** (`nomic-embed-text`, ~270MB, CPU-fast;
free, private, no second cloud vendor), a **generic Embeddings table** (EntityType + EntityId +
Model + Vector BLOB) shared by every future entity type, and **brute-force cosine in app code**
- deliberately NO `sqlite-vec` native extension until counts demand it (sub-ms at thousands of
vectors; avoids the arm64/x64 native-binary matrix). Embed-on-write, best-effort, nullable:
hosts without Ollama (OCI, phone) keep null vectors and search degrades to keyword. Division of
labor everywhere: **embeddings shortlist top-k candidates; the model judges them** - never dump
the whole corpus into context, never trust cosine alone. Retrieval stays a first-class tool
behind a seam, so the implementation can later move to `sqlite-vec` / `pgvector` with no caller
changes. A model swap = a cheap local re-embed at this scale.

---

## The two AI surfaces (companion vs MCP connector)

Two AI front doors, one brain. Not redundant: they serve different moments, and one thing only
the companion can do.

- **The in-app companion** (v4.0+): Tasklog is the interface. A tuned companion (system-prompt
  agenda, recall, trust-loop cards) runs via the Agent SDK, and the dashboard/profile lives
  here. The daily ritual surface: morning planning, evening reflection, reviewing your life.
- **The MCP connector** (already shipped): claude.ai (web / mobile / voice) is the interface;
  Claude calls Tasklog's MCP tools to read and write your data. The frictionless
  capture-from-anywhere surface: "add task X", "log I felt wired before the demo", without
  opening the app.

Both operate on the same API and the same data, so the profile accretes no matter which door
you use. That is the point.

**Why MCP + claude.ai does not make the companion redundant:** the deep journaling
conversation is the most intimate data there is, and on claude.ai the *transcript* lives on
Anthropic's servers, not yours - only the structured writes land back via MCP. The in-app
companion keeps the whole conversation in your own DB, can be tuned and given recall, can run
on a local model, and can render the trust-loop and dashboard UI. MCP-via-claude.ai can do
none of those. So: quick capture on the go = MCP; the owned, tuned, private ritual = the
companion. (The original "delegate journaling to Claude over MCP" plan quietly breaks the
own-your-data principle for exactly the data that matters most.)

**Journaling over MCP:** journaling and mood currently have NO MCP tools. A later increment can
add lightweight capture tools (quick "log a mood / a thought" from claude.ai) that write the
same `MoodCheckin` / Capture, so it stays coherent; the deep companion conversation stays
in-app for ownership. Not a v4.0 concern.

**Behavior parity across the doors (author the companion once):** the companion's behavior -
its agenda (what it asks), how it proposes captures, and the confirm-before-write discipline -
is a single authored spec. In-app it is the Agent SDK system prompt; on claude.ai it is a
Project's custom instructions with the Tasklog connector enabled. Same spec, both doors, so
claude.ai can run the same free-text -> proposed-capture flow the app does. The mechanism that
makes this clean: MCP gains a `propose_capture` family that writes to the **same Capture inbox
as `status = proposed`**, exactly like the in-app companion. Confirmation then differs only by
affordance: trust-loop cards in-app, a conversational "add these?" or a confirm tool on
claude.ai, but both flip the same Capture proposed -> confirmed -> typed home. Terminology:
this is one connector (the existing MCP server) growing a toolset per capture type, not a new
connector per type. The ownership caveat still holds: claude.ai transcripts stay external, so
the deep ritual lives in-app; parity of behavior does not change where the conversation is
kept.

**Cheap set-up in v4.0 (so parity is not a rewrite later):** two small things -
(1) give the Capture inbox a `source` that already anticipates `mcp` / `claude.ai`, so an
external proposal is first-class from day one; (2) author the companion behavior as a reusable
**spec artifact**, not inline code, so the same text can become claude.ai custom instructions
later. Neither adds real work to v4.0.

**Future unification (not now):** the Agent SDK runs in-process MCP tools
(`createSdkMcpServer`) and the MCP server exposes tools over the wire. Capture / journaling
tools could eventually be defined once and registered both in-process (companion) and over MCP
(claude.ai), so the two doors share one definition. A later cleanup, noted so it is not
forgotten.

---

## The type registry (adopt the vault's FileClasses)

The user already designed and lived in these schemas (`99 - Meta/FileClasses/` in the vault).
Adopt them as the starting type set rather than inventing new ones.

| Type | From vault | Key fields (real, from the vault) | v4.0 keystone |
|---|---|---|---|
| **task** | (Tasklog) | title, project/track, deadline | **implement** (existing Tasks table) |
| **mood** | periodic/daily | mood-core (Happy/Sad/Angry/Fearful/Disgusted/Surprised/Bad/Calm), mood-specific (free text), energy-morning (num), energy-eod (num), mood-shift (Improved/Worsened/Stable/Volatile) | **implement** (small new table) |
| **mention** | life/person | person + relationship (Family/Friend/Colleague/Mentor/Acquaintance/Other) | **implement** as a soft tag on the entry (seeds CRM) |
| **goal** | productivity/goal | status (Active/Achieved/Dropped/On Hold), timespan (10Y/5Y/3Y/1Y/6M/3M/1M), reason, progress (num), target (num), date-started, date-target | register; likely near-spine (see below) |
| **person** | life/person | relationship, tags, notes | register (full CRM is a later facet) |
| **project** | productivity/project | status, description, goal (link), date-started/target/completed | maps to existing Projects |
| **area** | productivity/area | (life area) | maps to existing Clients |
| **reflection** | journal/reflection | date, topic, tags, body | register |
| **memory** | journal/memory | (a captured memory) | register |
| **idea** | life/idea | body, tags | register |
| **resource / literature / permanent** | knowledge/* | source notes, references | register |
| **expense / subscription / document** | (new) | amount / renewal / file | register only (graduation-rule facets) |

**Keystone writes only:** `task`, `mood`, `mention`. Everything else is registered so the
model is ready, with no extractor/writer yet. This keeps the first build small and provable
while saying yes to every future facet.

---

## Two principles that make or break it

1. **The trust loop.** Extraction will sometimes be wrong. If it writes wrong things
   silently, trust dies and it becomes Monica again (noise to police). Every inferred item is
   **reviewable and cheap to correct**: keep is one tap, dismiss costs nothing, and the card
   shows the text span it came from. Nothing enters a typed home unconfirmed unless the user
   explicitly opts in.
2. **Self-hosted is the unfair advantage.** Feelings, relationships, the model of who you
   are, this is the most intimate data there is. It only counts as "kept" if it is kept by
   you, on your machine. This is the project's founding ethos taken to its end, and the one
   thing a hosted competitor can never match. It is why the local-LLM option is not optional.

---

## The facets (lenses over the captured data)

Not a build list. The territory. Vocabulary partly from life-sim games.

- **Life map / tracks** - where each part of life is moving vs gone cold. Regions per life
  area, winding progression paths, pieces you move, neglect shown as overgrowth. Three
  mockups were explored: (1) **Lanes** (rows with heat sparklines, cheap, honest), (2) a
  **Candy-Crush progression path** (winding track, tasks as checkpoints, a pawn you advance,
  a "pick 3 of 5 to move today" move-budget), (3) a **hand-drawn map** (Cardonia-style
  regions, generated once and kept stable). Leaning: path first, map as a later skin.
- **Relationships (CRM)** - people as first-class entities, extracted notes, gentle decay
  when a bond is untended (Stardew-style), populated from journaling not a form.
- **Goals / aspirations** - the vault's `goal` schema (progress/target/timespan). **Note:
  goals ARE close to the tracks engine.** The life map is largely a view over goals plus the
  activity feeding them, so goals are near the spine, not a far-off facet.
- **Feelings / mood** - the vault's daily mood/energy model; a mood timeline over weeks.
- **Needs / charge** - a place to recharge. Open: literal need-bars (Sims) vs a calm
  reflection space with no meter.
- **Traits / self-model** - patterns learned over time (what energizes vs drains you, when
  you slip). The part that makes it feel like it knows you. Mirrors the vault's "stable facts
  in memory."
- **Habits & time** - already built; fold in as the raw signal the other facets read.

---

## What the life-sim games teach

- **A vocabulary of facets.** The Sims: needs/motives (the "charge" idea), aspirations (long
  goals), traits (self-model), moodlets (an event leaves emotional residue = the feeling
  note). Stardew Valley: friendship hearts that gently decay when untended (humane CRM), gift
  preferences (what you know about a person = CRM notes), seasons (life rhythm / planning
  cadence).
- **The retention insight (the important one).** Games hold people where to-do apps churn
  because your character is a record of everything you invested. You do not abandon a save you
  grew. A profile that grew with you *is* what keeps you. That is the real answer to "capture
  me and keep me": not features, accreted self.

---

## Sequencing (how it ships)

The companion is v4.0. It ships basic first, then climbs one facet per **minor** version, the
same feature-per-minor cadence the project already uses (v4.0, v4.1, v4.2 ...). Journaling is
an output of the companion, not the capture surface.

- **v4.0 - basic companion (task-only, semantically grounded).** A conversation surface
  (Agent SDK on the user's Claude subscription) that proposes `task` captures; the trust loop
  confirms them into the real Tasks table; the raw conversation is saved. Includes the
  **semantic grounding infra from day one**: local embeddings (Ollama) + a generic Embeddings
  store + a `find_relevant_tasks` retrieval tool, so the companion recognizes existing tasks
  instead of duplicating them. The smallest end-to-end proof of "talk -> structure -> confirm
  -> real data." No dashboard, no journal changes, one provider. PC/LAN-first (no public
  deploy until the route is gated; the app has no auth).
- **v4.1 - the derived journal note + mood.** The companion generates the day's note
  (end-of-day reflection and/or start-of-day planning) and captures `mood` -> writes a
  `MoodCheckin` (reuse the feelings-wheel + Hawkins MoC + energy model; change how it is
  captured, not the model). Pulled forward (2026-09-05): this is the felt journaling value
  the whole line exists for - task capture alone is already possible via claude.ai + MCP, so
  the note must not wait three minors.
- **v4.2 - recall.** Feed recent context + profile facts into the session so it knows you;
  the v4.0 embedding store extends over history as the corpus grows.
- **v4.3 - mention / people seed.** Soft person tags on the session; seeds the future CRM.
- **v4.4+ - the fuller companion** (cross-questioning, front/back-of-mind triage, planning
  ritual), the **dashboard-as-home + journal-tab reorientation**, and the gated public deploy.

Then the lenses (life map, CRM, goals, needs, traits) ride on the accumulated data, each its
own increment via the graduation rule.

Rules: never build a lens before the data that feeds it exists; and additive first - the v3.x
journal stays until its replacement is proven, then it is reoriented, not ripped out.

---

## Journaling: from input form to output note

The v3.x journal (templates + fill-the-sections UI + autosave) is **superseded** by the
companion, but not deleted, and its hard-won structure is preserved in two new roles:

1. **As the companion's agenda** - the section shape (morning priorities, front-of-mind /
   back-of-mind, plan, mood, evening review) becomes what the companion *asks about* to draw
   the user out and fill missing pieces on a rambling day. This is part of "customising the
   assistant": the template becomes the assistant's conversational checklist, not a DB form.
2. **As the generated note** - at start of day (planning) and/or end of day (reflection) the
   companion *generates* the structured journal note from the conversation. The structure is
   an output artifact, not something the user types into.

So journaling is not scrapped and is not the capture surface. It flips from **input form** to
**output note plus question agenda**. Manual editing of the note stays for days the user does
not want to talk. The v3.x journal tab is left in place until the generated note is proven
(v4.3+), then it is reoriented or removed as the home becomes a dashboard, never ripped out
before its replacement works. Mood data (`MoodCheckins`: feelings wheel, MoC, energy) is the
kind of iterated, hard-won data to keep, so it is reused as the mood home; only the capture
changes.

---

## Open questions

- **How eager should extraction be?** Pull silently and show results, or ask as you go?
  Leaning: silent pull, always shown, never auto-committed.
- **Keystone capture mode:** lead with the typed AI box, or the conversational mode (which
  the vault already proves the user likes)? Both feed the same model; this only decides which
  interface to build first.
- **Charge / recharge:** meter (Sims, gamified) vs sanctuary (calm, no meter). Sets whether
  the app feels like a game or a refuge. Decide before building that facet.
- **Where does the self-model live?** A structured profile record vs an evolving summary the
  extractor maintains (the vault uses Claude memory for this). Affects portability.
- **Migration from the vault:** is the ~1300-note Obsidian vault a one-time import source for
  seeding the profile? Its frontmatter is already typed to the FileClasses above.

---

## Scope guards

- Not a single feature. A multi-version direction. Resist building "the profile" as one thing.
- Not the map first. The extraction engine and data model are the foundation; the map is a
  lens. Foundation before lens, always.
- Capture is the inbox, not the system of record. Confirmed data lives in typed homes (or the
  generic store until a facet graduates). Do not make everything live in one JSON table.
- Not manual structure anywhere it can be extracted. The moment upkeep becomes a chore, it has
  failed the way both Monica and the hand-maintained vault fail.
- Not hosted-first. Local-LLM option and self-hosting are the point, not a limitation.

---

## Assets for a future agent

- Prior art: `/home/manu/Personal/Vault/Second Brain/` (Obsidian vault), especially
  `JournalingSystem.md` and `99 - Meta/FileClasses/` (the real typed schemas).
- Current Tasklog structure: `docs/architecture.md`, `docs/product-design.md`.
- The life-map visual exploration: three mockups (lanes / progression path / hand-drawn map)
  produced during ideation.
- Existing AI surface: the MCP server (`mcp/`) and the in-app chat route.
- Claude Code integration pattern: `/home/manu/Personal/Code/Depth Projects/Patternarium/`
  (`extension/src/claude-session.ts`) drives the Claude Agent SDK against the local
  subscription. Template for the dev / single-user provider.
- Profile-field reference: a DarwinBox (SonataOne) profile export at
  `/home/manu/Downloads/SonataOne (...).html` (17 MB, read structure only). Shows the shape of
  a rich personal/HR profile for the manual-edit source and the self-model facet: identity (DOB,
  gender, marital status, blood group, nationality), professional (designation, department,
  education, certifications, work experience), contact (current / permanent address, emergency
  contact), and documents (passport, aadhaar, bank) = the document-safekeeping idea.
