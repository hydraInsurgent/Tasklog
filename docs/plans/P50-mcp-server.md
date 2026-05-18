# Feature Implementation Plan: MCP Server

**Overall Progress:** `65%`

**Tracking issue:** [#50](https://github.com/hydraInsurgent/Tasklog/issues/50)
**Branch:** `feature/mcp-server-#50`
**Research:** [docs/research/mcp-spec-2025-06-18.md](../research/mcp-spec-2025-06-18.md), [docs/research/claude-ai-connector-oauth.md](../research/claude-ai-connector-oauth.md), [docs/research/cloudflare-tunnel.md](../research/cloudflare-tunnel.md)
**Workflow notes:** [docs/workflow-notes.md](../workflow-notes.md) (Experiment A)

## TLDR

A new Node/TS service (`mcp/`) on the phone exposes the existing Tasklog API as MCP tools. The service includes a built-in OAuth 2.1 authorization server (Dynamic Client Registration, PKCE S256) that authenticates the user via GitHub upstream OAuth. A Cloudflare Tunnel exposes only this service publicly at `mcp.tasklog.manudubey.in`. End goal: text Claude from anywhere to manage Tasklog tasks. No changes to `Tasklog.Api`, frontend, or DB schema.

## Goal State

**Current State:**
- Tasklog runs as two services on the phone (`tasklog-api`, `tasklog-web`), both LAN-only.
- No public surface; no auth anywhere.
- claude.ai cannot reach Tasklog.

**Goal State:**
- Three services on the phone (`tasklog-api`, `tasklog-web`, `tasklog-mcp`) + a fourth process for Cloudflare Tunnel.
- `tasklog-api` and `tasklog-web` remain LAN-only with no auth (unchanged).
- `tasklog-mcp` is the only public surface, exposed at `https://mcp.tasklog.manudubey.in/mcp` via Cloudflare Tunnel.
- OAuth 2.1 with GitHub upstream gates access; only the allow-listed GitHub user can connect.
- claude.ai web and mobile have Tasklog as a Custom Connector; the user can text Claude to manage tasks.
- Three new study learnings, one new guide, two doc updates (architecture + product-design).

## Critical Decisions

These are the key architectural and implementation choices made during exploration. Each cites the research file that informed it.

1. **Hosting shape: phone + Cloudflare Tunnel.**
   Options considered: (A) phone + Cloudflare Tunnel, (B) MCP on GCP and make GCP the canonical Tasklog instance, (C) GCP-hosted MCP + Tailscale/Wireguard VPN to phone.
   Choice: A.
   Rationale: keeps real data on the phone (matches the product's local-first principle), no change to data location, no VPN to maintain, free public HTTPS via Cloudflare. See [docs/research/cloudflare-tunnel.md](../research/cloudflare-tunnel.md).

2. **Auth: OAuth 2.1 with DCR, PKCE S256, and the full discovery stack.**
   Options considered: (A) static bearer token in a header, (B) OAuth 2.1.
   Choice: B.
   Rationale: claude.ai web and mobile custom connectors only accept OAuth. Static bearer is supported in Claude Code CLI and Claude Desktop but not in the web/mobile connector UI we are targeting. See [docs/research/claude-ai-connector-oauth.md](../research/claude-ai-connector-oauth.md) section "Auth schemes claude.ai supports".

3. **Upstream identity provider: GitHub OAuth.**
   Options considered: (A) GitHub upstream, (B) hardcoded password env var, (C) Google upstream, (D) magic-link email.
   Choice: A.
   Rationale: zero password handling on our side, reuses an existing account, teaches the upstream-IdP pattern. Allow-list of one GitHub username via env var enforces single-user access. Locked during explore.

4. **Language and runtime: TypeScript / Node, `@modelcontextprotocol/sdk`.**
   Options considered: (A) C# / .NET (matches existing backend), (B) TypeScript / Node, (C) Python.
   Choice: B.
   Rationale: most mature MCP SDK is in Node. Service stays decoupled from the .NET API via HTTP, so a third language in the repo is contained to one directory. See [docs/research/mcp-spec-2025-06-18.md](../research/mcp-spec-2025-06-18.md).

5. **Service location in repo: top-level `mcp/`.**
   Options considered: (A) top-level `mcp/`, (B) `backend/Tasklog.Mcp/`, (C) inside `backend/`.
   Choice: A.
   Rationale: top-level `mcp/` signals "different language, different service". `backend/Tasklog.Api/` implies .NET; placing a Node service there is misleading.

6. **OAuth library: evaluate `mcp-auth` first, fall back to hand-roll.**
   Options considered: (A) `mcp-auth` Node library, (B) Cloudflare's `workers-oauth-provider` (Workers-only runtime, not applicable to bare Node), (C) hand-roll the minimum the spec requires.
   Choice: A with B excluded and C as fallback.
   Rationale: `mcp-auth` is the Node-native option built for MCP servers; if it covers DCR, PKCE S256, RFC 9728 PRM, RFC 8414 ASM with reasonable customization, use it. Otherwise hand-roll. Final pick made in Step 3.1.

7. **Tool naming convention: snake_case.**
   Choice: `create_task`, `list_projects`, etc.
   Rationale: MCP spec examples use snake_case (`get_weather`). Tool names appear in claude.ai's permission prompt, so they read like English commands.

8. **Tool granularity: split semantically distinct intents even when they share a REST endpoint.**
   Choice: `complete_task` and `uncomplete_task` are separate MCP tools, even though both hit `PATCH /api/tasks/{id}/complete` with different body flags.
   Rationale: LLM tool selection works off the tool description; two distinct user intents deserve two distinct tool entries.

9. **OAuth state storage: separate SQLite file under `mcp/data/`.**
   Choice: `mcp/data/auth.db` for OAuth clients, codes, access tokens, refresh tokens.
   Rationale: keeps operational state separate from Tasklog task data. Easier to wipe auth (e.g. to force re-consent) without touching tasks.

10. **claude.ai connector setup: leave Client ID / Client Secret fields blank.**
    Choice: rely on DCR.
    Rationale: claude.ai supports DCR out of the box; eliminates manual client registration. Locked during explore. See [docs/research/claude-ai-connector-oauth.md](../research/claude-ai-connector-oauth.md) section "DCR support".

11. **Domain DNS: migrate `manudubey.in` from Porkbun to Cloudflare (one-time user action).**
    Current state: `manudubey.in` uses Porkbun's nameservers (verified via DNS-over-HTTPS lookup).
    Choice: change nameservers at Porkbun to Cloudflare's; Cloudflare imports the existing `tasklog.manudubey.in` GCP record automatically.
    Rationale: Cloudflare Tunnel with a custom hostname requires the apex domain to be on Cloudflare DNS. One-time setup, free.

12. **Pattern flag: first Node.js service in the repo.**
    Engineering guidelines describe .NET backend and Next.js frontend patterns only. This feature introduces a third stack. `docs/engineering-guidelines.md` will be updated during `/document` to add a brief MCP service section. No existing deviation is resolved.

13. **Product fit flag: first public surface.**
    `docs/product-design.md` currently states "Local network only, no cloud hosting, no public access". This feature adds a public MCP endpoint while keeping the API and frontend LAN-only. `docs/product-design.md` will be updated during `/document` to reflect the new public surface and the single-user allow-list that gates it.

## UI Specification

No full UI spec needed. The only UI element is a single `/authorize` HTML page with a "Log in with GitHub" button. Plain Tailwind styling matching the existing app's design tokens is sufficient. If we later want a polished consent screen, file a follow-up.

## Tasks

- [x] 🟩 **Step 0: Domain migration and GitHub OAuth App registration** `[parallel]` → delivers: Cloudflare-managed DNS for manudubey.in, GitHub OAuth App credentials ready for env vars
  - [x] 🟩 0.1 User: signed up at cloudflare.com (free plan), Added manudubey.in as a site
  - [x] 🟩 0.2 User: verified Cloudflare imported existing DNS records; manually added 3 missing A records (`tasklog`, `tasklog.home`, `tasklog-business`) as DNS only; switched `*` wildcard CNAME from Proxied to DNS only
  - [x] 🟩 0.3 User: logged into Porkbun, replaced 4 Porkbun nameservers with 2 Cloudflare ones (`rudy.ns.cloudflare.com`, `marlowe.ns.cloudflare.com`)
  - [x] 🟩 0.4 Verified NS propagation via DoH lookup; verified all 5 subdomains still resolve and serve content correctly post-migration
  - [x] 🟩 0.5 User: registered GitHub OAuth App `Tasklog MCP` at github.com/settings/developers with callback URL `https://mcp.tasklog.manudubey.in/auth/github/callback`. Initial attempt mistakenly opened "GitHub Apps" form (different product); aborted and re-did under "OAuth Apps".
  - [x] 🟩 0.6 User: installed KeePassXC, saved Client ID + Client Secret entry titled "Tasklog MCP - GitHub OAuth App"
  - [x] 🟩 0.7 Capture Step 0 learnings and guides (periodic-capture pattern, user-requested rhythm; logged in [docs/workflow-notes.md](../workflow-notes.md))
    - [x] 🟩 0.7.1 Write [docs/learnings/dns-and-nameservers.md](../learnings/dns-and-nameservers.md)
    - [x] 🟩 0.7.2 Write [docs/learnings/github-oauth-vs-github-apps.md](../learnings/github-oauth-vs-github-apps.md)
    - [x] 🟩 0.7.3 Write [guides/cloudflare-tunnel-dns-setup.md](../../guides/cloudflare-tunnel-dns-setup.md)
    - [x] 🟩 0.7.4 Write [guides/github-oauth-app-setup.md](../../guides/github-oauth-app-setup.md)
    - [x] 🟩 0.7.5 Update [docs/learnings/README.md](../learnings/README.md) index
    - [x] 🟩 0.7.6 Add deviation entry to [docs/workflow-notes.md](../workflow-notes.md) capturing the periodic-capture pattern

- [x] 🟩 **Step 1: Scaffold the `mcp/` service** `[parallel]` → delivered: `mcp/` directory with build, type-check, hello-world server on port 5180
  - [x] 🟩 1.1 Created `mcp/` with `package.json`, `tsconfig.json`, `.gitignore`
  - [x] 🟩 1.2 Installed runtime deps: `@modelcontextprotocol/sdk@1.29`, `better-sqlite3@12`, `zod@4`, `hono@4`, `@hono/node-server@2`. **Chose Hono over Express** (modern TypeScript-native, smaller deps, same capability).
  - [x] 🟩 1.3 Installed dev deps: `typescript@6`, `tsx@4`, `@types/node`, `@types/better-sqlite3`. **Skipped ESLint and Prettier** (no project-wide lint convention; add later if friction emerges).
  - [x] 🟩 1.4 Scripts: `dev` (tsx), `build` (tsc), `start` (node dist), `typecheck` (tsc --noEmit)
  - [x] 🟩 1.5 Hello-world `src/server.ts` listens on PORT env var (default 5180), returns service-identification JSON on `/`
  - [x] 🟩 1.6 Verified locally: server starts, GET / returns 200, typecheck passes

- [ ] 🟨 **Step 2: Tool layer wrapping the Tasklog API** `[sequential]` → depends on: Step 1 (Step 2.9 pending live API verification)
  - [x] 🟩 2.1 `src/api-client.ts`: typed HTTP client for the Tasklog API. Base URL from `TASKLOG_API_URL` (default `http://localhost:5115`). One function per endpoint per [docs/architecture.md](../architecture.md). Throws `ApiError` on non-2xx so handlers can render as `isError` tool results.
  - [x] 🟩 2.2 Zod schemas: **inlined per tool family** in `src/tools/{tasks,projects,labels}.ts` instead of a separate `schemas.ts` file. With 16 tools spread across 3 small files, factoring out schemas adds indirection without benefit.
  - [x] 🟩 2.3 `src/tools/tasks.ts`: 8 task tools - `list_tasks`, `get_task`, `create_task`, `delete_task`, `complete_task`, `uncomplete_task`, `assign_task_to_project`, `set_task_labels`
  - [x] 🟩 2.4 `src/tools/projects.ts`: 4 project tools - `list_projects`, `create_project`, `rename_project`, `delete_project`
  - [x] 🟩 2.5 `src/tools/labels.ts`: 4 label tools - `list_labels`, `create_label`, `update_label`, `delete_label`
  - [x] 🟩 2.6 `src/tools/registry.ts`: aggregates the three register-functions and registers all on a given `McpServer` instance
  - [x] 🟩 2.7 Wired `tools/list` and `tools/call` via `McpServer.registerTool` + `WebStandardStreamableHTTPServerTransport`. **Used stateful mode** with `randomUUID()` session id generator instead of the planned stateless mode (the SDK requires per-request transport construction in stateless mode, which is awkward with the high-level `McpServer` API).
  - [x] 🟩 2.8 Error mapping verified: `tools/call list_tasks` with `tasklog-api` not running returned `isError: true` with `"list_tasks failed unexpectedly: fetch failed"` text content (instead of a JSON-RPC protocol error). Helper `runTool()` in `src/tools/result.ts` centralizes the pattern.
  - [ ] 🟨 2.9 Local sanity check with live `tasklog-api`: pending. The error-path test above proves wiring is correct; success-path verification deferred until either (a) user starts `tasklog-api` locally on the laptop, or (b) we hit it on the phone post-deploy. Either gates only this checkbox; subsequent Steps 3-5 do not depend on it.
  - [x] 🟩 2.10 Wrote [docs/learnings/mcp-protocol.md](../learnings/mcp-protocol.md): host/client/server roles, JSON-RPC framing, transports, stateful vs stateless, tool definition shape, error mechanisms. Cross-linked to [docs/research/mcp-spec-2025-06-18.md](../research/mcp-spec-2025-06-18.md). [docs/learnings/README.md](../learnings/README.md) index updated.

- [ ] 🟨 **Step 3: OAuth 2.1 authorization server (in-process)** `[sequential]` → depends on: Step 1. Foundation + metadata + DCR done; user-facing flow + token endpoint + middleware + tests still ahead.
  - [x] 🟩 3.1 **Hand-roll over `mcp-auth` library.** Reason: the OAuth flow is one of the things the user wants to study, and hand-rolling makes every spec requirement visible in our code with no vendored opaqueness. Cost: ~500-800 lines of TS across well-named files.
  - [x] 🟩 3.2 SQLite store at `mcp/data/auth.db` (`mcp/src/oauth/store.ts`). Four tables: `clients`, `auth_codes`, `access_tokens`, `refresh_tokens`. WAL mode, indexes on expiry columns. One-use semantics on `auth_codes.consume` and `refresh_tokens.consume` via transactions.
  - [x] 🟩 3.3 `GET /.well-known/oauth-protected-resource` returns RFC 9728 metadata pointing at the auth server URL and listing supported scopes/bearer methods. Verified via curl.
  - [x] 🟩 3.4 `GET /.well-known/oauth-authorization-server` returns RFC 8414 metadata: issuer, all four endpoints, scopes, grants, response_types, code_challenge_methods (`["S256"]`), `token_endpoint_auth_methods_supported: ["none"]`. Verified via curl.
  - [x] 🟩 3.5 `POST /register` (RFC 7591 DCR) accepts a JSON registration, validates `redirect_uris` are https (or localhost loopback), inserts a client row, and returns 201 with the issued `client_id`. Verified end-to-end with a claude.ai-shaped request and a bad-URI 400.
  - [x] 🟩 3.6 `GET /authorize` (`mcp/src/oauth/authorize.ts`): validates required OAuth params, response_type=code, code_challenge_method=S256, client_id exists, redirect_uri matches a registered URI. Stores flow state (params + CSRF token) in a 10-min signed cookie. Renders simple HTML with a "Log in with GitHub" button. Verified: missing-params, unknown-client, bad-redirect-uri all return 400 with descriptive messages; valid request returns HTML + cookie.
  - [x] 🟩 3.7 `GET /auth/github/callback` (`mcp/src/oauth/github.ts`): reads cookie, CSRF-checks against GitHub state, exchanges code for GitHub access token, fetches user identity from `api.github.com/user`, validates `login` against `ALLOWED_GH_USERS`. On success mints our auth code, persists with all flow params, deletes cookie, 302-redirects to client's callback with `code`+`state`. Renders 403 page on allow-list miss. Verified rejection paths (missing-params, missing-cookie).
  - [x] 🟩 3.8 `POST /token` (`mcp/src/oauth/token.ts`): form-encoded body per RFC 6749 4.1.3, handles `authorization_code` (one-shot consume, expiry+client_id+redirect_uri+PKCE check) and `refresh_token` (one-shot consume with rotation) grants. RFC 6749 error codes (`invalid_grant`, `invalid_request`, `unsupported_grant_type`). Token TTLs: access 1h, refresh 30d. Verified end-to-end including PKCE failure and rotation invalidating the prior refresh token.
  - [x] 🟩 3.9 Access tokens include the resource URI from the auth code (defaulting to `MCP_PUBLIC_URL`) as `audience`. Opaque 32-byte hex strings, looked up in SQLite (no JWT).
  - [x] 🟩 3.10 Bearer auth middleware (`mcp/src/oauth/middleware.ts`): rejects missing/malformed/unknown/expired/wrong-audience tokens with HTTP 401 and `WWW-Authenticate: Bearer resource_metadata="..."` per RFC 9728. Applied only to `/mcp`; OAuth endpoints stay open.
  - [ ] 🟥 3.11 Unit tests for: PKCE validation (correct verifier passes, wrong fails), refresh rotation (old refresh invalid after exchange), audience validation, RFC 6749 error code shape
  - [ ] 🟥 3.12 Write [docs/learnings/oauth-2-1-for-mcp.md](../learnings/oauth-2-1-for-mcp.md): OAuth 2.1 vs 2.0 (no implicit grant, PKCE mandatory), DCR mechanics, the three-party flow (user/client app/auth server), the upstream-IdP pattern (our server is both an OAuth server to claude.ai AND a client to GitHub). Cross-link to [docs/research/claude-ai-connector-oauth.md](../research/claude-ai-connector-oauth.md) and the MCP spec research. Add row to [docs/learnings/README.md](../learnings/README.md)

- [x] 🟩 **Step 4: MCP endpoint + middleware stack** `[sequential]` → depends on: Steps 2, 3. Completed alongside Step 3 chunks D-F.
  - [x] 🟩 4.1 `POST /mcp` route wired via `WebStandardStreamableHTTPServerTransport` (done in Step 2)
  - [x] 🟩 4.2 `GET /mcp` returns `405 Method Not Allowed` with `Allow: POST` header (done in Step 2)
  - [x] 🟩 4.3 `originMiddleware` in `mcp/src/oauth/middleware.ts`: missing Origin = allowed (server-to-server); present Origin must match `https://claude.ai` or be `localhost/127.0.0.1` in dev; otherwise 403.
  - [x] 🟩 4.4 `protocolVersionMiddleware`: missing header allowed (initialize itself omits it); present must equal `2025-06-18` else 400.
  - [x] 🟩 4.5 `bearerAuthMiddleware`: applied to `/mcp` only; calls into the 3.10 validator and 401s with WWW-Authenticate on failure.
  - [x] 🟩 4.6 End-to-end smoke test verified: register client → insert auth_code → /token (auth_code) → /mcp initialize → notifications/initialized → tools/list (16 tools) → /token (refresh) → old refresh rejected → bad PKCE rejected. All paths pass.

- [ ] 🟥 **Step 5: Phone deployment - extend `deploy-phone.sh`** `[sequential]` → depends on: Step 4
  - [ ] 🟥 5.1 In `scripts/deploy-phone.sh`: add a build step for `mcp/` mirroring the frontend pattern. Build TypeScript on laptop. Build arm64 `node_modules` via the existing Docker QEMU step (or a parallel one). Transfer to phone via rsync.
  - [ ] 🟥 5.2 Add `tasklog-mcp` runit service. Env vars: `PORT=5180`, `TASKLOG_API_URL=http://localhost:5115`, `MCP_PUBLIC_URL=https://mcp.tasklog.manudubey.in`, `GITHUB_CLIENT_ID=<from 0.6>`, `GITHUB_CLIENT_SECRET=<from 0.6>`, `ALLOWED_GH_USERS=hydraInsurgent`, `SESSION_SECRET=<generate fresh>`, `NODE_ENV=production`. Secrets read from a `/data/data/com.termux/files/home/.tasklog-mcp.env` file (not committed; copied via scp once)
  - [ ] 🟥 5.3 Add a placeholder `tasklog-tunnel` runit service file; the command field is `exec cloudflared tunnel run tasklog`. Service stays in "want up" state but will fail until Step 6 creates the tunnel; not a deploy blocker
  - [ ] 🟥 5.4 Update the `sv restart` block at the end of the deploy script to include both new services
  - [ ] 🟥 5.5 Smoke test on phone: services come up, `curl http://localhost:5180/.well-known/oauth-protected-resource` from inside the phone returns 200 with valid JSON

- [ ] 🟥 **Step 6: Cloudflare Tunnel** `[sequential]` → depends on: Step 0 (DNS migrated), Step 5 (service running on phone)
  - [ ] 🟥 6.1 Install `cloudflared` on the phone. Try Termux-native first: `curl -L -o cloudflared https://github.com/cloudflare/cloudflares/releases/latest/download/cloudflared-linux-arm64 && chmod +x cloudflared && mv cloudflared $PREFIX/bin/`. Fall back to inside proot if dynamic linker issues
  - [ ] 🟥 6.2 `cloudflared tunnel login` (opens browser on laptop to authenticate Cloudflare zone)
  - [ ] 🟥 6.3 `cloudflared tunnel create tasklog` - records credentials file path (likely `$HOME/.cloudflared/<uuid>.json`)
  - [ ] 🟥 6.4 Write `$HOME/.cloudflared/config.yml`:
    ```yaml
    tunnel: <uuid-from-6.3>
    credentials-file: /data/data/com.termux/files/home/.cloudflared/<uuid>.json
    ingress:
      - hostname: mcp.tasklog.manudubey.in
        service: http://localhost:5180
      - service: http_status:404
    ```
  - [ ] 🟥 6.5 `cloudflared tunnel route dns tasklog mcp.tasklog.manudubey.in` (creates CNAME record on Cloudflare DNS)
  - [ ] 🟥 6.6 Update the `tasklog-tunnel` runit service from 5.3 if needed (config path correct). `sv restart tasklog-tunnel`
  - [ ] 🟥 6.7 External verification: from a non-phone network (laptop on cellular hotspot or a remote server), `curl https://mcp.tasklog.manudubey.in/.well-known/oauth-protected-resource` returns 200
  - [ ] 🟥 6.8 Write [docs/learnings/cloudflare-tunnel.md](../learnings/cloudflare-tunnel.md): tunnels vs port forwarding, outbound-only architecture, why this works behind NAT/firewall, free-tier scope. Cross-link to [docs/research/cloudflare-tunnel.md](../research/cloudflare-tunnel.md). Add row to [docs/learnings/README.md](../learnings/README.md)

- [ ] 🟥 **Step 7: claude.ai connector setup and smoke test** `[sequential]` → depends on: Step 6
  - [ ] 🟥 7.1 In claude.ai web (Pro/Max): Customize > Connectors > Add custom connector. URL: `https://mcp.tasklog.manudubey.in/mcp`. Advanced settings: leave Client ID and Client Secret blank
  - [ ] 🟥 7.2 Tap Connect. Browser opens our `/authorize` page; click Log in with GitHub; complete GitHub OAuth flow; redirected back to claude.ai with a success state
  - [ ] 🟥 7.3 Verify "Connected" status in claude.ai web. Inspect `tools/list` is populated (claude.ai usually shows tool count)
  - [ ] 🟥 7.4 From Claude mobile (iOS or Android): ask "what tasks do I have today?". Verify it calls `list_tasks` and reports the list correctly. If the same connector definition is not auto-shared with mobile, repeat 7.1 on mobile
  - [ ] 🟥 7.5 From Claude mobile: ask "add a task: review PR by Friday". Verify a new task appears in the Tasklog web UI with the correct title and deadline
  - [ ] 🟥 7.6 Test the unhappy path: revoke the connector in claude.ai, reconnect, ensure the GitHub flow works on second attempt and tokens refresh correctly after expiry (force-expire a token in `mcp/data/auth.db` to test reactive refresh)
  - [ ] 🟥 7.7 Append any new deviations to [docs/workflow-notes.md](../workflow-notes.md) Deviations log. Update this plan's `## Outcomes` section with deviations from the plan, library choice made in 3.1, and library-vs-handroll outcome

## Outcomes

<!-- Fill in after execution: decision-relevant deltas only.

- Library choice in 3.1: <mcp-auth | hand-roll | other> - reason
- Termux-native cloudflared (6.1): worked / fell back to proot - reason
- Mobile connector flow (7.4): same as web / required separate setup - detail
- Any assumptions that turned out wrong
- Any scope additions / cuts during build
- Performance numbers if interesting (e.g. cold-start time of tasklog-mcp on phone)

-->
