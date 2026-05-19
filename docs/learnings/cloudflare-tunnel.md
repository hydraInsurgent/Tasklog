# Tunnels (and Cloudflare Tunnel specifically)

**Last updated:** 2026-05-18 - first encountered in MCP server feature (P50, 2026-05)

A "tunnel" is a networking pattern that lets you expose a service running behind NAT or a firewall to the public internet without opening any inbound ports. The trick: the origin server makes an OUTBOUND, long-lived connection to a relay, and the relay accepts public traffic on the origin's behalf. This learning explains the concept generally, then how Cloudflare Tunnel implements it.

## Mental model

The classic way to expose a home-hosted service to the internet is **port forwarding**: tell your router "forward incoming TCP port 443 on the WAN side to 192.168.1.50:443 on the LAN side." This works but:

- Requires control over the router (impossible on dorm/corporate networks and cellular hotspots).
- Exposes your origin's public IP, opening you to DDoS, scanning, and abuse.
- Breaks if your ISP gives you a dynamic IP (re-configure router or use dynamic DNS).
- Often requires holes in the firewall that admins do not want.

**A tunnel inverts the direction.** Your origin connects OUT to a relay service. The relay accepts the public traffic. When traffic arrives, the relay forwards it back over the existing outbound connection to your origin.

```
Port forwarding:
  user --> router (port 443 forwarded) --> origin server

Tunnel:
  user --> relay (public HTTPS endpoint)
            |
            v (existing outbound connection from origin)
          origin server
```

Because the origin's connection is outbound, no inbound holes are needed. Most firewalls allow outbound HTTPS by default.

## Why it works (and why it scales)

A tunnel is just a long-lived TCP (or QUIC) connection. The origin establishes it once and keeps it open. The relay multiplexes incoming HTTP requests over that one connection. Modern implementations use HTTP/2 or HTTP/3 framing, which natively supports many in-flight requests on one connection.

The pattern is conceptually the same as a reverse proxy with the addition of "the proxy is on someone else's network." Common implementations:

| Tool | Hosted by | Notes |
|---|---|---|
| **Cloudflare Tunnel** | Cloudflare | Free, integrates with Cloudflare DNS. Daemon: `cloudflared`. |
| **ngrok** | ngrok.com | Pioneered the pattern. Free tier limited; paid for custom domains. |
| **Tailscale Funnel** | Tailscale | Part of the Tailscale mesh. Routes traffic into your Tailscale network. |
| **localhost.run / serveo** | Various | SSH-based, very minimal. |
| **frp** | self-hostable | Open-source, you run the relay yourself. |

Cloudflare Tunnel is the option of choice for "I want a stable public hostname on a domain I own, on the free tier." That is exactly the Tasklog MCP requirement.

## The Cloudflare Tunnel architecture

```
claude.ai (or any user)
    |
    v
  Cloudflare edge (global anycast network)
    |
    v (existing tunnel connection)
  cloudflared daemon (on YOUR origin)
    |
    v (localhost)
  Your service (tasklog-mcp on port 5180)
```

Specifically:

1. You run `cloudflared` on your origin. It opens an outbound TCP connection to Cloudflare's edge.
2. You create a "named tunnel" with a UUID. Cloudflare remembers that "this UUID belongs to me."
3. You add a DNS record on your zone (e.g. `mcp-tasklog.manudubey.in`) that resolves to `<uuid>.cfargotunnel.com`. This is a CNAME-like target that Cloudflare resolves internally.
4. Traffic arrives at Cloudflare's edge at `mcp-tasklog.manudubey.in`. Cloudflare terminates TLS (using its own certs - you do not manage them).
5. Cloudflare looks up the hostname's tunnel UUID, finds the cloudflared instance with that UUID currently connected, and forwards the request over the existing tunnel.
6. cloudflared receives the request and proxies it to the configured local service (e.g. `http://localhost:5180`).
7. Your service responds. The response flows back the same path.

You never see the user's real IP unless Cloudflare passes it in headers (`CF-Connecting-IP`).

## Why this beats port forwarding for our use case

- **No router config.** Works on cellular hotspot, behind dorm NAT, behind ISP CGNAT.
- **No exposed origin IP.** Attackers see Cloudflare's anycast IPs, not yours.
- **Free TLS.** Cloudflare's edge terminates HTTPS for any subdomain on your zone. No Let's Encrypt rotation, no cert files on origin.
- **DDoS protection.** Cloudflare absorbs floods at the edge.
- **Free tier.** Sufficient for personal projects (no per-request or bandwidth charges for typical use).
- **Restart-safe.** If `cloudflared` dies and restarts, it re-establishes the tunnel and traffic resumes. No DNS change needed.

The trade-offs:

- **Dependency on Cloudflare.** If Cloudflare's edge has an outage, your service is down even though the origin is fine.
- **TLS terminates at the edge.** Cloudflare sees your plaintext traffic. For most personal projects this is fine; for sensitive data, evaluate.
- **Domain must be on Cloudflare DNS.** Tunnel cannot route traffic for a domain Cloudflare does not authoritatively serve.

## Trust model

Cloudflare's edge is in the request path. They CAN inspect, log, modify any traffic that passes through. The same is true of any tunnel provider (ngrok, Tailscale Funnel, etc.) and indeed of any reverse proxy.

For Tasklog MCP this is acceptable because:

- The MCP server already enforces OAuth at the origin. Even if Cloudflare were compromised, an attacker would still need a valid access token to do anything useful.
- Task data is personal but not high-stakes.
- The alternative (port forward + Let's Encrypt + DDoS exposure) has its own trade-offs.

For higher-trust scenarios, consider:

- Tailscale Funnel (you trust Tailscale and stay in their mesh)
- Self-hosted frp (you run the relay; trust nobody else)
- VPN-based access only (no public exposure at all)

## How it differs from a VPN

A **VPN** gives the user end-to-end access to a network. After connecting, the user's machine acts like it's on your LAN. They can hit any service on any port.

A **tunnel** exposes ONE service on ONE public hostname. The user does not "join" your network; they make a normal HTTPS request to a public address that happens to be tunneled.

For "let claude.ai's servers reach my phone-hosted service," a tunnel is the right tool. Joining claude.ai's servers to your Tailscale network would also work but is overkill and would broadcast far more than intended.

## Common misconceptions

- **"Tunneling is a security feature."** Not by itself. It hides your origin IP but does not add authentication or authorization. If your service is open, anyone can hit it through the tunnel. You still need auth at the origin (we use OAuth).
- **"The tunnel is encrypted between Cloudflare and my origin."** It is - cloudflared uses TLS to talk to Cloudflare's edge. But Cloudflare sees the plaintext after TLS termination (HTTPS in front, your origin in back). End-to-end encryption requires extra setup (mTLS between Cloudflare and origin).
- **"I can pick any hostname I want."** Only if your domain is on Cloudflare DNS. The hostname has to belong to a zone Cloudflare authoritatively serves.
- **"Tunnels need a static IP."** No. cloudflared works fine on dynamic IPs because it initiates the connection. Re-establishing after an IP change is automatic.
- **"Tunneling adds significant latency."** A small amount (extra hop to Cloudflare's nearest edge, ~10-30ms typically). Cloudflare's anycast often picks a closer edge to the user than your origin is, so the perceived latency for distant users can actually IMPROVE.
- **"I can only have one tunnel per origin."** No. You can run multiple cloudflared instances or use one tunnel for multiple hostnames via the `ingress` config.

## When it matters in practice

- **Exposing a home-hosted service to claude.ai or any other public API client**: tunnel is the cleanest answer.
- **Building a webhook receiver during local development**: ngrok / tunnel of choice points an HTTPS URL at your `localhost:3000`.
- **Demoing a personal project**: send a friend a tunnel URL instead of asking them to run your code.
- **Bypassing CGNAT**: many ISPs share a single public IP across many subscribers; port forwarding does not work on these. Tunnels do.
- **Deciding between Tunnel and VPN for remote work**: Tunnel for "one specific service public"; VPN for "all my LAN services from anywhere I am."

## Configuration in common stacks

| Tool | Setup pattern |
|---|---|
| Cloudflare Tunnel | `cloudflared tunnel login`, `tunnel create`, write `config.yml`, `tunnel route dns`, `tunnel run`. Run as a service (systemd, runit, launchd). |
| ngrok | `ngrok http 5180` for ad-hoc; `ngrok config` + named tunnels for stable hostnames. |
| Tailscale Funnel | `tailscale serve --https <port>` + `tailscale funnel --bg <port>`. Hostname is `<machine>.<tailnet>.ts.net`. |
| frp (self-hosted) | Run `frps` on a public VPS; run `frpc` on origin; config files on both sides. |

## Further reading

- [Cloudflare Tunnel docs](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) - the canonical reference.
- [What is Cloudflare Tunnel? (Cloudflare blog)](https://blog.cloudflare.com/tunnel-for-everyone/) - introductory explainer.
- [ngrok concepts](https://ngrok.com/docs/secure-tunnels/) - similar concept, different vendor.
- Cross-link: [docs/research/cloudflare-tunnel.md](../research/cloudflare-tunnel.md) - canonical facts we cited for Cloudflare Tunnel's specific setup.
- Cross-link: [guides/cloudflare-tunnel-dns-setup.md](../../guides/cloudflare-tunnel-dns-setup.md) - the migration walkthrough that prepared the domain for tunnel use.
