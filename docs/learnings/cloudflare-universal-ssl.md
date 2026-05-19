# Cloudflare Universal SSL and subdomain depth

**Last updated:** 2026-05-19 - first encountered in MCP server feature (P50, 2026-05)

Cloudflare's free Universal SSL covers the apex domain and a one-level wildcard - and *only* one level. Picking a two-level subdomain on a free plan results in a TLS handshake failure with no obvious error message. This is a free-tier limitation that shapes naming decisions for any service fronted by Cloudflare.

## Mental model

This limitation **only applies to subdomains that are proxied through Cloudflare** (the "orange cloud" toggle in the DNS dashboard). DNS-only records (gray cloud) are unaffected - Cloudflare is just resolving the name, not terminating TLS, so it doesn't matter how deep the subdomain is. The browser talks directly to your origin and the origin's own cert (Let's Encrypt, self-signed, etc.) is what's evaluated.

So:

- `tasklog.home.example.com` pointing at `192.168.1.50` with DNS only = works fine regardless of depth.
- `mcp.tasklog.example.com` orange-cloud-proxied to a tunnel = fails TLS handshake on free plan because Universal SSL doesn't cover this depth.

When you put a domain on Cloudflare and use their proxy (orange cloud, not "DNS only"), Cloudflare terminates TLS at the edge and re-encrypts to your origin. The TLS certificate the client sees is **Cloudflare's**, not yours - they auto-issue and renew it through Let's Encrypt / Digicert / Google Trust Services.

The auto-issued certificate is the "Universal SSL" cert. On the free plan, it covers:

- `example.com` (the apex)
- `*.example.com` (any one-level subdomain: `www.example.com`, `api.example.com`, `mcp.example.com`)

It does **not** cover:

- `*.sub.example.com` (any deeper subdomain: `mcp.tasklog.example.com`, `api.v2.example.com`)
- `*.example.com` paired with `*.*.example.com` either - wildcards in DNS don't nest.

If you add a DNS record for `mcp.tasklog.example.com` and point it at a Cloudflare-proxied origin (an Argo Tunnel, an A record with proxy on), HTTPS requests to that hostname will fail the TLS handshake. Browsers show "ERR_SSL_PROTOCOL_ERROR" or similar; curl shows `error:0A000410:SSL routines::sslv3 alert handshake failure`.

## Why it exists

Cloudflare issues one wildcard cert per zone for free. CAs (Let's Encrypt etc.) charge per cert for nested wildcards, or require a per-hostname validation. Cloudflare absorbs that cost only one level deep on free; deeper levels require paid features.

The paid paths:

- **Advanced Certificate Manager (ACM)**, ~$10/month per zone: order specific certs for arbitrary hostnames, including nested wildcards.
- **Total TLS** (an ACM feature): auto-issue certs for every DNS hostname in the zone, regardless of depth.
- A **dedicated SSL certificate** with custom hostname patterns.

For a personal project this is rarely worth it. The pragmatic move is to keep service hostnames at one level.

## How it actually works

The TLS handshake:

1. Client opens TCP to the Cloudflare edge IP (e.g. `104.21.10.236`).
2. Client sends a TLS ClientHello with `server_name` extension = `mcp.tasklog.example.com`.
3. Cloudflare looks up the certificate covering that hostname. For free Universal SSL the cert covers `example.com` and `*.example.com`. Neither matches `mcp.tasklog.example.com`.
4. Cloudflare sends a TLS alert: `handshake_failure`. Connection closes.
5. The Argo Tunnel running in your origin is irrelevant - the request never reaches it.

So the symptom is *not* a 502 Bad Gateway (origin not reachable). It's a TLS-level failure before HTTP even starts. Easy to mistake for an origin issue if you're not looking at the handshake.

```
Browser                    Cloudflare edge             Origin (your tunnel)
   |                              |                            |
   |--- TCP SYN ----------------->|                            |
   |<-- TCP SYN-ACK --------------|                            |
   |--- ClientHello, SNI=2-level->|                            |
   |                              | (no cert for SNI value)    |
   |<-- TLS alert handshake_fail--|                            |
   |                              |                            |
                              ... request never reaches origin
```

## Common misconceptions

- **"Universal SSL is a wildcard cert covering everything in my zone."** Only one level deep. Anything nested needs ACM (paid) or a custom cert.
- **"If DNS resolves, TLS will work."** No. DNS getting you to Cloudflare's edge is independent from Cloudflare having a cert for the hostname.
- **"This is an Argo Tunnel problem."** No. The tunnel is the origin - it never gets the request. The failure is at Cloudflare's edge.
- **"I can fix it by turning the orange cloud off (DNS only)."** That bypasses Cloudflare's edge entirely - now the client talks to your origin IP directly, your origin would need its own cert, and you lose Cloudflare's protection. Valid for LAN-only services where Cloudflare is just a DNS convenience (e.g. `tasklog.home.example.com` resolving to a private IP), but not a real fix for a public service you wanted Cloudflare to front.
- **"Let's Encrypt would issue a free cert for the deeper subdomain."** True - but only if traffic reaches your origin, not Cloudflare's. You'd have to turn off proxy mode (DNS only) to use Let's Encrypt directly.

## When this matters in practice

- **Picking a subdomain for a Cloudflare-proxied service**: prefer one level deep. `mcp-tasklog.example.com` (flat, free Universal SSL) over `mcp.tasklog.example.com` (nested, needs ACM).
- **Naming pattern for multiple MCP servers / services on one domain**: use flat single-level subdomains with a project prefix (`mcp-tasklog`, `mcp-album-to-movies`, `mcp-finance`). Less elegant than `mcp.<project>.example.com`, but free.
- **Diagnosing a TLS handshake failure after adding a new DNS record**: first thing to check is the SNI depth. If it's two levels and you're on free Cloudflare, that's the cause.
- **Considering ACM**: only pays back when you have many hostnames or the naming convention really matters to your branding.

## When to break the rule

Pay for ACM if any of:

- You need `*.tenant.yourapp.com` style multi-tenant subdomains where the tenant is dynamic.
- The aesthetic of `mcp.product.example.com` is genuinely worth $10/month/zone to you.
- You're already on a Cloudflare paid plan (Pro/Business/Enterprise) and ACM/Total TLS may be bundled.

For Tasklog (and most personal/single-tenant projects), the flat naming is fine.

## Further reading

- [Cloudflare Universal SSL docs](https://developers.cloudflare.com/ssl/edge-certificates/universal-ssl/) - the canonical reference.
- [Cloudflare Advanced Certificate Manager](https://developers.cloudflare.com/ssl/edge-certificates/advanced-certificate-manager/) - the paid option for nested wildcards.
- [Why is my TLS handshake failing? (Cloudflare community thread)](https://community.cloudflare.com/) - this exact symptom has a well-known cause.
- Cross-link: [cloudflare-tunnel.md](cloudflare-tunnel.md) - the tunnel pattern itself, separate concern from cert depth.
- Cross-link: [dns-and-nameservers.md](dns-and-nameservers.md) - getting traffic to Cloudflare's edge in the first place.
