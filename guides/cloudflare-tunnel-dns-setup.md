# Cloudflare DNS Migration (Prep for Tunnel)

**Last updated:** 2026-05-18

How `manudubey.in` was migrated from Porkbun DNS to Cloudflare DNS so that Cloudflare Tunnel could later route `mcp.tasklog.manudubey.in` to the phone home-server. Done as Step 0 of the [MCP server feature plan](../docs/plans/P50-mcp-server.md).

## How this all fits together

Cloudflare Tunnel needs Cloudflare to be the authoritative DNS provider for the zone you want to expose. Tunnel creates magic "hostname -> tunnel UUID" routing inside Cloudflare's edge network, which is only possible if Cloudflare's nameservers are the ones answering DNS queries for that hostname.

```
Before migration:
  registrar          Porkbun
  authoritative DNS  Porkbun (using Cloudflare anycast infra under the hood)
  records managed    Porkbun dashboard

After migration:
  registrar          Porkbun (unchanged)
  authoritative DNS  Cloudflare
  records managed    Cloudflare dashboard
```

The domain stays registered at Porkbun. Only the **authoritative nameserver delegation** moves. See [docs/learnings/dns-and-nameservers.md](../docs/learnings/dns-and-nameservers.md) for the underlying concepts.

## Prerequisites

- A domain you control (we used `manudubey.in`, registered at Porkbun).
- Registrar account access to change nameservers.
- A Cloudflare account (free plan is sufficient for Tunnel + DNS).

## Walkthrough

### 1. Sign up at Cloudflare

[cloudflare.com](https://cloudflare.com), free plan, basic signup. Email confirmation, done.

### 2. Add the site to Cloudflare

In the Cloudflare dashboard: **Websites -> Add a site -> Enter "manudubey.in"** -> choose Free plan -> Continue.

Cloudflare scans your current DNS at the existing provider (Porkbun in our case) and shows you the records it found. Click **Continue**.

### 3. Verify the import (CRITICAL - Cloudflare's scan misses records)

After import, Cloudflare shows the records in its DNS panel. **Compare against the source-of-truth list at your old provider.**

For `manudubey.in` specifically, Cloudflare's auto-scan imported 12 of 15 records. It missed three A records that did not follow common subdomain patterns:

- `tasklog.manudubey.in -> 34.29.85.225` (GCP)
- `tasklog.home.manudubey.in -> 192.168.1.51` (LAN)
- `tasklog-business.manudubey.in -> 34.131.53.130` (other GCP)

**Why this matters:** these records ALSO match the wildcard `*.manudubey.in -> pixie.porkbun.com`, which Cloudflare DID import. If you switch nameservers without the specific records, the wildcard takes over and your subdomains break. `tasklog.manudubey.in` would silently start resolving to `pixie.porkbun.com`, taking down the live demo site.

Always cross-check the import against the old provider's full list. Always.

### 4. Manually add missing records

Click "Add record" in the Cloudflare DNS panel for each missing record. Set them to **DNS only** (not Proxied) if the destination is:

- A backend that serves its own TLS (like a GCP VM with its own cert).
- An RFC 1918 private IP (Cloudflare cannot proxy private addresses; it auto-flags this).
- Any service you want to keep direct (no CDN, no DDoS protection).

For Tasklog:

| Name | Type | Value | Proxy |
|---|---|---|---|
| `tasklog` | A | `34.29.85.225` | DNS only |
| `tasklog.home` | A | `192.168.1.51` | DNS only (Cloudflare auto-flagged "reserved IP") |
| `tasklog-business` | A | `34.131.53.130` | DNS only |

### 5. Fix proxy status on imported records

Cloudflare imports records as **Proxied** by default. Review each:

| Record | Imported as | Final state |
|---|---|---|
| GitHub Pages A records (apex) | Proxied | Keep Proxied. GitHub Pages works behind Cloudflare CDN. |
| `www -> hydrainsurgent.github.io` CNAME | Proxied | Keep Proxied. Same reason. |
| `* -> pixie.porkbun.com` CNAME | Proxied | **Change to DNS only.** Porkbun's URL forwarding does its own redirect handling; routing it through Cloudflare's proxy may interfere. |
| `_acme-challenge` TXT records | DNS only | Keep DNS only. Let's Encrypt validation needs the raw value, not a proxied response. |

### 6. Verify DNSSEC is off at the old provider

If DNSSEC is enabled at the old provider, the parent zone (TLD registry) has a DS record matching the old signing key. After migration that key no longer exists, and DNSSEC-aware resolvers reject responses.

For Porkbun: Domain Management -> the DNSSEC section. Confirm:

- "Registry DNSSEC: 0 records" (nothing published at the .in TLD).
- "Porkbun DNSSEC" toggle: off.

If anything is on, disable it BEFORE step 7.

### 7. Change nameservers at the registrar

Cloudflare shows you 2 nameservers in the dashboard. For our migration these were `rudy.ns.cloudflare.com` and `marlowe.ns.cloudflare.com` (the specific names are randomly assigned per zone). At Porkbun:

- Domain Management -> manudubey.in -> Authoritative Nameservers.
- Delete the 4 existing Porkbun nameservers.
- Add the 2 Cloudflare ones.
- Save.

### 8. Wait for propagation

Cloudflare emails when the change is detected (typically 10 to 60 minutes; can be hours).

To verify manually:

```bash
curl -s "https://dns.google/resolve?name=manudubey.in&type=NS" | python3 -m json.tool
```

When the `Answer` array contains entries with `*.ns.cloudflare.com`, propagation has reached Google's resolvers. Cloudflare will follow shortly.

### 9. Verify nothing broke

Walk through every previously-working subdomain:

```bash
for sub in "manudubey.in" "www.manudubey.in" "tasklog.manudubey.in" "tasklog-business.manudubey.in" "tasklog.home.manudubey.in"; do
  echo "--- $sub ---"
  curl -s "https://dns.google/resolve?name=$sub&type=A" | python3 -c "import sys,json; d=json.load(sys.stdin); ans=d.get('Answer', []); print('\n'.join(f\"{a['type']} {a['data']}\" for a in ans) if ans else 'NO ANSWER')"
done
```

Then a quick HTTPS reachability check on the proxied / public ones:

```bash
for url in "https://manudubey.in/" "https://www.manudubey.in/" "https://tasklog.manudubey.in/"; do
  echo "--- $url ---"
  curl -sI -L --max-time 10 "$url" | head -3
done
```

Expected after our migration:

- `manudubey.in` and `www.manudubey.in`: resolve to Cloudflare edge IPs (`104.21.x.x`, `172.67.x.x`), serve HTTP 200 / 301 (GitHub Pages via Cloudflare proxy).
- `tasklog.manudubey.in`: resolves directly to `34.29.85.225`, HTTP 200 with nginx headers (GCP demo, direct via DNS only).
- `tasklog-business.manudubey.in`: resolves to `34.131.53.130` direct.
- `tasklog.home.manudubey.in`: resolves to `192.168.1.51` (only works on the home LAN).

Note that the apex resolves to different IPs than before (Cloudflare edge instead of GitHub Pages IPs). That is the proxy doing its job. Sites still work.

## Day-to-day commands

Check NS records:

```bash
curl -s "https://dns.google/resolve?name=manudubey.in&type=NS" \
  | python3 -c "import sys,json; print('\n'.join(a['data'] for a in json.load(sys.stdin).get('Answer', [])))"
```

Check a specific subdomain:

```bash
curl -s "https://dns.google/resolve?name=tasklog.manudubey.in&type=A"
```

## Troubleshooting

**"Cloudflare keeps saying waiting":** the change has not propagated to Cloudflare's resolver yet. Wait. If it has been more than 24 hours, double-check at the registrar that the nameservers actually saved (Porkbun shows a confirmation banner that is easy to miss).

**"My subdomain does not resolve anymore":** check the Cloudflare DNS panel for that exact subdomain name. If it is not there, Cloudflare's import missed it; add it manually (step 4).

**"My GCP backend gives a TLS error":** the record is probably Proxied; Cloudflare's TLS does not match what your backend serves. Switch the record to DNS only.

**"Let's Encrypt renewal is failing":** check that `_acme-challenge` TXT records are DNS only, not Proxied. Proxying breaks the validation challenge.

**"I deleted a record by accident":** add it back from a screenshot of the old provider's list (this is why you take screenshots before migrating).

## Migrating another domain in the future

The same flow applies to any future domain. If you ever want to add (say) `someotherproject.com`:

1. Add the site to Cloudflare.
2. Verify the import against the old provider's record list.
3. Add any missed records manually.
4. Fix proxy status on records that should be direct.
5. Confirm DNSSEC is off at the old provider.
6. Update nameservers at the registrar.
7. Verify.

The "scan misses records" caveat applies every time. Always verify against the source list before switching nameservers.

## See also

- [docs/learnings/dns-and-nameservers.md](../docs/learnings/dns-and-nameservers.md) - the underlying concepts (registrar vs nameservers vs DNS provider, DoH, proxy vs DNS only).
- [docs/research/cloudflare-tunnel.md](../docs/research/cloudflare-tunnel.md) - what we use this DNS setup FOR.
- [docs/plans/P50-mcp-server.md](../docs/plans/P50-mcp-server.md) - the feature plan this was part of.
