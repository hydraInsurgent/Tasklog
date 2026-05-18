# DNS, Nameservers, and "Powered by Cloudflare"

**Last updated:** 2026-05-18 - first encountered in MCP server feature (P50, 2026-05)

The internet's name-to-IP lookup system is split across more roles than most people realize, and registrar dashboards make this worse by labeling rented infrastructure with the brand of the underlying vendor. This is the story of who actually answers the question "where is `tasklog.manudubey.in`?" and how to migrate that answer-er without breaking the site.

## Mental model

DNS is a giant phone book maintained by no one in particular. When your laptop wants `manudubey.in`, it asks a chain of servers that each know slightly more:

```
your laptop -> ISP resolver -> root servers -> .in TLD servers -> authoritative NS for your domain -> IP
```

The last link is the one that matters for ownership: the **authoritative nameservers** for your domain are the only servers that store the actual record values. Everyone else just caches.

## Three roles, often confused as one

| Role | What it does | Example |
|---|---|---|
| **Registrar** | The company you buy the domain from. Holds your registration in the TLD registry. | Porkbun, GoDaddy, Namecheap |
| **Authoritative DNS provider** | The company whose nameservers answer queries for your domain. Holds the actual records (A, AAAA, CNAME, TXT, etc). | Cloudflare DNS, Route 53, Porkbun DNS |
| **DNS infrastructure** | The physical anycast network that delivers the responses fast. | Cloudflare, NS1 |

These three CAN be the same company (Cloudflare can be registrar, DNS provider, and infrastructure all at once). Often they are not.

## The "Powered by Cloudflare" trap

Some registrars advertise "DNS Powered by Cloudflare" on their dashboard. Porkbun is a notable example. This means the registrar's nameservers (`*.ns.porkbun.com`) physically run on Cloudflare's anycast network. The infrastructure is Cloudflare; the records are still managed at the registrar's interface.

This is NOT the same as "your domain is on Cloudflare DNS." For that, your domain's authoritative nameservers must literally be `*.ns.cloudflare.com`, and you manage records in the Cloudflare dashboard.

**How to tell which you are:** look up the NS records.

```bash
curl -s "https://dns.google/resolve?name=yourdomain.com&type=NS"
```

If the returned servers are `*.ns.cloudflare.com`, you are on Cloudflare DNS. If they are anything else, you are not - regardless of what the registrar dashboard says.

## Why it exists: the registrar/DNS-provider split

In the early internet, the registrar (the company that registered your domain with the TLD) was also the only company allowed to publish DNS for it. That tied your DNS to whoever you bought the domain from, even if their DNS service was slow, feature-poor, or unreliable.

The IANA / ICANN model decoupled the two. The registrar now only has to hold the registration and publish the NS records pointing wherever you say. Any DNS provider can serve your zone, as long as they configure nameservers and the registrar points the NS records at them.

Result: you can keep your domain registered at Porkbun forever while pointing DNS at Cloudflare, AWS, or some self-hosted bind9 instance. Or vice versa.

## How migration actually works

To move DNS authority from one provider to another:

1. **At the new provider:** import or recreate your records (so the new nameservers have the answers ready).
2. **At the parent zone (TLD registry):** change the NS records to point at the new nameservers. This is done through your registrar's "nameservers" or "delegation" field.
3. **Wait for propagation:** every caching resolver between users and the registry will hold the old NS answer until its TTL expires (typically 1 hour to 2 days).

The registrar relationship and the DNS authority are independent. The registry only stores: "for `manudubey.in`, ask these nameservers." Change those nameservers, and the records flip to whoever runs them.

## Propagation and DoH

"Propagation" sounds like a slow signal traveling. It is not. It is caches expiring. Each resolver in the chain caches answers based on TTL. When you change NS records, your update is instant at the TLD registry, but downstream resolvers will not see it until their cache entry expires.

**DoH (DNS over HTTPS)** lets you ask a known-fresh resolver directly:

```bash
curl -s "https://dns.google/resolve?name=manudubey.in&type=NS"
```

Google's resolver answers via HTTPS, bypasses any local cache, and gives you a current view. This is how you verify migration progress without waiting on your own DNS cache.

Cloudflare runs its own DoH endpoint at `https://cloudflare-dns.com/dns-query?name=...&type=NS` if you prefer.

## Cloudflare: Proxied vs DNS only

When records live on Cloudflare DNS, each record has a "proxy status" toggle:

- **Proxied (orange cloud):** public DNS returns Cloudflare's edge IP. Traffic enters Cloudflare's edge first, then forwards to your origin. You get CDN, DDoS protection, TLS termination. The origin IP is hidden from public DNS.
- **DNS only (grey cloud):** public DNS returns your origin IP directly. Cloudflare does nothing further. Used for backend servers serving their own TLS, RFC 1918 private IPs (which Cloudflare cannot proxy), or anything you want to keep direct.

Default is Proxied. Switch to DNS only when proxying would break things, for example:

- Your origin serves its own Let's Encrypt certificate; proxying would require also setting up Cloudflare-side TLS.
- The destination is `192.168.x.x` (private IP). Cloudflare auto-flags this as "reserved IP" and forces DNS only.
- ACME-challenge TXT records used for Let's Encrypt validation. These must be readable verbatim by the issuing CA; proxying breaks the challenge.

## DNS record precedence: specific over wildcard

If you have both `*.example.com -> A` and `mcp.example.com -> B`, a lookup for `mcp.example.com` returns B. The more-specific record wins. This is standard DNS behavior, not a Cloudflare thing.

It matters in practice because `cloudflared tunnel route dns` creates a specific record for the tunneled hostname, which overrides any wildcard catch-all already in the zone. No need to delete the wildcard.

## DNSSEC during migration

If your old DNS provider had DNSSEC enabled, the parent zone (TLD) holds a DS record matching the old provider's signing key. When you migrate to a new provider, that signing key changes. Resolvers that validate DNSSEC will reject your domain's responses because the signatures do not match the DS record.

**Disable DNSSEC at the old provider before migrating.** After the migration completes, you can re-enable DNSSEC at the new provider, which will publish a new DS record. Cloudflare specifically warns about this during the "Add a site" flow.

For most small projects, DNSSEC adds little value if your sites already use HTTPS (TLS protects the connection regardless of DNS spoofing). Leaving it off is a sensible default.

## Common misconceptions

- **"DNS Powered by Cloudflare means I'm on Cloudflare DNS."** No. It means your current DNS provider rents Cloudflare's anycast infrastructure. Different thing.
- **"Propagation is fundamentally slow."** It is not. It is caches expiring. If everyone had TTL=1, propagation would feel instant. The slowness is a chosen tradeoff (lower TTL = more queries = more load on authoritative servers).
- **"Changing nameservers loses my records."** Only if you forget to recreate them at the new provider before the switch. The records are not in the registry; they are at whichever nameservers your domain currently points to.
- **"DNSSEC always makes DNS safer."** It only prevents cache-poisoning of unencrypted DNS. HTTPS already protects the connection regardless.
- **"Subdomain records need to live at the subdomain's registrar."** No. All records under a zone (apex + subdomains) live at the zone's authoritative DNS.

## When this matters in practice

- **Setting up Cloudflare Tunnel** (or any service that needs control over DNS records, like Vercel previews or Render custom domains): the apex domain must be on the matching provider's authoritative DNS. Trying to run Tunnel while DNS lives elsewhere fails at the "create DNS record" step.
- **Verifying a migration:** when the dashboard says "waiting," DoH gives you ground truth.
- **Diagnosing a missing subdomain:** check whether the record exists at the *authoritative* nameservers, not just at the registrar's UI (if those are different places).
- **Reducing migration downtime:** lower TTLs on critical records 48 hours BEFORE switching nameservers, so caches refresh under the new TTL. Reduces the "old answers still cached" window after the migration.

## Further reading

- [How DNS works (interactive)](https://howdns.works) - a friendly comic-style walkthrough.
- [RFC 1034 - Domain Names: Concepts and Facilities](https://datatracker.ietf.org/doc/html/rfc1034) - the original spec.
- [Cloudflare docs: Add a site](https://developers.cloudflare.com/dns/zone-setups/full-setup/) - the canonical instructions.
- Cross-link: [docs/research/cloudflare-tunnel.md](../research/cloudflare-tunnel.md) - tunnel-specific facts that build on this learning.
