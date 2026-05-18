# Research: claude.ai Custom Connector OAuth Requirements

**Sources:**
- https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp (UI walkthrough)
- https://support.claude.com/en/articles/11503834-build-custom-connectors-via-remote-mcp-servers (redirect stub, content moved)
- https://claude.com/docs/connectors/building/authentication (authoritative auth detail)

**Retrieved:** 2026-05-18
**Plan tier verified:** Pro / Max (single-user). Connector UI flow under "Customize > Connectors".

This is the most operationally critical doc for the Tasklog MCP server. It defines what claude.ai expects on the auth side and what redirect URI we have to allow-list. Get this wrong and the connector simply does not connect from claude.ai web or mobile.

---

## Auth schemes claude.ai supports

From the authentication doc:

> "oauth_dcr" | "oauth_cimd" | "oauth_anthropic_creds" | "custom_connection" | "none"

What each one means:

| Scheme | Description | Server side requirement |
|---|---|---|
| `oauth_dcr` | OAuth 2.1 with RFC 7591 Dynamic Client Registration | Server exposes `/register` endpoint; claude.ai auto-registers itself on first connection. |
| `oauth_cimd` | OAuth Client ID Metadata Document | Server publishes a metadata doc describing itself as a client. Higher-traffic use case. |
| `oauth_anthropic_creds` | Anthropic-issued credentials | Anthropic gives you a Client ID/Secret for their MCP directory; you allow-list them. |
| `custom_connection` | Custom connection method | Reserved; not documented here. |
| `none` | No authentication | Use only if the data is intentionally public. Tasklog tasks are personal so this is wrong for us. |

### What claude.ai does NOT support (web/mobile UI)

> "User-pasted bearer tokens (static_bearer) are not yet supported."

> "Tokens or API keys passed in the connector URL (for example, ?token=, ?apiKey=, or ?userToken= query parameters) are not supported."

So: we cannot ship a static "paste this token in the connector setup" path. OAuth is the only path that works.

(Note: Claude Code CLI and Claude Desktop do support bearer-token auth via headers. That is separate from the web/mobile connector UI we are targeting.)

### Recommended scheme for Tasklog

`oauth_dcr` - DCR-based OAuth. We host an OAuth 2.1 authorization server that exposes a `/register` endpoint. When you tap "Connect" on the Tasklog connector in claude.ai for the first time, claude.ai auto-registers itself as a client. No manual client ID/secret entry.

Caveat from the docs:

> "For servers expecting high traffic from the directory, prefer CIMD or oauth_anthropic_creds over DCR. DCR causes Claude to register a new client on every fresh connection."

Single-user / single-device: DCR re-registration overhead is negligible. We will use DCR.

---

## OAuth flow specifics

### Redirect URI to allow-list

Verbatim:

> "https://claude.ai/api/mcp/auth_callback"

This is the only redirect URI claude.ai uses for web and mobile connectors. Our authorization server must accept (and only accept) this exact value as the registered `redirect_uri` for the claude.ai client. Note: same URI for web and mobile - mobile apps round-trip through the web flow in an embedded browser.

(For reference: Claude Code CLI uses a loopback URI like `http://localhost:3118/callback` where the port varies per session. That is a different client and we do not need to support it unless we also want CLI access.)

### PKCE requirement (mandatory, S256 only)

> "Claude includes a PKCE code_challenge with code_challenge_method=S256 on every authorization request."

> "Your authorization server must support S256 PKCE, and the MCP authorization spec requires it to advertise 'code_challenge_methods_supported': ['S256']"

So our `/.well-known/oauth-authorization-server` metadata MUST include:

```json
{
  "code_challenge_methods_supported": ["S256"]
}
```

And our `/token` endpoint MUST validate the `code_verifier` against the stored `code_challenge`.

### Scope handling

Scopes are advertised by the resource server through the 401 challenge:

> "To control which scopes Claude requests, include a scope parameter in the WWW-Authenticate header on your 401 response."

For Tasklog MVP a single broad scope (e.g. `tasklog:rw`) is sufficient - one user, one connector, no need for fine-grained scope splits.

---

## Token handling

### Format

The doc does not mandate JWT vs opaque tokens. The choice is the server's. JWT is convenient because validation does not require a DB lookup; opaque tokens are simpler to revoke. For Tasklog single-user, opaque tokens stored in SQLite are fine and avoid a JWT library dependency.

### Transmission

Implied (and required by the MCP spec, which Tasklog also obeys): `Authorization: Bearer <token>` header on every MCP request.

### Refresh

> "Claude refreshes tokens reactively on a 401 response, with a proactive refresh up to five minutes before the stored expiry."

So:
- Access tokens SHOULD be short-lived (the MCP spec also says so). Recommend 15-60 minutes.
- Refresh tokens MUST be issued and accepted.
- When an access token expires, claude.ai gets a 401, then exchanges the refresh token at `/token` to get a new access token.

### Refresh token rotation (required for public clients)

> "Rotate refresh tokens for public-client connections. DCR and CIMD register Claude as a public client, and the MCP authorization spec adopts OAuth 2.1's requirement to rotate or sender-constrain refresh tokens for public clients."

So on every successful refresh token exchange we MUST issue a new refresh token and invalidate the old one.

### Error codes (RFC 6749)

> "Return RFC 6749-compliant error codes (invalid_grant, not invalid_request or a custom code) when a refresh token is no longer valid"

Token endpoint error responses must use the standard OAuth error codes (`invalid_grant`, `invalid_request`, `invalid_client`, `unauthorized_client`, `unsupported_grant_type`, `invalid_scope`). Custom codes will cause claude.ai to misbehave on token refresh.

### Token endpoint content-type

> "Your /token endpoint must accept Content-Type: application/x-www-form-urlencoded per RFC 6749 section 4.1.3."

Not JSON. Form-encoded. Most OAuth libraries handle this transparently.

---

## Mobile compatibility

The retrieved documents do not explicitly call out mobile. But:
- The redirect URI `https://claude.ai/api/mcp/auth_callback` is a web URL, used by the mobile app via an embedded browser (typical OAuth pattern on iOS/Android).
- The Pro/Max plan connector setup flow is documented on the same support pages we use for web.

**Working assumption:** the same connector definition works for both web and mobile. To be verified at `/execute` time by actually adding the connector and testing from the iOS/Android Claude app.

---

## UI walkthrough (Pro/Max plan, single-user)

1. Navigate to **Customize > Connectors** in claude.ai.
2. Click **+**, select **Add custom connector**.
3. Enter the **remote MCP server URL** (e.g. `https://mcp.example.com/mcp`).
4. Optional **Advanced settings**: OAuth Client ID and OAuth Client Secret. With DCR these stay blank.
5. Click **Add**.

---

## Server checklist (Tasklog-specific)

Distilled from the above, what the Tasklog OAuth/MCP server must do:

- [ ] Expose `/.well-known/oauth-protected-resource` (RFC 9728) on the MCP server origin.
- [ ] Expose `/.well-known/oauth-authorization-server` (RFC 8414) advertising:
  - `issuer`
  - `authorization_endpoint`
  - `token_endpoint`
  - `registration_endpoint` (DCR)
  - `code_challenge_methods_supported: ["S256"]`
  - `grant_types_supported: ["authorization_code", "refresh_token"]`
  - `response_types_supported: ["code"]`
  - `token_endpoint_auth_methods_supported: ["none"]` (public clients)
- [ ] Implement `POST /register` (RFC 7591). Accept claude.ai's registration request, persist client_id, return per-RFC response. Allow-list the redirect URI `https://claude.ai/api/mcp/auth_callback`.
- [ ] Implement `GET /authorize`. Show a user login (e.g. via GitHub upstream OR a single hardcoded password), then redirect to claude.ai callback with the auth code.
- [ ] Implement `POST /token` accepting `application/x-www-form-urlencoded`. Handle two grant types: `authorization_code` (with PKCE verifier check) and `refresh_token` (with rotation).
- [ ] Issue access tokens with audience claim = our canonical MCP server URI.
- [ ] Issue rotating refresh tokens.
- [ ] Use RFC 6749 error codes for all error responses.
- [ ] On token-required MCP request without/with-invalid token: respond 401 with `WWW-Authenticate: Bearer realm="...", resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource", scope="..."`.

---

## Open questions / gaps

1. **Authentication step UI** - claude.ai's `/authorize` UI is OUR responsibility. Open question: do we authenticate the user via GitHub OAuth (upstream), a Google OAuth, a hardcoded password, or magic-link email? Recommendation TBD in plan. Single-user simplest: a hardcoded password set via env var on the phone, validated server-side. GitHub upstream is nicer UX but adds a dependency.
2. **Scope vocabulary** - claude.ai will display scopes in the consent prompt. Single broad scope like `tasklog:rw` is fine for MVP. If we ever differentiate read-only vs write, revisit.
3. **Token storage** - SQLite alongside the existing Tasklog DB, or a separate file. SQLite is fine; choose during plan.
4. **Library choice** - `mcp-auth` (Node), Cloudflare's `workers-oauth-provider` (Workers), or hand-roll. Cloudflare's lib is for Workers runtime, not bare Node; not directly applicable. `mcp-auth` is Node-native. We will evaluate before plan.
5. **Mobile flow verification** - confirmed only by assumption above. Verify by trying it once during `/execute`.
