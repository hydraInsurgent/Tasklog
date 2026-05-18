# GitHub OAuth Apps vs GitHub Apps

**Last updated:** 2026-05-18 - first encountered in MCP server feature (P50, 2026-05)

GitHub offers two superficially similar products under Settings > Developer Settings that solve different problems. Confusing them costs an hour of debugging on the first attempt. This is the distinction in one page.

## Mental model

| Product | What it is | Token semantics | When to use |
|---|---|---|---|
| **OAuth App** | A traditional OAuth 2.0 third-party login provider. The user authorizes once; you get a user access token. | Acts AS the user. Scopes are user-scoped. | "Sign in with GitHub", username allow-lists, anything where you just need to know who the user is. |
| **GitHub App** | A first-class integration with the GitHub API. The user (or org admin) "installs" it on specific repos or accounts. | Acts AS itself. Issues short-lived installation tokens scoped to the installed repos. | Reading code, opening PRs, posting check results, listening to webhooks, building bots. |

OAuth Apps are older, simpler, and aligned with the OAuth 2.0 standard you see everywhere on the web. GitHub Apps are GitHub's preferred path for integrations that touch repo data, because they get fine-grained per-installation permissions and have their own API rate limit pool.

## Why GitHub built two

OAuth Apps came first. They act as the user, which means:

- Every API call counts against the user's rate limit (5000 requests/hour).
- If the user leaves the org, the app loses access to that org's repos.
- Permissions are coarse-grained (you can scope to `repo` or `read:user`, but not to a specific repository).

GitHub Apps were designed to fix these. An installed GitHub App has its own identity, its own rate limit pool, and can be scoped to specific repositories at install time. The tradeoff: more concepts, more setup, two consent screens instead of one.

For "just identify the user," GitHub Apps are overkill. Use an OAuth App.

## How a user-auth flow differs

**OAuth App:**

```
1. User clicks "Sign in with GitHub" on your site.
2. Redirected to github.com/login/oauth/authorize?client_id=...&redirect_uri=...
3. They approve the requested scopes.
4. GitHub redirects to your callback URL with a `code` query parameter.
5. Your backend POSTs to github.com/login/oauth/access_token with code + Client ID + Client Secret.
6. GitHub returns a user access token.
7. You call api.github.com/user with that token to read their identity.
```

One consent screen. Simple.

**GitHub App with user authorization:**

```
1. User clicks "Install" (different button, different flow).
2. They choose which repos / org to install on.
3. First consent screen: installation permissions.
4. If the App is configured with "Request user authorization (OAuth) during installation",
   a second consent screen: user identity.
5. Two tokens come back: an installation token (scoped to repos) and a user access token.
```

Two consent screens, two tokens. Useful for bots that need both repo access AND user identity, like CI integrations.

## The two values that go together: Client ID + Client Secret

For both products, you get a Client ID and Client Secret at registration time. These identify *your application* to GitHub. They are not user credentials.

- **Client ID:** semi-public. Embedded in the authorization URL the user sees in their browser. Safe to commit to a frontend repo.
- **Client Secret:** server-only. Used during the token exchange step (step 5 above, `code` -> access token). Must never appear in client-side code or version control.

GitHub shows the Client Secret value **only once** when you generate it. Save it to a password manager immediately. If you lose it, you regenerate (which invalidates the previous one).

This same dual-identity pattern shows up elsewhere: the [claude.ai custom connector flow uses the same shape](../research/claude-ai-connector-oauth.md) when it talks to our MCP server's OAuth endpoints (claude.ai is the OAuth client; our server is the OAuth server). Once you internalize "Client ID/Secret identifies the calling app, not the user," every OAuth flow makes more sense.

## Webhooks: a GitHub App thing

GitHub Apps subscribe to events (PR opened, issue commented, push, etc.) and receive webhook deliveries to a URL you configure. OAuth Apps do not have a built-in webhook mechanism. If you need events, you would either:

- Use the user's API token to poll, or
- Set up repo-level webhooks separately (per repo).

If your project listens for events: GitHub App.
If your project just needs the user's identity at login time: OAuth App.

## Installation scope: "Only on this account" vs "Any account"

GitHub Apps prompt you to choose where they can be installed:

- **Only on this account:** the App can only be installed under your own user / org. Right for personal tools.
- **Any account:** the App appears in the GitHub Marketplace and can be installed by any GitHub user or org. Right for public integrations.

OAuth Apps do not have this restriction. Any GitHub user with the Client ID URL can attempt to authorize, but your backend decides whether to accept them (e.g. by checking the returned username against an allow-list).

## Common misconceptions

- **"GitHub Apps replace OAuth Apps."** No. They are for different use cases. OAuth Apps are still the right choice for user authentication.
- **"The Device Flow checkbox is required."** Only for CLIs and devices that cannot open a browser. Leave it off for web-based flows.
- **"I need to enable webhooks for the App to work."** Only if your integration listens to events. For pure user login, no webhook needed.
- **"The callback URL must be reachable at registration time."** No. GitHub never visits the callback URL at registration; it just stores the value and uses it during the OAuth redirect later.
- **"A Client Secret is per-user."** No. One Client Secret per OAuth App / GitHub App. All users hitting that app go through the same Client Secret.

## When this matters in practice

- **Building a "Sign in with GitHub" feature** for an app: OAuth App.
- **Building a CI integration that posts check results on PRs:** GitHub App with `checks:write` permission.
- **Wanting to know which GitHub user is interacting with your service:** OAuth App.
- **Wanting to read repo contents or open PRs from a bot:** GitHub App.
- **Acting as an upstream identity provider** for some other OAuth flow (like our MCP server using GitHub as IdP): OAuth App. The token we get from GitHub is just used to look up the user's identity once, then thrown away. We do not need ongoing repo access.

## Further reading

- [GitHub: Differences between OAuth Apps and GitHub Apps](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/differences-between-github-apps-and-oauth-apps) - the official comparison.
- [OAuth 2.0 Authorization Code Flow (RFC 6749 Section 4.1)](https://datatracker.ietf.org/doc/html/rfc6749#section-4.1) - the underlying protocol both products implement.
- Cross-link: [docs/research/claude-ai-connector-oauth.md](../research/claude-ai-connector-oauth.md) - how a downstream OAuth client (claude.ai) interacts with an OAuth server (our MCP server). Useful context for understanding the layered OAuth flow.
