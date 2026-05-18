# MCP Server Setup (End to End)

**Last updated:** 2026-05-18

How to take a working `tasklog-api` + `tasklog-web` phone deployment and add the MCP server with a public claude.ai connector. The top-level walkthrough for the feature shipped in [docs/plans/_archive/P50-mcp-server.md](../docs/plans/_archive/P50-mcp-server.md).

## How this all fits together

```
                 +--------------------+
   claude.ai --->|  Cloudflare edge   |  (public HTTPS, TLS termination)
                 +--------------------+
                          |
                          | (long-lived outbound tunnel)
                          v
                 +--------------------+
                 | cloudflared        |  (Termux native, port: none open)
                 +--------------------+
                          |
                          v (localhost:5180)
                 +--------------------+
                 | tasklog-mcp        |  (Node, proot Ubuntu)
                 |   - /mcp           |
                 |   - /authorize     |     +--> github.com/login/oauth (upstream)
                 |   - /token         |
                 |   - /.well-known   |
                 +--------------------+
                          |
                          v (localhost:5115)
                 +--------------------+
                 | tasklog-api        |  (.NET, proot Ubuntu) [unchanged]
                 +--------------------+
                          |
                          v
                 +--------------------+
                 | SQLite             |
                 +--------------------+
```

Three new pieces on the phone: a Node MCP service (`tasklog-mcp`), a tunnel daemon (`cloudflared` aka `tasklog-tunnel` service), and an OAuth state DB at `mcp/data/auth.db`. The existing API and frontend are untouched and stay LAN-only.

## Prerequisites

Done once before this guide starts:

- A working `tasklog-api` + `tasklog-web` deployment on the phone (see [phone-server-setup.md](phone-server-setup.md) and [phone-deploying-updates.md](phone-deploying-updates.md)).
- A domain on Cloudflare DNS (see [cloudflare-tunnel-dns-setup.md](cloudflare-tunnel-dns-setup.md)).
- A registered GitHub OAuth App (see [github-oauth-app-setup.md](github-oauth-app-setup.md)). You have the Client ID and Client Secret in KeePassXC.
- A Pro or Max plan on claude.ai (custom connectors are limited to these tiers).

## Walkthrough

### 1. Run the deploy script (laptop)

`scripts/deploy-phone.sh` is idempotent and now builds + transfers the MCP service alongside the API and frontend. From the repo root:

```bash
./scripts/deploy-phone.sh
```

What happens:

- Step 2.6/2.7: `npm run build` in `mcp/`, then arm64 `node_modules` built in a Docker QEMU container (because `better-sqlite3` needs native compilation per arch).
- Step 5.5: rsync of `mcp/dist/`, `mcp/node_modules/`, `mcp/package.json` to the phone.
- Step 6: creates two new runit services - `tasklog-mcp` (Node in proot) and `tasklog-tunnel` (cloudflared in Termux).
- Step 7: restarts all four services. `tasklog-mcp` will start; `tasklog-tunnel` will fail (cloudflared not yet installed) - expected on first deploy.

Expected at the end: a smoke curl against `/.well-known/oauth-protected-resource` may or may not succeed depending on whether the env file is in place. If it fails, that is fine - we have not configured secrets yet.

### 2. Create the env file (one-time, on the phone)

`tasklog-mcp` reads secrets from `/root/.tasklog-mcp.env` inside proot Ubuntu. Create it once. Open a proot shell on the phone:

```bash
ssh phone -t 'proot-distro login ubuntu'
```

Inside proot:

```bash
cat > /root/.tasklog-mcp.env <<'ENV'
PORT=5180
TASKLOG_API_URL=http://localhost:5115
MCP_PUBLIC_URL=https://mcp.tasklog.manudubey.in
GITHUB_CLIENT_ID=<paste from KeePassXC>
GITHUB_CLIENT_SECRET=<paste from KeePassXC>
ALLOWED_GH_USERS=hydraInsurgent
SESSION_SECRET=<paste output of: openssl rand -hex 32>
NODE_ENV=production
ENV
chmod 600 /root/.tasklog-mcp.env
exit
```

Generate the SESSION_SECRET on your laptop before pasting:

```bash
openssl rand -hex 32
```

Restart the service so it picks up the env file:

```bash
ssh phone "SVDIR=\$PREFIX/var/service sv restart tasklog-mcp"
```

Verify it started:

```bash
ssh phone "SVDIR=\$PREFIX/var/service sv status tasklog-mcp"
# Should show: run: tasklog-mcp: (pid NNNNN) Xs
```

Optional sanity from the phone:

```bash
ssh phone 'curl -s http://localhost:5180/.well-known/oauth-protected-resource'
# Should print the RFC 9728 metadata JSON.
```

### 3. Install cloudflared on the phone

Native Termux install (not inside proot - cloudflared is a static Go binary, no glibc needed):

```bash
ssh phone bash <<'EOF'
curl -L -o $PREFIX/bin/cloudflared \
  https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64
chmod +x $PREFIX/bin/cloudflared
cloudflared --version
EOF
```

If the Termux native install errors out for any architecture reason, fall back to inside-proot install:

```bash
ssh phone 'proot-distro login ubuntu -- bash -c "curl -L -o /usr/local/bin/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64 && chmod +x /usr/local/bin/cloudflared"'
```

(Then adjust the `tasklog-tunnel` runit service to invoke via proot - left as a TODO if needed.)

### 4. Authenticate cloudflared with your Cloudflare account

```bash
ssh phone 'cloudflared tunnel login'
```

This prints a URL. Open it on your laptop browser, log in to Cloudflare, select the zone `manudubey.in`, click Authorize. The phone-side cloudflared receives the credentials and writes them to `$HOME/.cloudflared/cert.pem`.

### 5. Create the tunnel and DNS route

```bash
ssh phone bash <<'EOF'
cloudflared tunnel create tasklog
# Note the UUID printed. The credentials file is at $HOME/.cloudflared/<UUID>.json
cat $HOME/.cloudflared/*.json | jq -r .TunnelID  # confirm UUID
EOF
```

Write the config file pointing the hostname at the local MCP service:

```bash
ssh phone bash <<'EOF'
UUID=$(jq -r .TunnelID $HOME/.cloudflared/*.json | head -1)
cat > $HOME/.cloudflared/config.yml <<CFG
tunnel: $UUID
credentials-file: /data/data/com.termux/files/home/.cloudflared/$UUID.json
ingress:
  - hostname: mcp.tasklog.manudubey.in
    service: http://localhost:5180
  - service: http_status:404
CFG
cat $HOME/.cloudflared/config.yml
EOF
```

Create the DNS record (Cloudflare adds a CNAME to `<uuid>.cfargotunnel.com`):

```bash
ssh phone 'cloudflared tunnel route dns tasklog mcp.tasklog.manudubey.in'
```

### 6. Restart the tunnel service

```bash
ssh phone "SVDIR=\$PREFIX/var/service sv restart tasklog-tunnel"
ssh phone "SVDIR=\$PREFIX/var/service sv status tasklog-tunnel"
# Should now show: run: tasklog-tunnel: (pid NNNNN) Xs
```

### 7. Verify externally

From your laptop (not on the phone's LAN if possible, e.g. cellular hotspot):

```bash
curl -s https://mcp.tasklog.manudubey.in/.well-known/oauth-protected-resource | jq
```

Should return RFC 9728 metadata pointing at `https://mcp.tasklog.manudubey.in`.

### 8. Add the connector in claude.ai

In claude.ai web (Pro/Max plan):

1. Customize > Connectors > Add custom connector.
2. URL: `https://mcp.tasklog.manudubey.in/mcp`.
3. Advanced settings: leave Client ID and Client Secret BLANK (we use Dynamic Client Registration).
4. Click Add.

### 9. Connect (one-time per Claude account)

In claude.ai, click Connect on the new connector. A browser tab opens to our `/authorize` page. Click "Log in with GitHub." Complete the GitHub OAuth flow. You'll be redirected back to claude.ai with a "Connected" indicator.

### 10. Smoke test from Claude mobile

Open Claude on your phone or laptop:

> "What tasks do I have?"

Claude should call `list_tasks` and return your tasks.

> "Add a task: review PR by Friday"

Claude should call `create_task`. Verify by opening Tasklog web UI.

## Day-to-day operations

**Add a task from Claude:** just ask. Claude picks `create_task` based on natural language.

**Restart tasklog-mcp after env changes:**

```bash
ssh phone "SVDIR=\$PREFIX/var/service sv restart tasklog-mcp"
```

**Check logs:**

```bash
ssh phone 'tail -f $HOME/log/tasklog-mcp/current'
ssh phone 'tail -f $HOME/log/tasklog-tunnel/current'
```

**Wipe OAuth state** (forces re-consent on next claude.ai connect):

```bash
ssh phone 'proot-distro login ubuntu -- rm /root/tasklog/mcp/data/auth.db /root/tasklog/mcp/data/auth.db-shm /root/tasklog/mcp/data/auth.db-wal'
ssh phone "SVDIR=\$PREFIX/var/service sv restart tasklog-mcp"
```

**Rotate GITHUB_CLIENT_SECRET:**

1. github.com/settings/developers > your Tasklog OAuth App > Generate a new client secret.
2. Update `/root/.tasklog-mcp.env` on the phone.
3. Restart `tasklog-mcp`.

## Troubleshooting

**"redirect_uri_mismatch" in the GitHub login step:** the callback URL in the GitHub OAuth App settings does not exactly match the one tasklog-mcp is sending. Compare:
- GitHub OAuth App > Authorization callback URL.
- `MCP_PUBLIC_URL` env var (suffix `/auth/github/callback`).

**"Access denied: GitHub user X is not authorized":** your GitHub login is not in `ALLOWED_GH_USERS`. Update the env file and restart `tasklog-mcp`.

**`tasklog-tunnel` service is down (`sv status` shows fail count):** cloudflared either is not installed (step 3) or has no valid tunnel config (steps 4-5). Logs: `tail $HOME/log/tasklog-tunnel/current`.

**`tasklog-mcp` is down (`sv status` shows fail count):** likely a missing env var in production mode. Logs: `tail $HOME/log/tasklog-mcp/current`. The startup error will name the missing variable.

**claude.ai shows "Connected" but tool calls fail:** check `tasklog-api` is running (`sv status tasklog-api`). MCP tools call the local Tasklog API; if it's down they all fail.

**Want to test claude.ai mobile separately:** the connector list syncs across the same Claude account, so adding it on web means it appears on mobile too. If not visible, try logging out + back in on mobile.

## Adding a second MCP server in the future

If you build a separate MCP server for another project (e.g. `mcp.album-to-movies.manudubey.in`):

1. Register a separate GitHub OAuth App for that project.
2. Create another tunnel hostname: `cloudflared tunnel route dns tasklog mcp.album-to-movies.manudubey.in` (you can reuse one tunnel for many hostnames via `ingress` config).
3. Update `cloudflared` config.yml to add an ingress entry for the new hostname pointing at the new service's port.
4. Add the connector to claude.ai with the new URL.

The Cloudflare DNS + tunnel infrastructure scales to many services.

## See also

- [docs/plans/P50-mcp-server.md](../docs/plans/P50-mcp-server.md) (or `docs/plans/_archive/` after ship) - the full implementation plan.
- [docs/learnings/mcp-protocol.md](../docs/learnings/mcp-protocol.md) - what MCP is and how the wire protocol works.
- [docs/learnings/oauth-2-1-for-mcp.md](../docs/learnings/oauth-2-1-for-mcp.md) - the OAuth flow this server implements.
- [docs/learnings/cloudflare-tunnel.md](../docs/learnings/cloudflare-tunnel.md) - tunnel concepts.
- [guides/cloudflare-tunnel-dns-setup.md](cloudflare-tunnel-dns-setup.md) - the prerequisite domain migration.
- [guides/github-oauth-app-setup.md](github-oauth-app-setup.md) - the prerequisite OAuth App registration.
- [docs/research/mcp-spec-2025-06-18.md](../docs/research/mcp-spec-2025-06-18.md), [docs/research/claude-ai-connector-oauth.md](../docs/research/claude-ai-connector-oauth.md), [docs/research/cloudflare-tunnel.md](../docs/research/cloudflare-tunnel.md) - the verified facts informing this guide.
