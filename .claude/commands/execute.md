# Execute Plan

Now implement precisely as planned, in full.

## Implementation Requirements

- Write elegant, minimal, modular code
- Adhere strictly to existing code patterns, conventions, and best practices
- Include thorough, clear comments/documentation within the code
- As you implement each step:
  - Update the markdown tracking document with emoji status and overall progress percentage dynamically

## Parallel Steps

When the plan has steps tagged `[parallel]`, follow these rules:

### Pre-flight Check
Before spawning parallel agents, list the files each agent will touch. If any files overlap between agents, downgrade those steps to `[sequential]`.

### User Confirmation
Before starting parallel work, tell the user what each task will do:
> "Running two tasks in parallel: Task 1 does [X], Task 2 does [Y]. OK to proceed?"
Wait for approval before continuing.

### Agent Contract
Each parallel agent must:
1. **Declare touched files** - list every file it will create or modify
2. **State assumptions** - what it expects to be true about the codebase
3. **Provide an integration checklist** - what the next step needs to verify

### Integration Checkpoint
After all parallel steps finish, always run a sequential checkpoint:
1. Merge results into the codebase
2. Run tests (if any exist)
3. Resolve inconsistencies between parallel outputs
4. Update the plan status

## UI Spec Awareness

When the plan has a `## UI Specification` section linking to a `UI-SPEC-*.md` file:

1. **Read the UI-SPEC file** at the start of execution
2. **The UI-SPEC is the single source of truth** for design decisions - do not read the reference files in `.claude/ui-reference/`

### For `[UI]`-tagged steps:

**Before writing UI code** (Design System Injection):
- State the active palette ID and key hex codes (primary, bg, text)
- State the active font pairing ID and font names

**After writing UI code** (micro-checklist - report, don't gate):
1. Text/background contrast meets WCAG AA (4.5:1 minimum)
2. Spacing scale declared and applied consistently
3. Interactive elements have visible focus indicators

**If a step looks visual but has no `[UI]` tag:**
- Warn the user: "This step appears to involve UI work but isn't tagged `[UI]` in the plan. Should I apply the UI spec here?"
- Wait for confirmation before proceeding

## When to Stop

If you hit a critical blocker - a wrong assumption in the plan, a fundamental incompatibility, or a dependency that doesn't work as expected - **stop executing**. Don't push through a broken plan. Instead:
1. Explain what went wrong and why
2. Suggest re-running `/create-plan` with what you've learned

This only applies to critical failures, not every small hiccup.

## When to Capture (learnings + guides during execute, not after)

The default is to write `/learnings` and `/guides` at the end of the feature. That's late: by then the context that made the concept fresh has been swapped out, and the writeup is reconstructed instead of recorded.

Capture alongside the work when:

- A logical chunk of user-facing setup completes (e.g. domain configured, third-party OAuth app registered, deployment target provisioned). Suggest `/guides <name>` while the steps you just walked are still in working memory.
- A non-obvious concept comes up that took explaining (CORS, OAuth, a transport quirk, a syscall restriction). Suggest `/learnings <concept>` while the explanation you just gave is still fresh.

Just prompt - don't auto-run. Example: "Step 0 completed setting up the OAuth app + DNS migration. Worth capturing as a guide and two learnings now? Otherwise context will be stale by Step 5."

## Status Updates

After completing each step, update the plan file:
- Change 🟥 to 🟨 when starting a task
- Change 🟨 to 🟩 when completing a task
- Update the overall progress percentage at the top
- **Tick user-action items the same session they're confirmed done.** If a step depends on the user (deploy, click through a UI, verify externally), do not leave the checkbox 🟥 once they report "done" - update the plan immediately. Plans that drift from reality become a `/ship` blocker.
- After all steps are complete, fill in the plan's `## Outcomes` section with what changed, deviations, and key decisions made during execution. Don't defer this to `/ship` time - write it as the work concludes.
