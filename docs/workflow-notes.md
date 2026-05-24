# Workflow Notes

**Purpose:** capture workflow agreements, deviations, and improvements as they emerge during work. This is a living doc. At the end of the relevant feature we review what's here and codify the keepers into `.claude/rules/toolkit.md` and the relevant skill files. Anything not codified stays as historical record.

**Why this file exists:** the project's toolkit (`.claude/rules/toolkit.md` + skill files in `.claude/commands/`) is the canonical workflow. But when we adjust the flow for a specific feature, or notice the toolkit needs updating, we don't want to edit the canonical files mid-flight, AND we don't want the agreement to live only in conversation (where it dies with the context window). This file is the in-between layer.

**How to use:**
- When something in the workflow surprises us, breaks, or works unusually well, add a dated entry under "Deviations log".
- When we propose a toolkit change but want to test it first, add it to "Toolkit improvement candidates".
- At feature ship time, review both sections and codify the keepers.

---

## Active workflow experiments

### Experiment A: MCP server feature (started 2026-05-18)

**Why this is an experiment:** first time the project builds against an external protocol spec (the Model Context Protocol), and first time the user is learning a domain from scratch via the docs we write. Default `/explore` doesn't mandate external research, so we are adjusting the flow.

**Agreed adjustments for this feature:**

1. **Research-first explore.** During `/explore`, before codebase analysis, populate `docs/research/` with verified excerpts from canonical sources. Each file: dated, sourced, quotes the critical bits. The plan cites these by path rather than restating facts from training data.
   - `docs/research/mcp-spec-{version-or-date}.md` - relevant MCP spec sections (transport, OAuth, tool schema).
   - `docs/research/claude-ai-connector-oauth.md` - what claude.ai web/mobile connectors actually accept (verified from claude.com support docs).
   - `docs/research/cloudflare-tunnel.md` - tunnel setup specifics we will rely on.

2. **Dense decisions block in the plan.** Plan's `## Critical Decisions` section captures, for each non-trivial choice: options considered, choice made, rationale, link to the research file(s) that informed it. One-off enrichment of the existing template, no skill change.

3. **Pre-committed learnings.** Plan includes these as explicit steps (not optional follow-ups). Each one is project-independent study material the user will read later:
   - `docs/learnings/mcp-protocol.md` - what MCP is (clients, servers, tools, transports).
   - `docs/learnings/oauth-2-1-for-mcp.md` - OAuth 2.1 mechanics, why MCP requires Dynamic Client Registration + PKCE, the difference between client_id/secret and access token.
   - `docs/learnings/cloudflare-tunnel.md` - tunnels vs port forwarding.

**Build decisions locked in so far (will be re-stated in the plan's Critical Decisions):**

- **Hosting shape:** MCP server runs on the phone alongside existing API and frontend. Cloudflare Tunnel exposes only the MCP port publicly. Phone API stays LAN-only. (Option A from the hosting comparison in conversation.)
- **Auth:** OAuth 2.1. Verified via claude.com support docs that claude.ai web/mobile connectors require OAuth. Bearer/header auth is Claude Desktop and Claude Code CLI only, not web.
- **Language:** TypeScript / Node, using `@modelcontextprotocol/sdk`. Lives in a new top-level service alongside `backend/Tasklog.Api/` and `frontend/`.
- **Tool scope:** all task, project, and label operations exposed as MCP tools (matching the full REST surface).
- **OAuth implementation:** to be decided during research. Candidates: `mcp-auth` library, Cloudflare's `workers-oauth-provider`, or a minimal hand-roll. Decision made in the plan's decisions block after research is written.
- **Cloudflare domain:** open. User has `manudubey.in` from GCP setup. Need to verify it is on Cloudflare DNS, or decide on acquisition / alternate domain.

---

## Deviations log

<!-- Append a dated entry whenever we deviate from a skill's default behaviour or hit something the toolkit doesn't anticipate.

Format:

### YYYY-MM-DD - short title
- **What happened:**
- **Why we deviated:**
- **Should this become a permanent toolkit change?** yes / no / undecided
- **If yes, what specifically would change in which file:**

-->

### 2026-05-18 - opportunistic learning/guide capture after Step 0 (periodic-capture pattern)

- **What happened:** completed Step 0 of the MCP plan (DNS migration + GitHub OAuth App registration) and immediately captured 2 new learnings (`dns-and-nameservers.md`, `github-oauth-vs-github-apps.md`) and 2 new guides (`cloudflare-tunnel-dns-setup.md`, `github-oauth-app-setup.md`), rather than waiting for `/document` at feature end or for the originally pre-committed learnings in Steps 2/3/6.
- **Why we deviated:** user explicitly requested periodic doc capture: "add the docs for the learnings and guides for the things I set up so if I ever want to set up them again we do them. we will do this periodically." Matches the `/guides` skill's "alongside the work, strongest pattern - you don't lose context" principle, applied at finer granularity than once-per-feature.
- **Should this become a permanent toolkit change?** Likely yes if it keeps proving useful. Two possible shapes: (a) a one-line addition to `/execute` saying "after a logical chunk of user-facing setup completes, consider whether learnings or guides are worth capturing now"; (b) a new `/checkpoint` skill that bundles the prompt.
- **If yes, what specifically would change in which file:** primary candidate is `.claude/commands/execute.md`. After "## When to Stop", add a "## When to Capture" section pointing to `/learnings` and `/guides`. Also update the "Toolkit improvement candidates" table below.

### 2026-05-18 - workflow-notes.md carried onto the feature branch via stash

- **What happened:** `workflow-notes.md` was authored on main before `/start-feature` ran. The skill's Step 3 requires a clean working tree before creating the feature branch. Per user direction, the doc is an experiment tied to this MCP feature and should travel onto the feature branch rather than be committed separately to main first. Workaround: `git stash push -u`, run `/start-feature` (it sees a clean tree, creates branch), then `git stash pop` on the new branch.
- **Why we deviated:** the user wanted the workflow-notes scaffolding to live on the feature branch so it ships (or gets retired) together with the feature it describes. Committing it to main first would have decoupled the doc from the feature lifecycle.
- **Should this become a permanent toolkit change?** undecided. Possibly worth a one-line note in `/start-feature` Step 3.
- **If yes, what specifically would change in which file:** `.claude/commands/start-feature.md` Step 3 could add: "If untracked files belong to the work about to be branched, stash them with `git stash push -u`, run this step, then `git stash pop` on the new branch."

---

## Toolkit improvement candidates

Candidates we want to evaluate codifying into `.claude/commands/` or `.claude/rules/toolkit.md` once this feature ships. Format: short name, target file, why we are considering it.

| Candidate | Target file | Status |
|---|---|---|
| Living `workflow-notes.md` doc as a tracked artifact in the documentation map | `.claude/rules/toolkit.md` (documentation map table) | **Deferred** (one feature of data isn't enough; re-evaluate after the next 1-2 features). |

---

## How this doc gets retired or pruned

When we update toolkit.md and the relevant skill files at feature end:

1. For each candidate we decide to codify, copy the change into the target file directly.
2. Move the entry from "Toolkit improvement candidates" into a "Codified" section at the bottom of this doc with the date and a one-line summary of what was changed.
3. For candidates we decide not to keep, move them to a "Rejected" section with a one-line reason.
4. The Deviations log stays as a historical record. It is append-only.

The doc itself is never deleted. It is an append-only log of how the workflow evolved.

---

## Codified

### 2026-05-24 - post-ship review of P50 (MCP server) candidates

1. **Research-first `/explore` for external specs** → `.claude/commands/explore.md` got a new Phase 2b "Research external dependencies first (if applicable)". Codifies the practice that saved hours during the MCP build (verified excerpts from MCP spec, claude.ai connector docs, Cloudflare Tunnel docs cited from the plan vs. relying on training data). Skip-if-not-applicable clause covers refactors / bug fixes / self-contained features so the step doesn't bloat every exploration.

2. **Extended Critical Decisions template** → `.claude/commands/create-plan.md` template now has two formats: one-line for low-stakes choices, expanded format (options considered / chosen / trade-offs / research citation) for high-stakes architectural decisions. Triggered by the P50 plan's decision block being noticeably more useful than older plans' one-liners.

3. **Periodic learning/guide capture during `/execute`** → `.claude/commands/execute.md` got a new "When to Capture" section. Codifies the practice (user-requested during P50) of prompting for `/learnings` and `/guides` after logical chunks complete, rather than deferring to end-of-feature where context is stale. Prompt-only, no auto-run.

4. **Plan checkbox + Outcomes discipline** → also added to `.claude/commands/execute.md` Status Updates section. Not a P50 candidate per se, but P50's `/ship` hit a blocker (90% progress, many 🟥/🟨) because user-action checkboxes were never updated and Outcomes was deferred to ship time. Toolkit now explicitly requires both to be kept current during execute.

---

## Rejected

### 2026-05-24 - stash workaround for `/start-feature` clean-tree check

**Rejected because:** the situation only arose because `workflow-notes.md` was being created at the same moment the feature it tracked was starting. Future workflow-notes edits are modifications, not creates, and won't trip the clean-tree check. One-time edge case, not worth permanent toolkit complexity.
