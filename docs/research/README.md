# Research

**Last updated:** 2026-05-18

Verified external facts that inform decisions in this codebase. These files exist so we cite the canonical source instead of paraphrasing from memory three weeks later.

## How this differs from other docs

| Folder | Purpose | Updated by |
|---|---|---|
| `docs/architecture.md` | How OUR system is structured | `/document` |
| `docs/learnings/` | Timeless concepts that apply across projects | `/learnings` |
| `guides/` | How a specific setup was done in THIS project | `/guides` |
| `docs/plans/` | What we're going to do for a specific feature | `/create-plan` |
| **`docs/research/`** | **Verified external facts (API docs, specs, protocols)** | **manual, populated during `/explore`** |

A learning explains a concept independent of project. A research file quotes the source of truth so we know what the protocol or API actually requires. Cross-link from learnings and guides instead of duplicating.

## Conventions

- **One topic per file.** File names short and topical (`mcp-spec-2025-06-18.md`, not `notes-on-mcp.md`).
- **Date-stamp where relevant.** If the source is versioned (a spec with a release date), include the version in the filename so a future read knows what version we read against.
- **Quote, do not paraphrase.** Each file should contain verbatim normative text (MUST, SHOULD, MAY) from the canonical source, with URL and retrieval date. Paraphrasing decays; quotes do not.
- **Open questions section.** If our research did not cover something we will need later, list it explicitly so a future session knows what is missing.
- **Update or rewrite.** If a source publishes a newer spec version, either update this file in place (and rename if the filename encodes the version) or write a new file. Do not let stale facts accumulate silently.

## Active research

| File | Topic | Source |
|---|---|---|
| [mcp-spec-2025-06-18.md](mcp-spec-2025-06-18.md) | Model Context Protocol spec: transport, authorization, tools | modelcontextprotocol.io |
| [claude-ai-connector-oauth.md](claude-ai-connector-oauth.md) | claude.ai custom connector OAuth requirements | claude.com docs |
| [cloudflare-tunnel.md](cloudflare-tunnel.md) | Cloudflare Tunnel basics for exposing a local service | developers.cloudflare.com |

## How to add a research file

1. Identify the canonical source. Authority order: official spec > vendor docs > vendor blog post > everything else.
2. Fetch the relevant page(s). Quote what matters; don't archive everything.
3. Write `docs/research/<topic>.md` with the structure: source(s), version/retrieval date, key facts (quote-heavy), open questions.
4. Add a row to the table above.
5. Cross-link from any plan or guide that depends on these facts.
