# Generate or Update Guide

Write or update a learning-oriented guide that explains how a piece of work was done in this project, and why those choices were made.

## Philosophy

A guide is **NOT a recipe**. A recipe lists commands; a guide explains the choices.

A reader of a finished guide should understand:
- not just *what* was typed
- but *why this command and not another*
- and *what would have to change to make a different choice work*

Guides differ from other docs in this project:

| Type | Question it answers | Where it lives |
|---|---|---|
| Plans (`docs/plans/`) | What are we going to do? | Pre-work |
| Architecture (`docs/architecture.md`) | How is the system structured? | With the code |
| **Guides (`guides/`)** | **How was this done, why these choices?** | **This file** |
| Learnings (`docs/learnings/`) | What is this concept, independent of the project? | Cross-link, don't inline |
| Research (`docs/research/`) | What are verified external facts? | When relevant |

If a section ends up explaining a timeless concept (CORS, TLS, REST, what a service mesh is), do **not** inline 100+ lines of theory. Create or link a `docs/learnings/<concept>.md` and reference it. **Guides reference; learnings explain.**

## Structure to use for every guide

1. **Header**: title, `Last updated: YYYY-MM-DD`, one-line summary
2. **How this all fits together**: mental model in plain English + small ASCII diagram if it helps
3. **Prerequisites**: things to do before starting (often manual, hard to automate)
4. **Walkthrough sections**: each section = one logical part. Inside each:
   - Commands to run
   - Why each command (what it does, why this and not an alternative, what could go wrong)
5. **Day-to-day commands**: quick reference after the work is done
6. **Troubleshooting**: real issues encountered, not hypothetical ones
7. **Adding a second X / future expansion**: footer notes

## Types of guides

- **Setup**: one-time installation. `<platform>-server-setup.md`
- **Operations**: ongoing tasks. `<platform>-deploying-updates.md`
- **Walkthrough**: integrating something new. `<topic>-walkthrough.md`
- **Migration**: converting from one thing to another. `<from>-to-<to>-migration.md`

If a guide naturally splits into "set up once" + "do over and over", make it two files.

## When to write (timing matters)

- **Alongside the work**: scaffold with section headers and `<!-- TODO Stage X: ... -->` comments as you start. Fill what's known. Leave specific hints for what gets filled later. **Strongest pattern - you don't lose context.**
- **After milestones**: clean up TODOs, capture real timings, add troubleshooting from issues actually encountered.
- **Never**: don't write guides for work that hasn't been verified working at least once.

## Your task

The user invoked `/guides <name>`. The argument is the file basename (without `.md`).

1. **Identify what was done**: read the relevant plan in `docs/plans/` and recent commits since the plan was created. If the user gave you a plan number/name, use that as the anchor.
2. **Decide structure**:
   - One guide or two (setup + operations)?
   - Are there timeless concepts that should be extracted into `docs/learnings/`? (Recommend `/learnings <concept>` to the user; do not write learnings yourself - that's a separate command.)
3. **Apply the structure above**:
   - Fill what's verified working
   - Scaffold what isn't with `<!-- TODO Stage X: <specific instruction> -->` markers
   - Each TODO names the stage that fills it AND what specifically goes there (so a future session doesn't have to re-derive)
4. **Cross-link** to existing learnings in `docs/learnings/` for any concept that's project-agnostic. Use relative paths (`../docs/learnings/<file>.md`).
5. **Update the guides README index** if one exists, adding the new file to the table.
6. Set `Last updated: <today>` at the top.

If the guide already exists, **update** it rather than recreating. Preserve TODO markers that haven't been filled yet, unless the work that fills them just happened.

Be honest about what isn't done yet. The TODOs are a contract for the next session.

## What good looks like

- Reader can do the same setup in another project after reading the guide
- Reader understands why each choice was made
- Reader can recognise when their situation differs from the guide's assumptions
- A new person joining the project finds guides following a consistent shape

## What bad looks like

- Bare command list with no explanation
- "Why" sections that just repeat what the command says (`# This installs the package`)
- Inline 100-line theory blocks that belong in `docs/learnings/`
- Guides for abandoned prototypes
- Guides full of "TODO" with no commitment to what fills each one
- Em dashes or en dashes (use regular hyphens or rewrite the sentence)

## Style

- Plain English, short sentences
- Use tables for comparisons and reference material
- ASCII diagrams over external image links
- Concrete examples beat abstract descriptions
- One blank line between sections, no decorative dividers

---

## Output format at end of `/guides`

End every `/guides` run with a short summary the user can act on:

```
## Wrote / updated
- guides/<name>.md - <one-line summary of what was written or filled in>

## Recommended follow-ups
- /learnings <concept> - <reason: e.g. "theory was inlining, would be cleaner as a learning">
- (or "No follow-ups warranted.")
```

Only recommend `/learnings` (do not recommend `/document` or other guides - that's `/document`'s job). Recommend a learning when:
- A section ended up explaining a timeless concept that bloated the guide
- A guide section is referencing an undocumented concept that future readers will need
- Skip the recommendation if the guide stayed cleanly project-specific

If existing learnings should be cross-linked from this guide and aren't yet, do the cross-linking inside the guide itself - don't recommend it as a follow-up.
