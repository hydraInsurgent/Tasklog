# Plan Creation Stage

Based on our full exchange, produce a markdown plan document.

## Requirements for the Plan

- Include clear, minimal, concise steps
- Track the status of each step using these emojis:
  - 🟩 Done
  - 🟨 In Progress
  - 🟥 To Do
- Include dynamic tracking of overall progress percentage (at top)
- Do NOT add extra scope or unnecessary complexity beyond explicitly clarified details
- Steps should be modular, elegant, minimal, and integrate seamlessly within the existing codebase

## Execution Order Tags (for plans with 3+ steps)

**Do not skip this.** For plans with 3 or more steps:

- Tag each step `[parallel]` or `[sequential]`
- `[parallel]` steps: add `→ delivers: [what this step produces]`
- `[sequential]` steps: add `→ depends on: Step N`
- Parallel steps must be independent in both **files AND environment** (dependencies, services, migrations, env vars)
- If all steps are sequential, still tag them - the tags confirm you thought about execution order

For plans with fewer than 3 steps, skip the tags.

## Markdown Template
```
# Feature Implementation Plan

**Overall Progress:** `0%`

## TLDR
Short summary of what we're building and why.

## Goal State (optional - include for features with 3+ steps)
**Current State:** Where things are now.
**Goal State:** Where we want to end up.

## Critical Decisions
Key architectural/implementation choices made during exploration:
- Decision 1: [choice] - [brief rationale]
- Decision 2: [choice] - [brief rationale]

<!-- GUIDELINES CHECK: If this plan introduces a pattern not yet in engineering-guidelines.md
     (e.g. first use of a service layer, new state management, new library), add it here as
     a decision. If it resolves a known deviation from the deviations table, note that too.
     If it expands product scope beyond product-design.md, flag it explicitly. -->

## Tasks
<!-- For 3+ steps: tag each step [parallel] or [sequential]. See "Execution Order Tags" above. -->

- [ ] 🟥 **Step 1: [Name]** `[parallel]` → delivers: [what this step produces]
  - [ ] 🟥 Subtask 1
  - [ ] 🟥 Subtask 2

- [ ] 🟥 **Step 2: [Name]** `[parallel]` → delivers: [what this step produces]
  - [ ] 🟥 Subtask 1
  - [ ] 🟥 Subtask 2

- [ ] 🟥 **Step 3: [Name]** `[sequential]` → depends on: Steps 1, 2
  - [ ] 🟥 Subtask 1
  - [ ] 🟥 Subtask 2

## Outcomes
<!-- Fill in after execution: decision-relevant deltas only. What changed vs. planned? Key decisions made? Assumptions invalidated? -->
```

Again, it's still not time to build yet. Just write the clear plan document. No extra complexity or extra scope beyond what we discussed.

If your plan includes UI work, consider running `/ui-spec` before `/execute` to set design guardrails (colors, fonts, accessibility rules).

---

## GitHub Integration

After writing the plan file, check if on a feature branch:

```bash
git branch --show-current
```

If the branch contains an issue number (e.g. `feature/task-completion-#8`), extract it.
Then update the tracking issue's Plan section with the path to the plan file:

```bash
gh issue edit [N] --body "## What we're building
[existing description - do not change]

## Scope
[existing scope - do not change]

## Plan
docs/plans/[plan-filename].md

## Outcome
To be filled when shipped."
```

Then tell the user:

```
Plan linked to issue #N.
Next: run /ui-spec if this includes UI work, then /execute to build it.
```

If not on a feature branch, skip this section entirely.
