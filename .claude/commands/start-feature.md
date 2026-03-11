# Start Feature

Opens a new feature session. Creates the GitHub tracking issue and git branch,
then hands off to `/explore`.

By the end of this command you have:
- A GitHub tracking issue (draft - will be enriched after explore)
- A git branch ready to work on
- A clear prompt to run `/explore` next

The tracking issue evolves through stages:
- **After `/start-feature`:** draft with initial description
- **After `/explore`:** updated with scope, key decisions, findings
- **After `/create-plan`:** updated with link to the plan file
- **After `/ship`:** closed with what was built and outcome

---

## Step 1: Check for an existing issue

Ask first:

```
Is there an existing GitHub issue for this work?
- Yes → provide the issue number and I'll use it as the tracking issue
- No  → I'll create a new one
```

**If an existing issue is provided:**

```bash
gh issue view [N]
```

Show the issue title and body. Confirm this is the right one. If confirmed:
- Use this as the tracking issue - skip Step 4 (do not create a new issue)
- The branch will be named using this issue number
- Continue from Step 2

**If no existing issue:** proceed normally - a new one will be created in Step 4.

---

## Step 2: Ask two questions only

Ask the user exactly these two things - nothing else:

1. **What are we building?** - 2-3 sentences describing the feature or improvement.
   (If linking to an existing issue, this can be inferred from the issue body - confirm rather than ask.)
2. **What type is this?**
   - `feature` - new capability that doesn't exist yet
   - `fix` - something broken that needs correcting
   - `improvement` - something that exists but needs to be made better
   - `refactor` - internal code change with no user-visible behaviour change

Do NOT ask about: version, branch name, issue title, milestone, labels.
Infer all of those automatically in the next step.

---

## Step 2: Infer what is knowable now (do this silently before creating anything)

Two things can be determined from the user's answers before anything is created:

**Issue title:**
- `Feature: [name]` for features
- `Fix: [name]` for bugs
- `Improvement: [name]` for improvements
- `Refactor: [name]` for refactors

**Branch slug** (partial - the issue number is not yet known):
- `feature/` prefix for feature and improvement types
- `fix/` prefix for fix and refactor types
- Slugify the feature name: lowercase, hyphens, no special characters
- Example: "Task Completion" → slug is `feature/task-completion` (issue number appended in Step 5)

**Version:** Do NOT determine or suggest a version at this stage.
Version is determined at `/ship` time, not start time. Multiple features can be
in planning simultaneously and any of them can ship first - the version depends
on what has already been tagged at the moment of release, not when work began.

---

## Step 3: Pre-flight checks

Before creating anything, verify:

```bash
git status
```
If the working tree is not clean (uncommitted changes), stop and tell the user
to commit or stash before starting.

```bash
git branch -a | grep [branch-slug]
```
If a branch with the same slug already exists, show it and ask if they want
to resume it or use a different name.

```bash
gh issue list --search "[feature name]" --state open
```
If a similar open issue already exists, show it and ask if this is a duplicate
or a separate thing.

---

## Step 4: Create the tracking issue

Create a draft GitHub issue. It will be enriched with scope details after `/explore`.

```bash
gh issue create \
  --title "[Issue title]" \
  --body "## What we're building
[User's description from Step 1]

## Scope
To be defined after /explore.

## Plan
To be linked after /create-plan.

## Outcome
To be filled when shipped."
```

Note the issue number. The branch name is built from it next.

---

## Step 5: Create the branch

Branch name is now fully known: `[type]/[slugified-name]-#[issue-number]`

```bash
git checkout -b [type]/[slugified-name]-#[issue-number]
```

Example: feature "Task Completion", issue #8 → `git checkout -b feature/task-completion-#8`

---

## Step 5b: Update backlog.md

Add a row to the **Active** section of `docs/backlog.md`:

```
| P[N]-[slug].md (pending) | #[N] | [branch-name] | Planning |
```

The plan filename is marked `(pending)` because the plan doesn't exist until `/create-plan` runs.
After `/create-plan` runs, that step will update this row with the real filename.

---

## Step 6: Hand off to the user

Output a summary and stop. Do NOT run `/explore` automatically.

```
Ready.

Issue:  #N - [title]
        [URL]
Branch: [branch-name]

Next: run /explore to define the scope in detail.
At the end of explore, say "update the issue" and I'll update #N with the findings.
```

Stop here. Wait for the user to run `/explore`.

---

## Step 7: After /explore - update the tracking issue

This step runs when the user says "update the issue" at the end of `/explore`.

Update the tracking issue body with what was discovered:

```bash
gh issue edit [N] --body "## What we're building
[Refined description - updated from explore if scope changed]

## Scope
**In scope:**
[What was confirmed in scope during explore]

**Out of scope:**
[What was explicitly ruled out]

**Key decisions:**
[Any important choices made during exploration]

## Plan
To be linked after /create-plan.

## Outcome
To be filled when shipped."
```

Then tell the user:

```
Issue #N updated with exploration findings.

Next: run /create-plan to write the implementation plan.
When the plan is created, tell me and I'll link it to the issue.
```

---

## Step 8: After /create-plan - link the plan file

When the user confirms the plan is written, add the plan file reference to the issue:

```bash
gh issue edit [N] --body "## What we're building
[description]

## Scope
[scope from Step 7]

## Plan
[path to plan file in docs/plans/]

## Outcome
To be filled when shipped."
```

Then tell the user:

```
Issue #N updated with plan link.

Next: run /execute to build it.
```
