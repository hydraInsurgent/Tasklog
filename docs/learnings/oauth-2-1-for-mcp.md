# OAuth 2.1 (especially for MCP servers)

**Last updated:** 2026-05-19 - first encountered in MCP server feature (P50, 2026-05)

OAuth 2.1 is the protocol any MCP server that wants to be reached from claude.ai web/mobile must implement. It is also the same protocol behind "Sign in with Google", "Connect to GitHub", and most third-party API authorization on the web. Understanding it gives you a transferable mental model for nearly every modern auth integration. This learning captures the parts you need to actually build an OAuth 2.1 authorization server, with specific notes for the MCP context.

## Mental model

OAuth solves one problem: **letting a third-party application access your data without giving it your password.** Pre-OAuth, you'd hand "Mailchimp" your Google password so it could read your contacts. Bad. Post-OAuth, you click "Connect Google," Google asks you "OK to let Mailchimp see your contacts?", and Google issues Mailchimp a token. Your password never leaves Google.

The token is scoped (read-only, contacts only, etc.) and revocable. If Mailchimp gets breached, the leak is the token; revoke it and you are done. Compare to a leaked password: change everywhere.

## The four roles

OAuth's vocabulary names four distinct actors, and confusing them is the #1 source of OAuth bugs:

| Role | English name | What it does | In Tasklog MCP |
|---|---|---|---|
| **Resource owner** | "the user" | The human whose data we are protecting | You (`hydraInsurgent`) |
| **Resource server** | "the data API" | Holds the data; accepts access tokens; returns 401 if absent/invalid | The `/mcp` endpoint |
| **Authorization server** | "the issuer" | Authenticates the user, issues tokens to clients | Also us (we host AS + RS in the same process) |
| **Client** | "the app wanting access" | Requests tokens on the user's behalf | claude.ai |

The AS and RS CAN be the same process (we co-locate them). They CAN also be separate (Google Identity issues tokens for various Google API services). The protocol does not care.

## The flow at 10,000 feet

```
1. claude.ai opens our /authorize URL in your browser
2. We authenticate you (we delegate to GitHub upstream OAuth here)
3. We redirect you back to claude.ai with an authorization code
4. claude.ai's backend POSTs the code to our /token endpoint
5. We give claude.ai an access_token and a refresh_token
6. claude.ai includes the access_token as `Authorization: Bearer ...` on every /mcp call
7. We validate the token on each call before processing the request
```

The dance is more elaborate than "give me a token" because two security goals constrain it:

- **The user is in control.** The user must consent (step 2) and can revoke later. The client cannot get a token without user consent.
- **The token cannot be stolen mid-flight.** The "authorization code" in step 4 is exchanged using a back-channel (server-to-server POST), not the front-channel browser redirect. Even if an attacker captures the code via redirect URL, they cannot exchange it without the client secret (or PKCE verifier, see below).

## The flow at 100 feet

```
claude.ai                  Browser                 Tasklog MCP              GitHub
    |                         |                         |                     |
    |  open /authorize  ----->|---- GET /authorize ---->|                     |
    |  (with code_challenge)  |                         |                     |
    |                         |<-- HTML with btn -------|                     |
    |                         |                         |                     |
    |                         |---click "Log in"------->|                     |
    |                         |<-- 302 to GitHub -------|                     |
    |                         |---- /authorize -------------------------->|
    |                         |<-- consent screen ------------------------|
    |                         |--- approve ------------------------------>|
    |                         |<-- 302 to /auth/github/callback ----------|
    |                         |---/auth/github/callback?code=...&state=...|
    |                         |     ----------> Tasklog MCP --------------|
    |                         |                         |                     |
    |                         |       (Tasklog MCP -> GitHub token exchange)  |
    |                         |                         |---- POST token ---->|
    |                         |                         |<--- access_token ---|
    |                         |                         |---- GET /user ----->|
    |                         |                         |<--- { login } ------|
    |                         |                         |                     |
    |                         |             (allow-list check + mint our code)|
    |                         |                         |                     |
    |                         |<-- 302 to claude.ai/auth_callback?code=---|
    |    <-------- code -------------------------------------------|
    |                                                                         |
    |  POST /token  ---------------------------------------> Tasklog MCP      |
    |  (code + code_verifier + redirect_uri + client_id)                      |
    |                                                                         |
    |  <-- access_token + refresh_token --------------------|                  |
    |                                                                         |
    |  POST /mcp with Authorization: Bearer <token>  -----> Tasklog MCP       |
    |  <-- tools/list, tools/call response  ---------------|                   |
```

Note there are TWO OAuth flows on this diagram: claude.ai talking to us (lifetime of the connector), and us talking to GitHub (one-shot during login). Both are OAuth 2.1.

## PKCE (Proof Key for Code Exchange) - RFC 7636

The middle-eight of modern OAuth. Solves: "what if the authorization code gets intercepted between the redirect and the token exchange?"

The dance:

1. Client (claude.ai) generates a random secret `code_verifier`.
2. Client hashes it with SHA-256 and base64url-encodes the digest: `code_challenge`.
3. Client includes `code_challenge` and `code_challenge_method=S256` in the /authorize URL.
4. Server stores `code_challenge` alongside the issued auth code.
5. Client POSTs the auth code AND the original `code_verifier` to /token.
6. Server hashes the verifier with SHA-256, compares to the stored `code_challenge`. Match: issue tokens. Mismatch: reject.

The attacker who captures the auth code in transit cannot complete step 5 because they do not have the verifier. The verifier never travels in a URL or a cookie - only over the back-channel POST.

OAuth 2.1 makes PKCE mandatory (in OAuth 2.0 it was optional, used mainly by SPAs and mobile apps). The MCP spec inherits this requirement, and claude.ai specifically advertises that the authorization server MUST advertise `code_challenge_methods_supported: ["S256"]` in its metadata.

## Dynamic Client Registration (DCR) - RFC 7591

OAuth's traditional flow assumes the client is pre-registered with the authorization server (you go to Google Cloud Console, register your app, get a `client_id` and `client_secret`, paste them into your code). For widely-deployed MCP clients (claude.ai connecting to many third-party MCP servers), this would require every server author to wait for claude.ai to manually register before the connector works.

DCR fixes this. The client POSTs a JSON registration to the server's `/register` endpoint, declares its `redirect_uris` and `grant_types`, and gets back a `client_id`. No human in the loop on the server side.

For public clients (no client secret, PKCE-based auth), DCR is straightforward: we issue a `client_id` and remember the registered `redirect_uris`. claude.ai's first connect triggers DCR; subsequent connects reuse the same `client_id` (or re-register, depending on its policy).

The MCP authorization spec recommends DCR (SHOULD). Servers without DCR are still allowed but require manual `client_id` / `client_secret` configuration in claude.ai's connector UI.

## The "upstream IdP" pattern

Most authorization servers do not implement username/password authentication themselves. They delegate to an "upstream IdP" (identity provider). For Tasklog MCP, that's GitHub.

In this pattern, we play **two OAuth roles simultaneously**:

- **As OAuth server**: we issue our own tokens to claude.ai after the user authenticates.
- **As OAuth client of GitHub**: we redirect the user to GitHub, GitHub authenticates them, GitHub gives us a one-shot access token, we read the user's identity, then throw the GitHub token away. We do NOT pass the GitHub token through to claude.ai - that would be a token-passthrough vulnerability the MCP spec explicitly forbids.

Once we know the user's identity (their GitHub `login`), we check it against an env-var allow-list. If they pass, we mint our own access token. The GitHub round-trip is essentially: "trust GitHub to tell us who they are, then forget GitHub."

This pattern shows up everywhere: "Log in with Google" sites that issue their own session cookies, custom OAuth servers backed by SSO, etc.

## Token audience binding (RFC 8707)

When you issue an access token, it must be intended for a specific resource. The token carries an `audience` claim (in JWT) or audience metadata (in our opaque-token DB row). When the resource server receives the token, it validates that the audience matches its own canonical URI before processing the request.

Without audience binding, a token issued for `mcp.tasklog.example.com` could be replayed against `mcp.album-to-movies.example.com` if both share an authorization server. The MCP spec mandates audience validation to prevent this; the `resource` parameter in `/authorize` and `/token` is the client's declaration of which resource the token is for.

For Tasklog MCP: we set `audience = MCP_PUBLIC_URL` on every issued token, and the `/mcp` Bearer middleware rejects tokens with a non-matching audience.

## Refresh token rotation (public clients)

Access tokens are short-lived (we use 1 hour). When they expire, the client uses a long-lived `refresh_token` to get a new pair without re-prompting the user.

For **public clients** (which is what claude.ai is, and what the MCP spec assumes), OAuth 2.1 requires **rotation**: every time a refresh token is exchanged, the server issues a new refresh token AND invalidates the old one. Why: if a refresh token leaks, a one-shot use by the attacker would invalidate the legitimate client's token too, making the breach detectable (the client suddenly gets `invalid_grant` and has to re-auth).

In our implementation, `refreshTokens.consume()` is a SQLite transaction that reads + deletes in one step. Attempting to re-use the old refresh token after a successful rotation returns 404 (invalid_grant).

## OAuth 2.1 vs 2.0: what changed

OAuth 2.1 is a draft that consolidates ~10 years of OAuth security best practices into one document. Key differences from 2.0:

- **Implicit grant removed.** Used to be the SPA flow ("token comes back in the URL fragment"). Replaced by authorization code + PKCE.
- **Password grant removed.** Used to be "the client asks the user for their password and forwards it." Always a bad pattern; gone.
- **PKCE mandatory** for authorization code flow (was optional in 2.0).
- **Refresh token rotation required** for public clients.
- **Exact redirect URI matching required.** No wildcards, no substring matches.

If your mental model is "OAuth 2.0 minus the bad parts," that's exactly right.

## Common misconceptions

- **"Client ID and Client Secret are user credentials."** No. They identify the *application* to the authorization server. Users never see them. Confusing them with passwords is the most common OAuth bug. See [docs/learnings/github-oauth-vs-github-apps.md](github-oauth-vs-github-apps.md) for the longer version.
- **"PKCE replaces the client secret."** Only for public clients (mobile apps, SPAs, MCP clients like claude.ai that have no safe place to store a secret). Confidential clients (server-side apps) still use client_secret AND PKCE.
- **"Access tokens are JWTs."** Sometimes. They can also be opaque random strings looked up in a DB. Both are spec-compliant. We use opaque for Tasklog MCP because it's simpler and easy to revoke.
- **"The state parameter is for the application's use."** It's a CSRF protection mechanism. The client generates random state, server echoes it back, client verifies match. Forgetting this enables CSRF attacks on the OAuth flow.
- **"Refresh tokens can be used indefinitely."** No. They expire (we use 30 days) and rotate. After a long absence, the user re-authenticates.
- **"Authorization codes are tokens."** They are not. They are one-shot exchange certificates with seconds-to-minutes lifetimes, intended only to be exchanged at /token.
- **"OAuth is authentication."** OAuth is authorization. The authorization server may authenticate users as part of the flow, but the protocol's purpose is to authorize token issuance, not to identify users. (OpenID Connect builds an identity layer on top of OAuth.)

## When this matters in practice

- **Building an MCP server** to plug into claude.ai web or mobile: OAuth 2.1 with DCR + PKCE S256 + audience binding is the minimum.
- **Building a "Sign in with X" feature**: OAuth client side. You are claude.ai in the dance.
- **Building a B2B integration**: confidential client (with client_secret), no DCR, server-side token storage.
- **Building a mobile app that calls your own API**: public client, PKCE-based, similar to the MCP setup but you control both sides.
- **Diagnosing "redirect_uri mismatch"**: the server stored a specific URI at client registration; the OAuth client sent something different. Spec requires exact match.
- **Debugging "invalid_grant"**: usually one of: code expired, code reused, PKCE verifier mismatch, redirect_uri does not match the auth code, or refresh token already rotated. Server logs should distinguish these.

## Real-world claude.ai connector quirks (from the Tasklog MCP build)

These are NOT in the OAuth 2.1 spec or the MCP authorization spec - they are observed behaviors of the claude.ai web connector that any MCP server author must accommodate. Each one cost real debugging time during P50; they are written down so future builds (or anyone else building against claude.ai) can skip the same pain.

### 1. `/authorize` MUST 302-redirect to the upstream IdP immediately

claude.ai opens `/authorize` in a connector popup and expects an **immediate** `302 Location: <upstream-idp-url>`. If the server instead returns a `200 text/html` page (a branded "Click here to log in" interstitial), the popup never advances to the IdP - the user sees "Authorization with the MCP server failed" with no GitHub screen ever opening.

**Why:** the connector flow is automated; it does not render arbitrary HTML in the popup, it follows redirects.

**Implication:** any branded consent / disclosure you want to show the user must happen either (a) before the connector add (in your docs) or (b) at the upstream IdP (GitHub already has a consent screen). Don't add an interstitial.

### 2. The `resource` parameter has a trailing slash

claude.ai sends `resource=https://your-mcp.example.com/` (with a trailing `/`). Our `MCP_PUBLIC_URL` is canonicalized without the slash. Strict string equality on audience checking (`token.audience !== publicUrl`) rejects every token we just issued.

**Fix:** normalize both sides before comparing - strip the trailing slash on either the stored audience or the configured public URL. RFC 3986 URI equivalence permits this.

### 3. The MCP-Protocol-Version header carries a *future* version

claude.ai sends `mcp-protocol-version: 2025-11-25` on every request after initialize. At the time of this build the latest published MCP spec version was `2025-06-18`. The SDK accepts the newer version internally (via the JSON-RPC initialize negotiation), but if your middleware enumerates "supported versions" against the spec you know about, every post-initialize request 400s.

**Fix:** at the HTTP layer, validate the *format* of the version (regex for `YYYY-MM-DD`), not its membership in a hard-coded set. Let the SDK decide what's actually supported - it negotiates during `initialize`, which is the spec-correct place. (Spec says servers MUST return 400 on unsupported versions, but "unsupported" is defined by what the SDK accepts, not by the human in the loop.)

**Generalization:** for any rapidly-evolving spec consumed via a third-party SDK, prefer format validation over enumeration. The SDK is the source of truth.

### 4. claude.ai does NOT echo `Mcp-Session-Id`

The MCP spec lets the server choose stateful or stateless. If stateful, the server returns `Mcp-Session-Id` on the initialize response; the client MUST echo it on subsequent requests, or the spec says the server SHOULD return 400.

claude.ai's connector treats MCP endpoints as **stateless** - it never carries the session id forward. In stateful mode you get a successful initialize followed by 400 on every tools/list, tools/call. Symptom in the UI: "Couldn't reload tools from the server."

**Fix:** stateless mode. With `@modelcontextprotocol/sdk` (Node), that means **per-request** `McpServer` + transport:

```typescript
app.post('/mcp', async (c) => {
  const server = createMcpServerForRequest();  // fresh server, re-registers tools
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,  // stateless
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(c.req.raw);
  } finally {
    await transport.close();
    await server.close();
  }
});
```

Cost: ~16 tool handler bindings per request. In practice negligible (<1ms). Trying to reuse a single stateless transport across requests is what the SDK refuses ("Stateless transport cannot be reused across requests. Create a new transport per request.").

### 5. Always run request + header logging from day one

In each of the four failures above, the root cause was *one specific request header* claude.ai was sending. Without per-request logging of method + path + relevant headers (`accept`, `content-type`, `mcp-protocol-version`, `mcp-session-id`, `origin`, `authorization`), every failure looked the same from outside: "Authorization with the MCP server failed" or "Couldn't reload tools." Half a day of guessing.

**Rule:** the first middleware you mount on an MCP server should log the request line + the diagnostic headers. Keep it in production - the cost is negligible, the time it saves on the next debugging session is huge.

```typescript
app.use('*', async (c, next) => {
  const start = Date.now();
  console.log(`[req] ${c.req.method} ${c.req.path}`);
  if (c.req.path === '/mcp' && c.req.method === 'POST') {
    const interesting = ['accept', 'content-type', 'mcp-protocol-version', 'mcp-session-id', 'origin'];
    console.log(`[req-hdrs] ${interesting.map(h => `${h}=${c.req.header(h) ?? '-'}`).join(' ')}`);
  }
  await next();
  console.log(`[res] ${c.req.method} ${c.req.path} ${c.res.status} ${Date.now() - start}ms`);
});
```

## Configuration in common stacks

| Stack | Library | Notes |
|---|---|---|
| Node | `mcp-auth`, `@panva/oauth4webapi`, or hand-roll | Hand-roll is feasible for single-user servers; libraries add maintainability for multi-tenant. |
| Python | `authlib`, `oauthlib` | Mature; covers the AS side well. |
| Cloudflare Workers | `workers-oauth-provider` | Built for the Workers runtime; integrates with Durable Objects for state. |
| .NET | `IdentityServer` (now `Duende`) | Heavy but production-grade. |
| Go | `fosite` | The widely-used library; covers all RFCs. |

## Further reading

- [RFC 6749 - OAuth 2.0 Authorization Framework](https://datatracker.ietf.org/doc/html/rfc6749) - the base spec (most of 2.1 still references it).
- [OAuth 2.1 draft](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1-13) - the consolidated security best-practices document.
- [RFC 7636 - PKCE](https://datatracker.ietf.org/doc/html/rfc7636) - the proof key extension.
- [RFC 7591 - Dynamic Client Registration](https://datatracker.ietf.org/doc/html/rfc7591) - the DCR spec.
- [RFC 8414 - Authorization Server Metadata](https://datatracker.ietf.org/doc/html/rfc8414) - the metadata endpoint format.
- [RFC 9728 - Protected Resource Metadata](https://datatracker.ietf.org/doc/html/rfc9728) - how resource servers advertise their authorization servers.
- [RFC 8707 - Resource Indicators](https://datatracker.ietf.org/doc/html/rfc8707) - the `resource` parameter for audience binding.
- Cross-link: [docs/research/claude-ai-connector-oauth.md](../research/claude-ai-connector-oauth.md) - what claude.ai specifically requires.
- Cross-link: [docs/research/mcp-spec-2025-06-18.md](../research/mcp-spec-2025-06-18.md) - the authorization section of the MCP spec.
- Cross-link: [docs/learnings/github-oauth-vs-github-apps.md](github-oauth-vs-github-apps.md) - the Client ID / Client Secret pattern this learning relies on.
