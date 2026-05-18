# GitHub OAuth App Setup (Tasklog MCP)

**Last updated:** 2026-05-18

How we registered the GitHub OAuth App that the Tasklog MCP server uses as its upstream identity provider. Done as Step 0.5 of the [MCP server feature plan](../docs/plans/P50-mcp-server.md).

## How this all fits together

The Tasklog MCP server (running on the phone) is an OAuth authorization server to claude.ai. But it does not issue passwords or run a user database. Instead, it delegates "who is this user?" to GitHub via upstream OAuth. The user clicks **Log in with GitHub** on our authorize page, GitHub asks for consent, and we receive a verified GitHub identity in return. We check that identity against a one-name allow-list and proceed if it matches.

For this to work, we need a registered GitHub OAuth App that gives us a Client ID and Client Secret. The MCP server uses those to perform the OAuth code exchange with GitHub during the user login.

```
You (browser) -> /authorize on Tasklog MCP server
                    |
                    v
Tasklog MCP server -> github.com/login/oauth/authorize?client_id=...&redirect_uri=...
                    |
                    v
You log in to GitHub, approve scopes
                    |
                    v
github.com -> /auth/github/callback on Tasklog MCP server (with code)
                    |
                    v
Tasklog MCP server -> github.com/login/oauth/access_token (client_id + client_secret + code)
                    |
                    v
GitHub -> access token
                    |
                    v
Tasklog MCP server -> api.github.com/user (Bearer access token)
                    |
                    v
GitHub -> { login: "hydraInsurgent", ... }
                    |
                    v
Tasklog MCP server: matches allow-list, completes claude.ai's auth flow
```

See [docs/learnings/github-oauth-vs-github-apps.md](../docs/learnings/github-oauth-vs-github-apps.md) for why we chose OAuth Apps over GitHub Apps for this.

## Prerequisites

- A GitHub account.
- A password manager to store the Client Secret (we used KeePassXC).
- A planned MCP server URL (we used `https://mcp.tasklog.manudubey.in`). The URL does not need to be reachable at registration time; GitHub never visits it.

## Walkthrough

### 1. Navigate to the right page

Go to **github.com/settings/developers**.

The left sidebar shows three sections:

- GitHub Apps
- **OAuth Apps** -> we want this one
- Personal access tokens

Click **OAuth Apps**. Do NOT click GitHub Apps even though it sounds similar; they are a different product with a heavier setup and webhooks/permissions/installation lifecycle that we do not need. See [docs/learnings/github-oauth-vs-github-apps.md](../docs/learnings/github-oauth-vs-github-apps.md) for the distinction. We hit this gotcha during the first attempt and aborted before submitting the wrong form.

### 2. Create a new OAuth App

Click **New OAuth App** (top right).

Five fields to fill:

| Field | Value | Why |
|---|---|---|
| Application name | `Tasklog MCP` | Shown on the GitHub consent screen at login time. |
| Homepage URL | `https://mcp.tasklog.manudubey.in` | Required field; displayed on the consent screen. Does not need to be reachable yet. |
| Application description | `Tasklog MCP server for claude.ai connector` (optional) | Also shown on the consent screen. |
| Authorization callback URL | `https://mcp.tasklog.manudubey.in/auth/github/callback` | THE critical field. After GitHub finishes user auth, it redirects the browser to this URL with a code. Must match exactly what the MCP server expects. |
| Enable Device Flow | unchecked | We use the regular web auth code flow, not the device flow (which is for CLIs and devices without browsers). |

Click **Register application**.

### 3. Save the Client ID

On the next page, GitHub displays the **Client ID** prominently. This is semi-public, fine to use in URLs and frontend code. Copy it into your password manager entry's Notes field.

### 4. Generate and save the Client Secret

Click **Generate a new client secret**. GitHub shows the secret value **once, on this page**. Once you navigate away, it is gone - you can only regenerate, which invalidates the old one.

Copy the secret immediately into KeePassXC:

- **Title:** `Tasklog MCP - GitHub OAuth App`
- **Username:** GitHub username (`hydraInsurgent`)
- **Password:** the Client Secret value (hidden field, correct behavior)
- **URL:** the OAuth App settings page URL (so you can come back to manage it later)
- **Notes:** Client ID, creation date, callback URL, purpose

Save the database (Ctrl+S in KeePassXC).

### 5. Verify the save

Reload the OAuth App page. The Client ID is still shown; the Client Secret is replaced by a placeholder like "you cannot see this again." This confirms the one-shot display behaved as expected.

If you ever lose the Client Secret, you regenerate a new one on this page. The old one stops working immediately, so update the env vars on the phone (`GITHUB_CLIENT_SECRET`) before restarting the MCP server.

## Day-to-day operations

**Edit the callback URL:** OAuth App settings page -> Authorization callback URL field -> update -> save. No re-registration needed. Use this if the MCP server's domain ever changes.

**Rotate the Client Secret:** OAuth App settings page -> Generate a new client secret. Update the phone's env var to match before restarting the MCP server. Old secret stops working immediately.

**Revoke all user authorizations:** OAuth App settings page -> Advanced -> Revoke all user tokens. Every user who has consented re-authorizes on next login. Useful if the secret is compromised.

## Troubleshooting

**"redirect_uri_mismatch" error during OAuth flow:** the callback URL configured in the OAuth App does not exactly match what the MCP server is sending to GitHub. Even a trailing slash difference fails. Compare:

- The Authorization callback URL field on the OAuth App.
- The `redirect_uri` query parameter in the URL the browser opens at github.com/login/oauth/authorize.

**"bad_verification_code" error during token exchange:** the code expired (codes are short-lived, usually 10 minutes) or has already been redeemed. Restart the flow from scratch.

**"client_id is incorrect" error:** the Client ID in `GITHUB_CLIENT_ID` env var on the phone does not match what is on the OAuth App page. Copy it again.

**Login succeeds but our server rejects the user:** the returned GitHub login does not match the `ALLOWED_GH_USERS` env var allow-list. Either fix the env var or use a different GitHub account.

## Adding another OAuth App in the future

Same flow applies. For example, if you build a separate MCP server at `mcp.album-to-movies.manudubey.in`, register a separate OAuth App with that callback URL. Each project gets its own Client ID and Client Secret.

Do not reuse a single OAuth App across multiple unrelated services. Separate apps mean separate revocation, separate consent screens, separate secret rotation.

## See also

- [docs/learnings/github-oauth-vs-github-apps.md](../docs/learnings/github-oauth-vs-github-apps.md) - the distinction between OAuth Apps and GitHub Apps that tripped us up the first time.
- [docs/research/claude-ai-connector-oauth.md](../docs/research/claude-ai-connector-oauth.md) - what claude.ai (downstream) expects from our OAuth server.
- [docs/plans/P50-mcp-server.md](../docs/plans/P50-mcp-server.md) - the feature plan this was part of.
- [GitHub OAuth Apps docs](https://docs.github.com/en/apps/oauth-apps) - the official reference.
