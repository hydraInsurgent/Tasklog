# Ship Feature

Closes a completed feature. Run this after `/document` is done.

This command handles everything: closes the tracking issue, merges the branch,
tags the version, creates the GitHub release, and pushes. You only need to
confirm the version number.

---

## Step 1: Gather context (do this silently, no questions yet)

**Current branch:**
```bash
git branch --show-current
```

**Last git tag:**
```bash
git tag --sort=-version:refname | head -1
```

**Plan file:**
Look in `docs/plans/` for the most recently modified `.md` file.
Read its TLDR and Overall Progress line.

**Tracking issue:**
Branch names created by `/start-feature` include the issue number directly.
Parse it from the branch name:
- `feature/task-completion-#8` → issue #8
- `fix/feedback-timer-#2` → issue #2

```bash
# Extract issue number from branch name
git branch --show-current | grep -oP '#\K[0-9]+'
```

If the branch does not contain an issue number (e.g. was created manually or before
this convention was adopted), fall back to showing the 3 most recently updated open
issues and ask the user which one to close.

---

## Step 2: Verify the plan is complete

Read the plan file found in Step 1.

If any task is 🟥 or 🟨, stop and list the incomplete tasks:

```
Cannot ship. The following plan tasks are not complete:
- [task name]
- [task name]

Finish these first, then run /ship again.
```

If all tasks are 🟩, proceed.

---

## Step 3: Ask one question

Show what was inferred, then ask only for the version.

Read the last tag RIGHT NOW (not when the feature was started - other features
may have shipped in the meantime):

```bash
git tag --sort=-version:refname | head -1
```

Suggest the next version using semantic versioning based on the branch type:
- `fix/` or `refactor/` branch → PATCH bump: `v2.1` → `v2.1.1`
- `feature/` or `improvement/` branch → MINOR bump: `v2.1` → `v2.2`
- If the work breaks existing behaviour or API contracts → MAJOR bump: `v2.x` → `v3.0`
  (flag this explicitly and confirm with user before suggesting - do not assume)

```
Ready to ship.

Plan:    [plan file name] - [TLDR]
Branch:  [current branch]  ([fix/feature/improvement])
Issue:   #N - [title]

Suggested version: [vX.Y.Z]  (current last tag: [last tag])
Confirm or enter a different version:
```

Wait for the version confirmation before doing anything else.

---

## Step 4: Update and close the tracking issue

First do a final edit to fill in the Outcome section that was left as a placeholder
throughout the feature lifecycle:

```bash
gh issue edit [N] --body "## What we're building
[description - carried from explore update]

## Scope
[scope - carried from explore update]

## Plan
[plan file path - carried from create-plan update]

## Outcome
**What was built:**
[concrete list of what was actually implemented - from plan tasks and outcomes section]

**Verified:**
[what was tested and confirmed working]

**Issues raised during this work:**
[any new GitHub issues created during review, e.g. #12 #13 - or 'none']"
```

Then close it:

```bash
gh issue close [N] --comment "Closed by [version] release. See above for full outcome. Release: [URL - add after Step 7]"
```

---

## Step 5: Merge branch to main

If currently on a feature/fix branch:

```bash
git checkout main
git merge [feature-branch] --no-ff -m "Merge [branch-name]: [feature name] ([version])"
```

If already on main (worked directly on main), skip the merge but note it.

---

## Step 6: Tag and push

```bash
git tag [version]
git push origin main
git push origin [version]
```

---

## Step 7: Create the GitHub release

Use the CHANGELOG.md entry for this version as release notes.
If no CHANGELOG entry exists for this version yet, ask the user if they want
to add one before creating the release (recommend yes).

```bash
gh release create [version] \
  --title "[version] - [feature name]" \
  --notes "[CHANGELOG content for this version]"
```

---

## Step 8: Update the tracking issue with the release URL

```bash
gh issue comment [N] --body "Release: [release URL]"
```

---

## Step 8b: Update backlog and archive plan

**Backlog:** Remove the row from the **Active** section and add it to **Closed**:

```
| #[N] | [feature name] | feature | [today's date] |
```

Keep Closed to the last 10 entries - remove the oldest if it exceeds that.

**Archive plan:** Move any plan files associated with this feature from `docs/plans/`
to `docs/plans/_archive/`:

```bash
git mv docs/plans/[plan-file].md docs/plans/_archive/
```

If there are related plan files (e.g. review-fixes plan), move those too.
This keeps `docs/plans/` clean for the next feature.

---

## Step 9: Final output

```
Shipped.

Release:  [URL]
Tag:      [version]
Branch:   [branch-name] → merged to main
Issue:    #N closed

Next: start the next feature with /start-feature, or fix open issues.
```

---

## Edge cases

**If on main and no feature branch:**
Skip Step 5. Note in the output that this was shipped directly from main.

**If the plan file cannot be found:**
Ask the user to point to it before proceeding.

**If the branch has no issue number in its name:**
Branch was created before this convention or created manually.
Show the 3 most recently updated open issues and ask which one to close.
If none match, offer to create a retroactive tracking issue before closing.

**If CHANGELOG has no entry for this version:**
Stop before creating the release and tell the user to run `/document` first,
or offer to write the CHANGELOG entry now before proceeding.
