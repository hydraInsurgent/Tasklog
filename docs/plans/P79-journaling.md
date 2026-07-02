# P79 Journaling v3.0 - Implementation Plan

**Overall Progress:** `15%`

## TLDR
Add journaling as its own section: three code-seeded templates (Daily, Gratitude, Affirmations) whose entries are structured data rendered to markdown; timestamped mood check-ins logged through a feelings-wheel picker that derives the Map of Consciousness score; a task-linked Today's Plan with a derived "Unplanned, got done" bucket; a `/journal` page (note center, widget rail right) matching the approved interactive prototype; markdown export as download. Autonomous run: after this plan, proceed /execute -> /unit-test -> /review -> /document, stop at ship-ready.

## Goal State
**Current State:** No journaling code exists. Branch `feature/journaling-#79`, scope locked in issue #79, UI locked by the approved prototype (`scratchpad/journal-prototype.html`) and `docs/plans/P79-ui-handover.md`.
**Goal State:** Working `/journal` on LAN (desktop + phone): pick a date, write the day's note section by section with autosave, log mood check-ins via the wheel, plan links real tasks, preview and download the rendered markdown. Backend tables, endpoints, and renderer covered by tests. Docs synced; ready for the user to eyeball and `/ship`.

## Critical Decisions

- **Decision 1: JSON content stored as plain TEXT + System.Text.Json (not EF `ToJson`)**
  - **Options considered:** EF Core owned-entity `ToJson` mapping (queryable, more machinery); plain TEXT columns serialized manually (matches the `Recurrence`-string precedent).
  - **Chosen:** plain TEXT - first JSON columns in this codebase should be the simplest understandable form; content is opaque to queries by design.
  - **Trade-offs accepted:** no SQL-level querying of section content. Queryable values (energy, MoC, dates) get real columns instead.
- **Decision 2: Templates live in a DB table, upserted from code at startup (by `Key`)** - honors the locked "seeded in code, no editor UI" scope while leaving the table ready for a future editor. Startup upsert keeps rows in sync with code definitions.
- **Decision 3: Entry upsert via `PUT /api/journal/entries/{templateKey}/{date}`** - one entry per template per date is an API guarantee (unique index + upsert), the same idempotency style as habit check-ins.
- **Decision 4: MoodCheckin is a standalone table** (timestamped, multiple per day, mirrors TimeEntry shape) - first non-task-rooted domain table; mood belongs to the day, not to a task.
- **Decision 5: Markdown generation is a pure static helper in `Services/JournalMarkdown.cs`** (RecurrenceRule pattern). No Markdig - we only write markdown. Preview and export both consume the backend-rendered text; the renderer exists exactly once.
- **Decision 6: `react-markdown` added (frontend)** for preview display - approved clear-benefit dependency.
- **Decision 7: Serif prose voice via a font *stack*** (Charter/Iowan/Georgia system serif, as prototyped) - zero new font dependency; Devanagari falls through to system fonts which cover it.
- **Decision 8: Journal-scoped visual identity** - the approved fog/plum/serif palette ships as CSS variables scoped to the journal page wrapper (light + dark), leaving the rest of the app untouched; app-wide adoption is a later, separate decision.
- **Decision 9: `completedOn=yyyy-MM-dd` filter added to `GET /api/tasks`** - lets the client derive "Unplanned, got done" (completed that day, not in plan) without fetching all tasks.
- **Decision 10: FoM/BoM rollover derived client-side** - the page loads today's and yesterday's daily entries; yesterday's uncleared items render as "rolled over" candidates, adopting copies them into today's content. No new backend semantics.
- **Decision 11: Autosave** - debounced (~800ms) + on-blur PUT of the whole entry content JSON; single user, small payloads, no dirty-state UI beyond a subtle saved indicator.
- **Decision 12: Feelings wheel is a curated data file** (`frontend/src/lib/feelingsWheel.ts`): full ring structure + per-feeling MoC level grounded by a research pass into `docs/research/feelings-wheel-moc.md`. MoC is derived (average of picked feelings), never self-tagged; own words remain first-class alongside.

<!-- GUIDELINES CHECK: new patterns introduced deliberately - (a) JSON-as-TEXT content columns,
     (b) first standalone non-task domain (journal/mood), (c) react-markdown dependency,
     (d) page-scoped theme variables. Product scope expands beyond product-design.md
     ("task management tool" -> day OS) - /document must update product-design.md. -->

## Tasks

- [ ] 🟨 **Step 1: Feelings wheel research + dataset** `[parallel]` → delivers: `docs/research/feelings-wheel-moc.md` + `frontend/src/lib/feelingsWheel.ts` (agent running in background)
  - [ ] 🟨 Research the standard feelings wheel ring structure and the Hawkins MoC scale (cite sources, verbatim level anchors)
  - [ ] 🟨 Curate the full wheel dataset with a per-feeling MoC level; document mapping judgment calls

- [x] 🟩 **Step 2: Backend data layer** `[parallel]` → delivers: tables + seeded templates via startup migration
  - [x] 🟩 Models: `JournalTemplate` (Key, Name, Periodicity, SectionsJson), `JournalEntry` (TemplateId, EntryDate date-only local, ContentJson, CreatedAt/UpdatedAt, UNIQUE(TemplateId, EntryDate)), `MoodCheckin` (CheckinAt local ISO, WordsJson, Energy 0-10, MocLevel?, CreatedAt)
  - [x] 🟩 DbContext config + EF migration (`AddJournal`, unique indexes verified); template definitions in `Services/JournalTemplates.cs` upserted by Key at startup in Program.cs

- [ ] 🟥 **Step 3: Backend endpoints** `[sequential]` → depends on: Step 2
  - [ ] 🟥 `JournalController`: GET templates; GET entries?date=; GET entry dates range (calendar dots); PUT upsert entry
  - [ ] 🟥 `MoodCheckinsController`: GET by date, POST, DELETE
  - [ ] 🟥 `completedOn` filter on GET /api/tasks

- [ ] 🟥 **Step 4: Markdown renderer + export** `[sequential]` → depends on: Step 3
  - [ ] 🟥 `Services/JournalMarkdown.cs`: pure (templates, entries, checkins, date) -> markdown string (frontmatter + sections, prototype preview shape)
  - [ ] 🟥 Export endpoints: GET day `.md` download; GET all-entries `.zip` (System.IO.Compression)

- [ ] 🟥 **Step 5: Frontend foundation** `[sequential]` → depends on: Step 3
  - [ ] 🟥 `lib/api.ts` journal + mood functions; `lib/journal.ts` types (section content shapes), derived helpers (mood shift, MoC average, rollover derivation)
  - [ ] 🟥 `/journal` route + nav link in ProjectSidebar + back-link header; journal-scoped theme variables (light + dark)

- [ ] 🟥 **Step 6: Note column components** `[sequential]` → depends on: Step 5
  - [ ] 🟥 CheckinsSection, ProseSection (auto-grow serif textarea), ProjectsTodaySection (project combobox + inline focus), ListSection (gratitude/affirmations), GhostSection (collapsed empty), EveningReviewSection (fixed fields + derived shift/EOD)
  - [ ] 🟥 PlanSection: bucket lists, task combobox (search + explicit "+ Create task", created -> due today/no project), rolled-over state from task data, derived Unplanned bucket (via completedOn)
  - [ ] 🟥 Autosave wiring (debounce + blur) with subtle saved indicator

- [ ] 🟥 **Step 7: Rail widgets** `[sequential]` → depends on: Steps 1, 5
  - [ ] 🟥 CalendarWidget (month grid, entry dots, date select); TodaySoFarWidget (plan progress, time logged, habits, check-in count); FrontBackMindWidget (transient lists, clear ×, rolled-over adopt); jump-to-evening (+ auto after 18:00, reduced-motion safe)
  - [ ] 🟥 MoodArcWidget (SVG arc, MoC color scale, courage line, expand) + FeelingsWheelModal (full dataset rings, multi-select, derived MoC, own words, energy, save)

- [ ] 🟥 **Step 8: Preview + export UI** `[sequential]` → depends on: Steps 4, 6
  - [ ] 🟥 Edit/Preview toggle; preview fetches backend-rendered markdown, displays via react-markdown
  - [ ] 🟥 Export button (day .md; zip all)

- [ ] 🟥 **Step 9: Unit tests** `[sequential]` → depends on: Steps 4, 6, 7
  - [ ] 🟥 Backend (xUnit + InMemory): entry upsert/uniqueness, mood checkins, JournalMarkdown renderer, completedOn filter
  - [ ] 🟥 Frontend (Jest): journal helpers (shift/MoC/rollover), feelingsWheel dataset integrity (every feeling has a level), plan combobox behavior

- [ ] 🟥 **Step 10: Verify end to end** `[sequential]` → depends on: Step 9
  - [ ] 🟥 Run backend + frontend, exercise the full flow (create entry, check-ins, plan link/create, preview, export) on desktop viewport + 320px

## Outcomes
<!-- Fill in after execution -->
