# Update Documentation Task

You are updating documentation after code changes.

## Primary Documentation Files

- **CLAUDE.md** - Project-specific instructions: tech stack, preferences, team info (user-owned)
- **README.md** - Project overview for humans
- **LESSONS.md** - Learning log: what worked, what didn't, mistakes to avoid (user-owned)
- **CHANGELOG.md** - User-facing changes: new features, breaking changes (update if it exists)
- **`.claude/rules/toolkit.md`** - Toolkit workflow rules (toolkit-owned, **do not edit** - overwritten on update)

Keep README.md and CLAUDE.md consistent with each other. Never edit `toolkit.md`.

## 1. Identify Changes
- Check git diff or recent commits for modified files
- Identify which features/modules were changed
- Note any new files, deleted files, or renamed files

## 2. Verify Current Implementation
**CRITICAL**: DO NOT trust existing documentation. Read the actual code.

For each changed file:
- Read the current implementation
- Understand actual behavior (not documented behavior)
- Note any discrepancies with existing docs

## 3. Update Relevant Documentation

**What goes where:**
- **README.md** - New features, changed behavior, setup instructions, new commands
- **CLAUDE.md** - Project description, tech stack, team info, coding preferences
- **CHANGELOG.md** - User-facing changes: new features, breaking changes, fixes (if the file exists)
- **LESSONS.md** - Prompt the user: "Did you learn anything this session worth logging?"

### Trigger-based doc updates

After identifying what changed, check each trigger below and update the relevant doc if it applies.

**`docs/architecture.md` - update if any of these are true:**
- A new API endpoint was added or removed
- A new component was added or an existing one's responsibility changed
- The database schema changed (new column, new table, renamed field)
- A new folder or layer was introduced in `backend/` or `frontend/src/`
- How Server Components and Client Components are split changed

**`docs/engineering-guidelines.md` - update if any of these are true:**
- A pattern was introduced that wasn't in the codebase before (e.g. first service layer, first use of a new library)
- A known deviation in the deviations table was resolved - remove it from the table
- A guideline was intentionally broken and a new one replaces it - update the relevant section

**`docs/product-design.md` - update if any of these are true:**
- The feature adds a new capability that changes what the product does
- The current scope section no longer accurately describes the product
- A feature rule changed (e.g. deadlines now do something they didn't before)
- The user profile changed (e.g. the app now supports more than one user)

If none of these triggers apply, these three docs do not need updating.

## 4. Documentation Style Rules

✅ **Concise** - Sacrifice grammar for brevity
✅ **Practical** - Examples over theory
✅ **Accurate** - Code verified, not assumed
✅ **Current** - Matches actual implementation
✅ **Right file** - Put info where it belongs (see Section 3)

❌ No enterprise fluff
❌ No outdated information
❌ No assumptions without verification
❌ Don't edit `toolkit.md` - it's auto-managed

## 5. Ask if Uncertain

If you're unsure about intent behind a change or user-facing impact, **ask the user** - don't guess.

---

## 6. Identify Follow-up Documentation (scope analyzer)

`/document` is the entry point that decides what other documentation work is needed. After syncing the files in Section 3, analyze the work and **recommend** (do not run) follow-up commands.

**Recommend `/guides <name>` when any of these are true:**
- New deployment surface, environment, or runtime target was added (e.g. new VM, new device, new platform)
- A multi-step setup process was completed for the first time
- An existing setup walkthrough was made stale by the changes (e.g. structure changed, new prerequisites)
- A migration from one approach to another was completed

**Recommend `/learnings <concept>` when any of these are true:**
- A non-obvious concept came up during the work that took explaining (CORS, networking, threading, auth flows, build systems, etc.)
- A reusable mental model was developed that would apply to other projects
- The concept already lives inline in a doc/comment and would be more useful as a standalone learning

For each recommendation, output:
- Command and arguments (e.g. ``/guides phone-server-setup``)
- One sentence on why this guide/learning is warranted
- Whether it's a new file or updates an existing one

Do **not** invoke the recommended commands yourself. The user reviews and runs them.

If no guides or learnings are warranted, say so explicitly. Not every change produces a guide.

---

## 7. GitHub Integration

After documentation is updated, check if on a feature branch:

```bash
git branch --show-current
```

If the branch contains an issue number (e.g. `feature/task-completion-#8`), extract it.
Add a comment to the tracking issue noting what was documented:

```bash
gh issue comment [N] --body "Documentation updated:
- [file name] - [one line on what changed]
- [file name] - [one line on what changed]

Ready for /ship."
```

This is the last update to the tracking issue before it gets closed by `/ship`.

If not on a feature branch, skip this section entirely.

---

## Output format at end of `/document`

End every `/document` run with a clear summary the user can act on:

```
## Documented this session
- README.md - <one-line summary of what changed>
- docs/architecture.md - <one-line summary>
- (etc.)

## Recommended follow-ups
- /guides phone-server-setup - new deployment target added, walkthrough warranted
- /learnings cors-explained - CORS concept came up during deploy, worth capturing
- (or "No guides or learnings warranted for this work.")
```

The recommendations are the contract: the user decides which to run.
