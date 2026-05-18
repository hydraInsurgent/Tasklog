# Research: Cloudflare Tunnel

**Sources:**
- https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/ (overview)
- https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/ (binary downloads)
- https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/create-remote-tunnel/ (setup)

**Retrieved:** 2026-05-18
**Goal:** expose a single HTTP service on the phone (port 5180) at a public HTTPS hostname so claude.ai's servers can reach it.

This file is intentionally less spec-dense than the MCP and claude.ai files because Cloudflare Tunnel is operational config rather than a protocol. The verbatim facts that matter most are the binary URL, the architecture support, and the domain-on-Cloudflare prerequisite.

---

## Mental model

A lightweight daemon (`cloudflared`) runs on your origin (the phone) and makes outbound-only connections to Cloudflare's edge network. Cloudflare then accepts public HTTPS traffic at your chosen hostname (e.g. `mcp.example.com`) and proxies it through that outbound connection to the local service. The origin never accepts inbound connections from the public internet, so no port forwarding and no exposed origin IP.

```
claude.ai → mcp.tasklog.manudubey.in (public DNS on Cloudflare)
              ↓ (Cloudflare edge terminates TLS)
              ↓ (Cloudflare routes via persistent outbound connection to phone)
        cloudflared (on phone, outbound-only)
              ↓ (localhost:5180)
        tasklog-mcp (Node MCP server)
```

This is structurally why Cloudflare Tunnel beats port-forwarding for a home server: outbound-only is firewall-friendly, requires no router config, and hides the home IP.

---

## Prerequisites

### Domain on Cloudflare DNS (yes, required)

From the dashboard setup page:

> "Before you publish an application through your tunnel, you must add a website to Cloudflare"

A named tunnel that routes a custom hostname requires the parent domain to be on Cloudflare DNS. The fastest way: change the domain's nameservers to Cloudflare's at the registrar level. This is a one-time setup per domain, free, and works on any Cloudflare account.

For Tasklog: we already have `tasklog.manudubey.in` from the GCP guide. Need to verify whether `manudubey.in` is on Cloudflare DNS or another provider. If on Cloudflare already, we can add an `mcp.tasklog.manudubey.in` subdomain. If not, we either migrate the domain or use a different one.

### cloudflared binary

Officially supported Linux architectures (from the downloads page):

> "amd64 / x86-64 (primary)
> x86 (32-bit)
> ARM
> ARM64"

ARM64 is officially supported. Direct binary download URL:

> "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64"

`.deb` and `.rpm` packages exist for distros that use them.

Version format: `YYYY.M.D` (e.g. `2023.1.1`). Cloudflare supports versions within one year of the most recent release.

### Termux / proot considerations

Not explicitly documented by Cloudflare. The Tasklog phone setup runs services inside a proot Ubuntu rootfs under Termux. Two options for where to run cloudflared:

1. **Inside proot Ubuntu** - same environment as `tasklog-api` and `tasklog-web`. Simpler conceptually but inherits proot's syscall translation overhead.
2. **Directly in Termux** - cloudflared runs natively on Android-Linux without proot. Lower overhead. cloudflared is a static Go binary so it does not depend on glibc; should work in Termux's bionic-based environment.

Recommendation: try Termux-native first (option 2). Fall back to proot Ubuntu if there are dynamic linker or DNS resolver issues. The runit service supervisor we already use lives in Termux, so a Termux-native cloudflared fits cleanly.

This is one of the "open questions" to validate during `/execute`.

### Free plan: sufficient

Cloudflare Tunnel is included on the free Cloudflare plan with no per-connection or per-bandwidth charge for typical use. Not stated verbatim on the pages we fetched (Cloudflare distributes pricing info across the Zero Trust pricing page), but well established. Single-user MCP traffic is well within free-tier limits.

---

## Setup paths: dashboard vs CLI

There are two ways to create and configure a named tunnel:

### Dashboard path (what we fetched)

From `/get-started/create-remote-tunnel/`:

> "Navigate to Zero Trust > Networks > Connectors > Cloudflare Tunnels"
> "Select Create a tunnel"
> "Name it"
> "Select Save tunnel"

Then on the install page:

> "Copy the command in the box below and paste it into a terminal window. Run the command"

That command bundles the tunnel credentials with the install. It is the easiest path for first-time setup.

Then on the Public Hostnames tab:

> "Enter subdomain, domain, service type/URL"

(For us: subdomain = `mcp`, domain = `manudubey.in`, service URL = `http://localhost:5180`.)

### CLI path (not in the fetched pages)

The CLI flow uses these commands (well-documented in the broader Cloudflare docs we did not fetch in detail):

```bash
cloudflared tunnel login           # opens browser, picks Cloudflare zone
cloudflared tunnel create tasklog  # creates the tunnel, writes credentials file
cloudflared tunnel route dns tasklog mcp.tasklog.manudubey.in  # creates DNS record
cloudflared tunnel run tasklog     # starts the tunnel
```

A `config.yml` file controls hostname-to-service mappings:

```yaml
tunnel: <tunnel-uuid>
credentials-file: /root/.cloudflared/<uuid>.json
ingress:
  - hostname: mcp.tasklog.manudubey.in
    service: http://localhost:5180
  - service: http_status:404
```

Both paths produce the same result. The dashboard path requires less local CLI knowledge but ties some state to dashboard clicks. The CLI path is more reproducible (config.yml + credentials file under version control of state, not of secrets) and matches the rest of the Tasklog deploy story.

**Recommendation for Tasklog:** CLI path. The deploy-phone.sh script already provisions runit services declaratively from a script; adding a `tasklog-tunnel` runit service that runs `cloudflared tunnel run tasklog` keeps the deploy fully scriptable.

---

## Long-lived service

cloudflared can run as a systemd service on standard distros. We use runit on Termux. Pattern (mirrors `tasklog-api` and `tasklog-web` services from `scripts/deploy-phone.sh`):

```bash
# $PREFIX/var/service/tasklog-tunnel/run
#!/data/data/com.termux/files/usr/bin/bash
exec 2>&1
exec env cloudflared tunnel --config /data/data/com.termux/files/home/.cloudflared/config.yml run tasklog
```

Plus a `log/run` script writing to `$HOME/log/tasklog-tunnel/` via `svlogd`.

This becomes the fourth service alongside `tasklog-api`, `tasklog-web`, and `tasklog-mcp`.

---

## Setup checklist (Tasklog-specific)

- [ ] Verify `manudubey.in` is on Cloudflare DNS (or migrate it).
- [ ] Pick the subdomain (`mcp.tasklog.manudubey.in`).
- [ ] Install cloudflared on the phone (Termux-native if possible). Use the official ARM64 binary.
- [ ] `cloudflared tunnel login` once to authenticate.
- [ ] `cloudflared tunnel create tasklog` to create the tunnel and credentials file.
- [ ] Write `config.yml` mapping `mcp.tasklog.manudubey.in` to `http://localhost:5180`.
- [ ] `cloudflared tunnel route dns tasklog mcp.tasklog.manudubey.in` to create the DNS record.
- [ ] Add a `tasklog-tunnel` runit service so it starts on phone boot.
- [ ] Verify end-to-end: `curl https://mcp.tasklog.manudubey.in/.well-known/oauth-protected-resource` from a network outside the phone should hit the MCP server.

---

## Open questions / gaps

1. **Domain status on Cloudflare** - confirmed needed; user to confirm whether `manudubey.in` is already on Cloudflare DNS. If not, we either migrate or use `trycloudflare.com` quick-tunnel (no custom hostname, less stable URL) as a stopgap.
2. **Termux-native vs proot cloudflared** - to be validated during `/execute`. Try Termux-native first.
3. **TLS to origin** - by default Cloudflare terminates TLS and proxies plain HTTP to the origin via the tunnel. cloudflared's outbound link is itself TLS-secured. We do not need TLS on `localhost:5180`. If we wanted full end-to-end TLS we would configure `service: https://localhost:5180` and a self-signed cert, but that is unnecessary for our threat model.
4. **Access policies** - Cloudflare Zero Trust supports Access policies (require Google login, email allow-list, etc.) on tunneled hostnames. For us this would be redundant with OAuth at the MCP layer. Leave Access off; MCP OAuth is the only auth.
5. **Bandwidth limits** - free plan limits not researched in detail. For single-user MCP traffic (KB per call, not MB) this is irrelevant.
