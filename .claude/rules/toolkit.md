# Toolkit Rules

<!-- This file is managed by the LLM Peer Review toolkit. Do not edit - changes will be overwritten on update. -->

## How We Work Together

### CRITICAL RULES

1. **Never auto-fix** - Report issues first, wait for my approval before editing files
2. **Ask questions** - If something is unclear, ask before assuming
3. **Explain simply** - Use plain English, avoid jargon
4. **Show your work** - Tell me what you're doing and why
5. **Use the Skill tool for slash commands** - Never manually replicate /start-feature, /create-plan, /review, /ship, or /document. Always invoke them via the Skill tool so the template is followed.
6. **No em dashes or en dashes** - Never use em dashes or en dashes in any output (conversation, file writes, file edits). Use regular hyphens or rewrite the sentence.
7. **Teach the why** - When explaining, focus on *why* things work so the user can solve similar problems independently next time.

### Our Workflow

We follow this flow for features:
1. `/start-feature` - Classify the work, create tracking issue and branch, run explore
2. `/create-plan` - Create a step-by-step plan with status tracking
3. `/ui-spec` - (optional) Generate UI design spec with colors, fonts, and rules
4. `/execute` - Build it, updating the plan as we go
5. `/review` - Review work (report only, don't fix)
6. `/ask-gpt` or `/ask-gemini` - Get a second opinion via multi-model debate
7. `/peer-review` - Evaluate debate findings (paste results here)
8. `/document` - Update documentation
9. `/ship` - Close tracking issue, merge branch, tag version, create release

---

## Slash Commands

| Command | Purpose |
|---------|---------|
| `/explore` | Understand the problem, ask clarifying questions before implementation |
| `/start-feature` | Classify work, create GitHub issue and branch, then explore |
| `/create-plan` | Create a step-by-step implementation plan with status tracking |
| `/ui-spec` | Generate a UI design spec (colors, fonts, accessibility rules) for a plan |
| `/execute` | Build the feature, updating the plan as you go |
| `/review` | Review code - report issues only, don't fix |
| `/peer-review` | Evaluate feedback from other AI models |
| `/document` | Update documentation after changes |
| `/ship` | Close tracking issue, merge branch, tag with semver, create GitHub release |
| `/create-issue` | Create GitHub issues (ask questions first, keep short) |
| `/ask-gpt` | AI peer review with ChatGPT debate (3 rounds) |
| `/ask-gemini` | AI peer review with Gemini debate (3 rounds) |
| `/pair-debug` | Focused debugging partner - investigate before fixing |
| `/package-review` | Review a package/codebase |
| `/learning-opportunity` | Pause to learn a concept at 3 levels of depth |

### Command-Specific Rules

**When Running /review:**
- Output a written report using the format in `.claude/commands/review.md`
- Do NOT modify any files
- Wait for me to say "fix it" before making changes

**When Running /create-issue:**
- Ask 2-3 clarifying questions first
- Keep issues short (10-15 lines max)
- No implementation details - that's for /explore and /create-plan

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
