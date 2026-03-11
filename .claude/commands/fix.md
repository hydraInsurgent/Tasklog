# Fix Issue

Apply a targeted fix for a known bug. Leaner than the feature workflow -
no exploration or planning phase. Investigation should already be done
(via `/pair-debug` or prior diagnosis).

Usage:
- `/fix #N` - fix a single issue by number
- `/fix #N #M #P` - fix multiple related issues together in one branch
- `/fix` - infer the issue from context or list open issues to pick

---

## Step 1: Read context (silent)

```bash
git branch --show-current
git tag --sort=-version:refname | head -1
```

**Resolve the issue number(s) using context - in priority order:**

1. **Issue numbers mentioned in the user's message** - if the user typed `/fix #2 #5`,
   use those. If they said "fix the LAN issue #8", use #8. Use what was said.

2. **Issues created or discussed in this conversation** - if `/create-issue` was run
   recently and issue URLs appeared in the chat, or if specific issues were named and
   discussed, use those. No need to call GitHub - the information is already here.

3. **No context available** - only then go to GitHub:
   ```bash
   gh issue list --state open
   ```
   Show the list and ask the user to pick. Do not guess.

Once the issue number(s) are known, proceed.

Determine which scenario applies:

**Scenario A - On a feature branch (branch name contains `#`)**

```bash
# Extract parent feature issue number from branch name
git branch --show-current | grep -oP '#\K[0-9]+'
```

Ask the user:

```
You're on feature branch [branch-name] (tracking issue #M).

Is this fix related to the feature you're building?
- Yes → apply inline on this branch. The fix ships with the feature.
- No  → this fix should not be mixed into the feature. Create an issue and
         come back after the feature ships. Run /create-issue now, defer the fix.
```

Wait for the answer before proceeding.

**Scenario B - On main or a non-feature branch**

Proceed to Step 2. A dedicated fix branch will be created.

---

## Step 2: Confirm the issue(s)

```bash
gh issue view [N]
# for multiple: gh issue view [N] && gh issue view [M] ...
```

Show each issue title and state. Confirm with the user these are the right ones.

If any issue does not exist, stop:
```
Issue #N not found. Run /create-issue first to capture the bug, then run /fix #N.
```

**If multiple issues were provided**, ask before proceeding:
```
Fixing together: #N [title], #M [title]

Are these related enough to fix in one branch? (yes / no)
- Yes → one branch, one commit, one PATCH release closes all
- No  → fix separately - run /fix #N first, then /fix #M
```

---

## Step 3: Create a fix branch (Scenario B only)

Only if on main or a non-feature branch:

**Single issue:**
```bash
git checkout -b fix/[slugified-issue-title]-#[N]
```
Example: issue #8 "app not accessible from phone" → `git checkout -b fix/lan-access-#8`

**Multiple issues being fixed together:**
```bash
git checkout -b fix/[slug-of-first-issue]-#[N]-#[M]
```
Example: issues #5 and #6 → `git checkout -b fix/code-cleanup-#5-#6`

If already on a feature branch (Scenario A, related fix): skip this step entirely.

---

## Step 4: Apply the fix

This is the implementation step. Apply the fix based on the diagnosis from `/pair-debug`
or prior investigation. For each file changed, explain what was changed and why.

Keep the fix minimal. Only change what is necessary to resolve the issue.
Do not refactor surrounding code, add features, or clean up unrelated things.

---

## Step 5: Verify

After the fix is applied, ask the user to verify:

```
Fix applied. Please verify:
1. [Specific thing to check based on the bug - e.g. "open the app on your phone"]
2. [Any edge case worth checking]

Confirmed working? (yes / no / partially)
```

If "no" or "partially" - investigate further before closing. Do not close the issue
until the fix is confirmed.

---

## Step 6: Lightweight doc and architecture check

Ask yourself (silently): did this fix change any of the following?

- A documented API endpoint, component, or data model → update `docs/architecture.md`
- A pattern in the engineering guidelines → update `docs/engineering-guidelines.md`
- How the app behaves from the user's perspective → update `docs/product-design.md`
- The CHANGELOG → always add an entry for standalone fixes (Scenario B)

For most bug fixes: only CHANGELOG needs updating. Architecture and guidelines
rarely change from a fix. If in doubt, check and update, then continue.

---

## Step 7: Close the issue

**Scenario A (inline, feature branch):**

```bash
gh issue close [N] --comment "Fixed inline on [branch-name] as part of feature #M.
Will ship with the feature release.

Root cause: [one sentence]
Fix: [what was changed]"
```

The issue is closed but no new release is created - the fix ships with the next MINOR release.

**Scenario B (standalone, own branch):**

```bash
gh issue close [N] --comment "Fixed in [branch-name].
Root cause: [one sentence]
Fix: [what was changed]"
```

After closing, update `docs/backlog.md`:
- Remove the issue row from **Bug Backlog** (if it was listed there)
- Add to **Closed**: `| #[N] | [title] | bug | [today's date] |`

---

## Step 8: Commit (Scenario B only)

On the fix branch:

```bash
git add [changed files]
git commit -m "Fix: [short description of what was fixed] (#N)"
git checkout main
git merge fix/[branch-name] --no-ff -m "Merge fix/[branch-name]: [description] (#N)"
```

---

## Step 9: Release decision (Scenario B only)

Show the last tag and suggest a PATCH bump:

```
Fix merged to main.

Last tag: [vX.Y.Z]
Suggested PATCH: [vX.Y.Z+1]

Release now as [vX.Y.Z+1], or batch with other pending fixes?
- Release now → I'll tag, push, and create a GitHub release
- Batch → I'll note this fix is pending. Run /fix on other issues, then release all at once.
```

If releasing now:

```bash
git tag [vX.Y.Z+1]
git push origin main
git push origin [vX.Y.Z+1]
gh release create [vX.Y.Z+1] \
  --title "[vX.Y.Z+1] - Bug fixes" \
  --notes "[CHANGELOG patch entry for this fix]"
```

---

## Edge cases

**Fix is more complex than expected:**
If during Step 4 the fix turns out to be larger than a targeted change
(touches multiple layers, requires a migration, introduces new patterns),
stop and say:

```
This fix is more complex than a targeted bug fix.
Consider running /start-feature with type=fix instead,
which includes full exploration and planning.
```

**Multiple bugs being fixed together:**
Only fix one issue per `/fix` run. If two bugs are related and must be fixed
together, close both issues in Step 7 with cross-references.

**Fix on a feature branch that shouldn't ship with the feature:**
If the fix is unrelated and was accidentally made on the feature branch,
note it in the issue and flag for cherry-pick or separate handling after the feature merges.
