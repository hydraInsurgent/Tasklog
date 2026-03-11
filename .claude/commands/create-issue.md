# Create Issue

Hey! I'm ready to help you capture this issue. What's on your mind? Just give me:

- **What's the issue/feature** (1-2 sentences)
- **Current vs desired behavior** (if it's a bug)

I'll handle the rest.

---

## CRITICAL RULES

1. **ASK 2-3 QUESTIONS FIRST** - Never create the issue immediately
2. **Keep issues SHORT** - Max 10-15 lines total
3. **NO implementation details** - No code, no file paths, no technical approach
4. **Capture the WHAT, not the HOW**

## Questions to Ask

- Bug, feature, or improvement?
- Priority? (high/medium/low)
- Any context I should know?

## Scope Check (before creating the issue)

Read `docs/backlog.md` silently. Check the **Active** section.

**If there is an active plan:**
Compare the request against that plan's stated scope (read the plan file listed in Active).
If the request is outside the active plan's scope, surface it:

```
Scope note: There is an active plan ([plan file]) in progress.
This request appears to be outside its scope.

Adding it to the backlog keeps the active branch focused.
Your call - I'll create the issue either way, but recommend: backlog.
```

**If there is no active plan:**
No scope check needed. Create the issue and add it to the appropriate backlog section.

**For bugs:** scope check is rarely needed - bugs are always valid to capture.
Only flag a bug if it touches something entirely unrelated to the codebase (which is unusual).

Do not add friction to routine bug reports. The scope check is for features and improvements only.

---

## After Getting Answers

Create the issue using this terminal command (from the project directory):
```bash
gh issue create --title "TITLE HERE" --body "BODY HERE" --label "LABEL"
```

## Issue Body Format (Keep It Short)
```
## TL;DR
[1-2 sentences max]

## Current State
[What happens now - 1-2 sentences]

## Desired State
[What should happen - 1-2 sentences]
```

## Available Labels

- `bug`, `feature`, `improvement`
- `priority-high`, `priority-medium`, `priority-low`
- `setup`

## Backlog Update

After creating the issue, add it to `docs/backlog.md`:
- `bug` label → add to **Bug Backlog** section
- `feature` or `improvement` label → add to **Feature Backlog** section

```
| #[N] | [title] | [priority] | [any notes] |
```

## REMEMBER
- Ask questions first
- Keep it short (10-15 lines max)
- Run the `gh issue create` command to actually create the issue
- No implementation details - that's for /explore

## After Creating the Issue

Once the issue is created, suggest the next step based on the issue type:

**If it's a bug (`bug` label):**
```
Issue #N created.

Next steps:
- Know the fix already? Run /fix to apply it now.
- Need to investigate first? Run /pair-debug to find the root cause.
```

**If it's a feature or improvement:**
```
Issue #N created.

Next steps:
- Ready to build it? Run /start-feature to kick off the full workflow.
- Just capturing for later? Nothing more to do - it's on the backlog.
```
