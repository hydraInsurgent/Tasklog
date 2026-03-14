# Toolkit Rules

<!-- This file is managed by the LLM Peer Review toolkit. Do not edit - changes will be overwritten on update. -->

## How We Work Together

### CRITICAL RULES

1. **Never auto-fix** - Report issues first, wait for my approval before editing files
2. **Ask questions** - If something is unclear, ask before assuming
3. **Explain simply** - Use plain English, avoid jargon
4. **Show your work** - Tell me what you're doing and why
5. **Use the Skill tool for slash commands** - Never manually replicate /start-feature, /explore, /create-plan, /review, /fix, /ship, /document, or /unit-test. Always invoke them via the Skill tool so the template is followed.
6. **No em dashes or en dashes** - Never use em dashes or en dashes in any output (conversation, file writes, file edits). Use regular hyphens or rewrite the sentence.
7. **Teach the why** - When explaining, focus on *why* things work so the user can solve similar problems independently next time.

### Our Workflow

#### Feature workflow
1. `/start-feature` - Classify the work, create tracking issue and branch
2. `/explore` - Understand the problem and codebase, define scope
3. `/create-plan` - Create a step-by-step implementation plan
4. `/ui-spec` - (optional) Generate UI design spec before building
5. `/execute` - Build it, updating the plan as we go
6. `/unit-test` - Write and run unit tests for what was just built
7. `/review` - Code review (report only, don't fix)
8. `/document` - Update documentation
9. `/ship` - Close tracking issue, merge branch, tag version, create release

#### Bug fix workflow
1. `/create-issue` - Capture the bug
2. `/pair-debug` - (optional) Investigate root cause if not already known
3. `/fix` - Branch-aware fix: apply, verify, close issue, PATCH release

#### Additional commands
Use these when needed - not part of the standard flow:

| Command | When to use |
|---------|-------------|
| `/ask-gpt` | Get a second opinion from ChatGPT (3-round debate) |
| `/ask-gemini` | Get a second opinion from Gemini (3-round debate) |
| `/peer-review` | Evaluate findings from a multi-model debate |
| `/learning-opportunity` | Pause to understand a concept at depth |
| `/package-review` | Review a package or external codebase |


---

## Slash Commands

### Feature workflow

| Command | Purpose |
|---------|---------|
| `/start-feature` | Classify work, create GitHub tracking issue and branch |
| `/explore` | Understand the problem and codebase, define scope |
| `/create-plan` | Create a step-by-step implementation plan with status tracking |
| `/ui-spec` | Generate a UI design spec (colors, fonts, accessibility rules) for a plan |
| `/execute` | Build the feature, updating the plan as you go |
| `/unit-test` | Write and run unit tests for a feature, component, or the whole project |
| `/review` | Review code - report issues only, don't fix |
| `/document` | Update documentation after changes |
| `/ship` | Close tracking issue, merge branch, tag with semver, create GitHub release |

### Bug fix workflow

| Command | Purpose |
|---------|---------|
| `/create-issue` | Capture a bug or idea (ask questions first, keep short) |
| `/pair-debug` | Investigate a bug - confirm root cause before fixing |
| `/fix` | Apply a targeted fix: branch-aware, single or multiple issues, closes and PATCH tags |

### Additional commands

| Command | Purpose |
|---------|---------|
| `/ask-gpt` | AI peer review with ChatGPT debate (3 rounds) |
| `/ask-gemini` | AI peer review with Gemini debate (3 rounds) |
| `/peer-review` | Evaluate feedback from other AI models |
| `/learning-opportunity` | Pause to learn a concept at 3 levels of depth |
| `/package-review` | Review a package or external codebase |

### Command-Specific Rules

**When Running /review:**
- Output a written report using the format in `.claude/commands/review.md`
- Do NOT modify any files
- Wait for me to say "fix it" before making changes

**When Running /create-issue:**
- Ask 2-3 clarifying questions first
- Keep issues short (10-15 lines max)
- No implementation details - that's for /explore and /create-plan

**When Running /fix:**
- Check branch context first - inline if on a feature branch, new branch if on main
- Verify the fix works before closing the issue
- Only change what is necessary - no refactoring alongside fixes

**When Running /unit-test:**
- Check for test infrastructure first - set it up if missing (ask before creating anything)
- Show the list of test targets and wait for confirmation before writing tests
- Do not move past Step 6 if tests are failing - diagnose first

### Subagent Strategy

- **Use subagents for research and exploration** freely - no need to ask
- **One focused task per subagent** - don't bundle unrelated work
- **Don't duplicate work** - if a subagent is researching something, don't also do it yourself
- **Parallelize independent plan steps** - tell the user what each parallel task will do and wait for approval before starting

---

## Git Workflow

### When to Branch
- New features that might break things
- Experimental changes you're not sure about
- When collaborating with others

### When to Work on Main
- Documentation updates
- Small fixes
- Cleanup work

### When to Commit
- After completing a logical unit of work
- Before switching to a different task
- When you want a checkpoint you can return to

### When to Push
- After commits you want to keep (backup)
- When you're done for the day
- Before asking for feedback

### Commit Messages
- Start with a verb: "Add", "Fix", "Update", "Remove", "Refactor"
- Keep the first line under 50 characters
- Describe what changed, not how

**Examples:**
- `Add git workflow guidance to CLAUDE.md`
- `Remove Next.js web app (out of scope for v1)`
- `Fix broken reference in ask-gpt command`

**Simple rule:** For solo learning projects, working on main is fine. Branch when you want to experiment safely.

---

## Permissions

This project uses two settings files. `settings.json` is committed to the repo and provides a shared baseline (temp-file permissions for debate scripts). `settings.local.json` is user-specific and not overwritten on re-setup - your real permissions live here.

These are defined in `.claude/settings.local.json`. Each one exists for a reason:

| Permission | Why it's here |
|---|---|
| `git commit` | `/execute` and `/document` need to commit after work |
| `git push`, `git pull`, `git fetch` | Syncing with remote repositories |
| `git add`, `git rm`, `git branch` | Staging files, removing files, managing branches |
| `git config`, `git remote set-url` | Git setup (e.g. safe.directory, remote URLs) |
| `gh repo create`, `gh repo view`, `gh repo edit` | Repository scaffolding, viewing, and settings |
| `gh issue create`, `gh issue view`, `gh issue close` | `/create-issue` command and issue management |
| `gh api`, `gh release list` | GitHub API calls and release checks |
| `npm install`, `npm uninstall` | Managing dependencies |
| `node scripts/ask-gpt.js` | Running the ask-gpt debate script |
| `node scripts/ask-gemini.js` | Running the ask-gemini debate script |
| `ls`, `diff`, `echo` | Reading directories, comparing files, writing output |
| `cd` | **Not included by default.** If your workflow needs it, add `"Bash(cd:*)"` to your project's `.claude/settings.local.json`. Be aware: this allows directory changes anywhere on your machine, which broadens what subsequent commands can access. |

---

## Remember

- I'm learning - explain what you do
- Report first, fix later
- Ask if unsure
- After non-trivial corrections (changed the plan, fixed a recurring mistake, or corrected a wrong assumption), update `LESSONS.md`
