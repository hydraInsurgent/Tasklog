# Keystone flows: the journaling companion (v4.0)

**What this is:** the user stories and internal system flows for the **keystone** of the
Living Profile, written before code so the behavior and the failure modes are settled on
paper. Companion to [living-profile.md](living-profile.md) (the north star). Scoped to the
keystone only. It feeds a future `/explore` + `/create-plan`.

**Keystone scope (conversational-first):** the capture surface is a **companion
conversation**, Rosebud-style, not a passive journal box. It opens the talk, asks and
cross-questions, digs deeper, suggests alternatives, explores options, and **recalls relevant
earlier context**. As things emerge it proposes structured cards, confirmed inline via the
trust loop. Free-form writing is supported as one input within the conversation.
**Journaling is an output of the companion, not the capture surface:** the day's structured
note is generated (start-of-day planning and/or end-of-day reflection), and the v3.x
fill-the-sections journal is superseded, not the model to build on (see living-profile.md,
"Journaling: from input form to output note"). The Capture inbox, type registry, and provider
seam sit underneath. This doc describes the full companion; the **v4.0 first release is a
deliberately basic cut** (see below) and the companion grows one facet per minor version.

**The discipline that keeps it buildable:** the companion can *talk* about anything, but what
it *saves* as structured captures stays `task` / `mood` / `mention` across the early 4.x line. The richness
(questioning, suggesting, recalling) is conversation behavior driven by the system prompt and
tools, not new data types. Everything else (life map, full CRM, goals, expenses, embeddings,
needs, traits) is out of scope here.

---

## v4.0 cut (the basic first release)

The stories and flows below describe the full companion. **v4.0 ships a deliberately basic
cut** to prove the core bet end to end; the rest arrive one per minor version.

**In v4.0 (basic):**
- A companion chat surface (new tab), Agent SDK on the user's Claude subscription (one
  provider).
- The companion proposes `task` captures only (`propose_capture` scoped to `task`).
- The trust loop: proposed task cards -> keep / edit / toss -> a confirmed card writes a real
  row in the existing Tasks table.
- **Semantic grounding:** local embeddings (Ollama `nomic-embed-text`, generic Embeddings
  table, brute-force cosine - no vector extension) + a `find_relevant_tasks` retrieval tool,
  so the companion recognizes existing tasks ("the tax thing" -> "File ITR") instead of
  proposing duplicates. Embeddings shortlist, the model judges.
- The raw conversation is saved as the source. Additive only: the v3.x journal tab is left
  untouched.
- **History calendar** (added during build): month calendar with dots on conversation days
  (the journal-calendar pattern in companion identity); past days read-only, their cards
  still actionable. Sage knows the local date/time (injected per turn).
- **Deployment stance:** PC/LAN-first. Subscription auth lives on the PC, and the public OCI
  instance has no app auth - the companion route does NOT deploy publicly until gated.

**Out of v4.0, arriving next (one per minor version - reordered 2026-09-05 so the felt
journaling value lands first, since task capture alone is already possible via claude.ai +
MCP):**
- v4.1 **the generated journal note + mood** (planning / reflection synthesis; `mood` ->
  writes a `MoodCheckin`) - the actual journaling value, one minor after the skeleton
- v4.2 **recall** (recent context + profile facts into the session; the embedding infra from
  v4.0 extends to history when it grows)
- v4.3 `mention` / people seed
- v4.4+ the fuller companion (cross-questioning, front/back-of-mind, planning ritual) +
  dashboard home + journal-tab reorientation + gated public deploy

Story-to-version map: **v4.0 core** = 1 (companion chat, basic form), 3 (cards emerge, task
only), 4 (trust loop), 5 (tasks land), 9 (never lose it), 10 (own my AI, single provider).
**Later minors** = 6 mood + 8 reflection (v4.1), 2 recall (v4.2), 7 people (v4.3), and the
deep cross-questioning of story 1 (v4.4+).

---

## User stories

Each story has acceptance criteria (what "done" means).

1. **A companion, not a blank box.** As a user, it opens the conversation, asks me questions,
   and follows up, so I am drawn out instead of facing an empty page.
   - A session opens with a contextual prompt/question. It responds to my answers with
     reflection and follow-up questions, can suggest alternatives and explore options, and
     accepts free-writing at any point.

2. **It remembers me.** As a user, it recalls relevant earlier entries, people, and threads,
   so it feels like a companion that knows me, not a stranger each time.
   - During the conversation it references relevant recent context and profile facts (recent
     context + memory in the keystone; embeddings/RAG later, see north star).

3. **Cards emerge from the talk.** As a user, as we talk it proposes the tasks, mood, and
   people it hears, so structure falls out of conversation instead of forms.
   - Proposed cards (`task` / `mood` / `mention`) appear inline during the dialogue, each
     showing the moment/span it came from, without derailing the flow.

4. **Trust loop (keep / tweak / toss).** As a user, I confirm, edit, or dismiss each proposed
   card, so nothing wrong enters my data.
   - Keep is one tap. Edit before keeping is possible. Dismiss costs nothing. Only confirmed
     cards reach a typed home. Dismissed items do not reappear.

5. **Tasks land where tasks live.** As a user, a confirmed task appears in my real task list
   with a guessed project/track, so journal and tasks are one system.
   - A confirmed `task` writes a row in the existing Tasks table. The project guess is shown
     and editable. Confirming twice does not duplicate.

6. **Mood over time.** As a user, my mood and energy are captured from the conversation, so I
   can see the trend later.
   - The `mood` card uses the vault mood model (core emotion, specific, energy morning/eod,
     shift). A confirmed mood attaches to the day.

7. **People seeded gently.** As a user, mentioning a person notes it against the session, so
   relationships build up without a form.
   - A `mention` is a soft tag with a relationship guess. No full CRM entity yet; this seeds
     the future CRM.

8. **Sense at the close.** As a user, the companion can wrap a session with a short distilled
   reflection (mood, what mattered, what moved), so I get sense back, not just a to-do list.
   - An extract-to-reflect summary is offered at session close. Read-only synthesis.

9. **Never lose it.** As a user, my words are saved even if the AI is unavailable, so I never
   lose a thought.
   - The raw conversation/entry saves regardless of AI state. If the companion is unreachable
     I can still free-write and it saves. Extraction retries or can be re-run.

10. **Own my AI.** As a user, I choose where the companion runs (my Claude subscription, an
    API key, or a local model), so my most intimate data stays under my control.
    - A settings block selects provider / model / key / endpoint. Switching needs no data
      change.

---

## System flows

### Flow A - the companion session (primary)

1. User opens the companion. It **loads context** (recent entries, relevant profile facts) and
   opens with a prompt or question. (Stories 1, 2.)
2. Turn by turn: the user speaks or writes; a Claude Agent SDK session (Node) responds,
   reflects, cross-questions, suggests, and recalls. In-process MCP tools available:
   `propose_capture`, `ask_choice`.
3. As structure emerges the model calls `propose_capture(type, payload, span, ...)`, rendering
   an **inline confirm card** (the permission/ask pattern from Patternarium). (Story 3.)
4. User keeps / edits / dismisses each card (Story 4):
   - keep -> Capture `status = confirmed` -> **project into the typed home** (`task` -> Tasks;
     `mood` -> MoodCheckin, v4.1; `mention` -> session tag, v4.2).
   - dismiss -> `status = dismissed`.
5. The **raw conversation is saved as the source** (a JournalEntry), synchronously.
6. At session close the companion may produce an extract-to-reflect summary (Story 8).
7. **Idempotency:** a capture is keyed by (source, span, type), so nothing duplicates and
   dismissed items stay dismissed.

### Flow B - quick free-write (secondary)

1. User just writes a block, no dialogue.
2. Saved synchronously; a **batch extraction** runs after and proposes cards for confirm.
3. Same Capture -> typed-home path as Flow A. This is the lighter fallback surface.

### Flow C - AI unavailable (degradable)

1. Raw words saved synchronously, always.
2. If the companion/provider is unreachable, the surface degrades to plain free-write (Flow B
   input) and still saves.
3. Extraction jobs are marked pending and retried with backoff; the entry shows a soft
   "structure pending" state. No data loss, app stays usable offline.

### Flow D - provider swap

1. User changes provider / model / key in settings.
2. The next session/extraction uses the new provider. Same schema contract, no data migration.
3. Existing captures and typed data untouched.

### Flow E - correction feeds nothing yet (noted)

Dismissed/edited captures could later inform extraction (few-shot, preferences). In the
keystone a dismiss only records so the item does not reappear. Learning-from-corrections is a
later increment.

### Recall mechanism (keystone vs later)

Keystone recall = load relevant **recent entries + profile facts** into the session context,
the same approach the Obsidian system already uses (stable facts in Claude memory, episodic in
daily notes). The **embedding infra is laid in v4.0 for task grounding** (Ollama + Embeddings
table + retrieval tool); deep semantic recall over history (v4.2) reuses that same store and
tool as the corpus grows - no new architecture, just more entity types embedded.

---

## Data touchpoints

| Record | New? | Role |
|---|---|---|
| **JournalEntry** (raw source) | existing (v3.x journaling) | the conversation/free-write, verbatim, saved first |
| **Capture** | new | the inbox: `{ type, subject, payload, source, confidence, status, span, timestamps }` |
| **Tasks** | existing | typed home for confirmed `task` |
| **Mood** | new (small) | typed home for confirmed `mood`, shape from the vault daily schema |
| **entry-mention tag** | new (light) | soft link person <-> session for confirmed `mention` |
| **AI settings** | new (small) | provider / model / key / endpoint |
| profile facts / recent entries | existing + profile | read for recall context in Flow A |

---

## Non-goals for the keystone

Full CRM / person entities, goal extraction, expenses / subscriptions / documents, the life
map or tracks lens, embeddings / semantic search, needs / charge, traits. All ride on the
keystone later via the graduation rule.

---

## Open questions (keystone-specific)

- ~~Typed box vs conversational first~~ - **resolved: conversational-first companion.** The
  typed two-pane box is the secondary free-write fallback (Flow B).
- **How proactive?** How hard the companion leads (constant questions) vs lets the user drive.
  Tone-setting; probably a light touch with the user always able to just talk.
- **Session cadence.** Single open surface vs the vault's morning / mid-day / evening rhythm.
- **Recall budget.** How much recent context and profile facts to inject per session for
  useful recall without a bloated prompt.
- **Reflection trigger.** Auto at close vs on-demand.
- **Card timing.** Propose cards live mid-conversation vs batched at natural pauses, to avoid
  interrupting the flow.
