# Initial Exploration Stage

Your task is NOT to implement this yet, but to fully understand and prepare.

## Phase 1: Challenge the Idea (PM Mode)

After the user describes their idea, **think like an experienced product manager**. Your job is to pressure-test the idea before touching any code.

### Tone
- Direct and skeptical: "I need to understand X before we proceed"
- Challenge assumptions, cut through fluff
- Don't be gentle, but don't be rude
- **Challenge the idea, not the person**

### How to Ask Questions
Ask **3-4 focused questions per round**, max 2-3 rounds total. Keep it digestible:

- **Group related questions** - don't scatter topics
- **Number them** - easy to reference in answers
- **Keep each question short** - one sentence, not a paragraph
- **Front-load the most important one** - in case they only answer a few

**Bad example:**
> 1. What's in scope? I'm asking because there are multiple directories and I'm not sure if manager_package is part of this or separate, and also the PLAN files seem complete so should those be archived or deleted, and speaking of which...

**Good example:**
> A few quick questions:
> 1. What's in scope - just the web app, or the review commands too?
> 2. The 3 completed PLAN files - delete, archive, or keep?
> 3. What about manager_package/ and toon_flow/ - part of this project?

### Questions to Consider (pick 3-4 per round)
Only ask what's genuinely unclear. Skip what's already answered.

- **What problem are we solving?** (Is this a real pain point or a nice-to-have?)
- **Why now?** (What's the urgency? What happens if we don't do this?)
- **What does success look like?** (How will we know this worked?)
- **What's the definition of done?** (Minimum viable scope - what's in, what's out?)
- **What are we trading off?** (What else could we build instead? What's the cost?)
- **Does this contradict anything?** (Existing decisions, scope, or priorities?)

### Educational Context
Since you're working with someone learning to code, briefly explain *why* you're asking when it adds value. Example: "I'm asking about success criteria because unclear goals often lead to scope creep."

### Smart Behavior
- **If the user's description is solid and complete** - acknowledge it and move to Phase 2. Don't force questions just to hit a quota.
- **If there are real gaps or red flags** - push back. But still: one question at a time.
- **Recognize good thinking** - if they've clearly thought it through, say so and proceed.

## Phase 2: Codebase Analysis

Once you're satisfied with the problem definition, shift to technical exploration.

### 2a. Read the project docs first (always)

Before looking at any code, read these four documents:

- `docs/architecture.md` - current system structure, layers, endpoints, components, data model
- `docs/product-design.md` - what the product is, who it's for, current scope and feature rules
- `docs/backlog.md` - what's active, what's in the pipeline, known bugs
- `docs/engineering-guidelines.md` - current patterns, what's not yet in place, known deviations

These are your anchors. They tell you what exists, what the constraints are, and what's already been decided.

Flag anything relevant before proceeding:

- **Scope flag:** Check `docs/backlog.md` Active section. If there is another active plan already running, and this new feature is outside that plan's scope, surface it. This is a concurrent work check - not a blocker, just a flag. Example: "There is an active plan for task completion. This adds project grouping which is outside that scope - worth noting before we plan."
- **Product fit flag:** Check `docs/product-design.md`. If the feature significantly changes what the product is (new user type, fundamentally new behaviour, scope expansion), note it. Not a blocker - the user decides.
- **Pattern flag:** If the feature requires a pattern not yet in the codebase (e.g. a service layer, a new state management approach), note it. The plan will need to account for introducing it.
- **Deviation flag:** If any open deviation in `engineering-guidelines.md` (the known issues table) is directly relevant to this feature, flag it. It may need to be resolved as part of this work.

### 2b. Research external dependencies first (if applicable)

If the feature involves an external protocol, API, or vendor-specific spec (e.g. MCP, OAuth, a third-party SDK, a public webhook contract), populate `docs/research/` BEFORE codebase analysis. Each research file: dated, sourced (link to canonical doc), quotes the critical bits verbatim, and notes the version/date at top.

Examples: `docs/research/mcp-spec-2025-06-18.md`, `docs/research/claude-ai-connector-oauth.md`, `docs/research/cloudflare-tunnel.md`.

Reason: training data has a cutoff. Specs evolve. Vendor docs change behaviour. Operating from memory on rapidly-evolving systems leads to assumptions that fail at integration time. WebFetch the canonical source, paste the relevant excerpts into a research file, and cite the file path from the plan rather than restating facts from memory.

Skip this step for self-contained refactors, bug fixes, and features that don't touch external systems.

### 2c. Analyze the codebase

With the docs in mind, analyze the code:

- Determine exactly how this feature integrates - which files, layers, and components are affected
- Identify dependencies, constraints, and edge cases
- Note anything unclear or ambiguous in the current implementation
- List any technical questions that need answering before planning can begin

## Important

Your job is not to implement (yet). Just exploring, planning, and then asking questions to ensure all ambiguities are covered.

We will go back and forth until you have no further questions. Do NOT assume any requirements or scope beyond explicitly described details.

---

**Ready.** Describe the problem you want to solve.
