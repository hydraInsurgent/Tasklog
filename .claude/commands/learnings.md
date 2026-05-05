# Capture a Learning

Capture a timeless concept that came up during this work into `docs/learnings/<concept>.md`.

## What this is for

A **learning** is project-independent theory. Things like:
- "What CORS actually is and what it doesn't protect against"
- "Why `0.0.0.0` and `localhost` aren't the same thing"
- "How proot translates syscalls without root"

Learnings are **not** specific to Tasklog or any other project. They could be referenced from any future codebase.

## How this differs from other commands

| Command | Output | Lives where |
|---|---|---|
| `/learning-opportunity` | In-conversation explanation at 3 levels of depth | Conversation only |
| `/guides` | Project-specific walkthrough | `guides/` |
| **`/learnings`** | **Timeless concept extracted as a file** | **`docs/learnings/`** |

`/learning-opportunity` and `/learnings` are complementary: use `/learning-opportunity` to understand a concept, then `/learnings` to save the resulting explanation as a permanent file.

## Structure for every learning

1. **Header**: title, `Last updated: YYYY-MM-DD - first encountered in <feature/plan>`, one-paragraph framing
2. **Mental model**: what this is, in plain English (one paragraph)
3. **Why it exists / what problem it solves**: the historical or practical motivation
4. **How it actually works**: the mechanics, often with a small ASCII diagram
5. **Common misconceptions**: what people get wrong (3 to 5 bullets)
6. **When it matters in practice**: concrete situations to recognise it (specific examples, not generic warnings)
7. **Configuration in common stacks** (optional): how this concept appears in the languages/frameworks the project uses
8. **Further reading**: links to authoritative sources (specs, official docs, primary references)

## Your task

The user invoked `/learnings <concept>`. The argument is the file basename (without `.md`), kebab-case.

1. **Identify the concept**: from the recent conversation, the relevant feature/plan, or the user's argument. If unclear, ask before writing.
2. **Check for existing file**: if `docs/learnings/<concept>.md` already exists, **update** it (add new sections, update misconceptions list, refresh further reading). Do not duplicate.
3. **Write the file** using the structure above.
4. **Update the index**: add the new file to the table in `docs/learnings/README.md`. Set `First encountered in` to the current feature/plan name + month, e.g. "Phone deploy (2026-05)".
5. **Cross-link from the guide(s)** that prompted the learning, if applicable. The link form is `[learnings/<concept>.md](../docs/learnings/<concept>.md)` from inside `guides/`.
6. Set `Last updated: <today>` at the top.

## What good looks like

- A reader who has never worked on this project gains useful theory from reading the file alone
- The "why it exists" section explains the historical or practical reason, not just the mechanism
- The "common misconceptions" section corrects errors people actually make, not strawmen
- The "when it matters" section gives concrete situations a reader could recognise

## What bad looks like

- Concept that's actually project-specific (it belongs in a guide instead)
- Theory copy-pasted from documentation without distillation
- "Misconceptions" that are obvious or trivial
- "Further reading" that's not authoritative (random blog posts, Stack Overflow)
- Em dashes or en dashes (use regular hyphens or rewrite the sentence)

## Style

- One paragraph per section in most cases (don't pad)
- Tables for comparison material
- Plain English, no jargon without immediate definition
- ASCII diagrams over external images
- Concrete examples over abstract descriptions

---

## Output format at end of `/learnings`

End every `/learnings` run with a short summary the user can act on:

```
## Wrote / updated
- docs/learnings/<concept>.md - <one-line summary>
- docs/learnings/README.md - added to index

## Recommended follow-ups
- Update guides/<name>.md - cross-link to this learning (currently inlines theory or is missing the reference)
- /guides <name> - <reason: project-specific walkthrough emerged while capturing the concept>
- (or "No follow-ups warranted.")
```

Two kinds of follow-ups, both narrow:

1. **"Update guide X to cross-link"** when an existing guide touches this concept and should reference the new learning instead of inlining or omitting it. Name the specific guide file.
2. **`/guides <name>`** when capturing the concept revealed that a project-specific walkthrough is needed (rare but valid - happens when the theory and the concrete how-to of using it in this project both deserve documentation).

Do not recommend other `/learnings` or `/document` - that creates noise and overlaps with `/document`'s scope-analysis job.
