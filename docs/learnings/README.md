# Learnings

**Last updated:** 2026-05-05

Timeless concepts picked up while building Tasklog. Things that aren't tied to a single feature or platform but are useful to understand whenever they come up.

## How this differs from guides and plans

| Folder | Purpose | Example |
|---|---|---|
| `docs/plans/` | What to do for a specific feature | "P48: Deploy to GCP" |
| `guides/` | How a specific setup was done, end to end | "gcp-server-setup.md" |
| `docs/learnings/` | Concept that applies across projects | "network-bind-addresses.md" |

Inspired by the split in [album-to-movies](https://github.com/...) which separates `research/` (verified API facts), `guides/` (walkthroughs), and inline theory. This folder is the "inline theory" pulled out so it can be referenced from anywhere.

## Conventions

- One concept per file. Keep file names short and topical (`cors-explained.md`, not `learning-about-cors-during-deploy.md`).
- Each file has the same shape:
  1. **The mental model in one paragraph** - what this is, in plain English
  2. **Why it exists / what problem it solves** - the historical or practical motivation
  3. **How it actually works** - the mechanics, often with a small diagram
  4. **Common misconceptions** - what people get wrong
  5. **When it matters in practice** - concrete situations to recognise it
  6. **Further reading** - links to authoritative sources
- Update the `Last updated` date when you add to a file.
- Cross-link liberally. If a guide section explains a concept, link out to the learning instead of duplicating.

## Active learnings

| File | Concept | First encountered in |
|---|---|---|
| [network-bind-addresses.md](network-bind-addresses.md) | What `0.0.0.0` vs `127.0.0.1` vs a specific IP means when a server "listens" | Phone deploy (2026-05) |
| [cors-explained.md](cors-explained.md) | What CORS actually is, why it's a browser-only barrier, what it doesn't protect | Phone deploy (2026-05) |
| [proot-on-android.md](proot-on-android.md) | Termux + proot-distro architecture, performance reality, when to use vs. alternatives | Phone deploy (2026-05) |
| [dns-and-nameservers.md](dns-and-nameservers.md) | Registrar vs nameservers vs DNS provider, "Powered by Cloudflare" trap, propagation, DoH, proxy vs DNS only | MCP server (2026-05) |
| [github-oauth-vs-github-apps.md](github-oauth-vs-github-apps.md) | The two GitHub developer products under Settings > Developer Settings, when to use which | MCP server (2026-05) |

<!--
TODO future learnings, add as encountered:
- reverse-proxy-patterns.md (when we set up Caddy in Stage 5)
- tailscale-overlay-network.md (if we go that route for remote access)
- next-public-env-vars.md (NEXT_PUBLIC_* baked in vs runtime config tradeoff)
- aspnetcore-config-precedence.md (cmdline > env > appsettings.json > defaults)
- dhcp-reservations-vs-static-ip.md (router-side vs device-side static IP)
-->

## How to add a learning

1. Create `docs/learnings/<concept>.md`.
2. Start with `**Last updated:** YYYY-MM-DD - first encountered in <feature/plan>` and a one-paragraph framing.
3. Use the six-part section shape above.
4. Add the file to the table in this README.
5. Cross-link from any guide section that touches the concept.
