/**
 * GET /auth/github/callback - GitHub's redirect back after the user logs in.
 *
 * Receives ?code=...&state=... from GitHub. We:
 *   1. Read the signed cookie set by /authorize, recover the flow state.
 *   2. CSRF check: GitHub's state must match the cookie's github_state.
 *   3. Exchange the GitHub code for a GitHub access token (one-shot, we
 *      do not store this token - we only need it to read the user identity).
 *   4. Fetch the user's GitHub identity (login).
 *   5. Allow-list check: login must be in ALLOWED_GH_USERS env var. If not,
 *      render an HTML "access denied" page (403).
 *   6. Generate OUR auth code (opaque random), persist it in auth_codes
 *      with all the original OAuth params (client_id, redirect_uri,
 *      code_challenge, scope, resource, github_user).
 *   7. Delete the flow cookie - it has served its purpose.
 *   8. 302 redirect to the client's redirect_uri (claude.ai callback) with
 *      code=<ourcode> and state=<client's original state>.
 */

import type { Hono } from 'hono';
import { deleteCookie, getSignedCookie } from 'hono/cookie';
import { config } from '../config.js';
import { authCodes } from './store.js';
import { opaqueToken } from './crypto.js';
import { AUTHFLOW_COOKIE, type AuthFlowState } from './authorize.js';

const AUTH_CODE_TTL_SECONDS = 600; // 10 minutes

export function mountGithubCallback(app: Hono): void {
  app.get('/auth/github/callback', async (c) => {
    const code = c.req.query('code');
    const state = c.req.query('state');
    const githubError = c.req.query('error');

    if (githubError) {
      return c.text(`GitHub OAuth error: ${githubError}`, 400);
    }
    if (!code || !state) {
      return c.text('Missing code or state from GitHub', 400);
    }

    // Recover flow state from the signed cookie
    const flowJson = await getSignedCookie(c, config.sessionSecret, AUTHFLOW_COOKIE);
    if (!flowJson) {
      return c.text(
        'No active auth flow found. The cookie may have expired (10 min) or your browser blocked it. Please restart the login.',
        400,
      );
    }

    let flow: AuthFlowState;
    try {
      flow = JSON.parse(flowJson) as AuthFlowState;
    } catch {
      return c.text('Corrupted auth flow cookie', 400);
    }

    // CSRF check
    if (flow.github_state !== state) {
      return c.text(
        'State mismatch. The flow may have been hijacked or the cookie was overwritten. Please restart the login.',
        400,
      );
    }

    // Exchange GitHub code for a GitHub access token. This token is single-
    // use for us - we read the user's login and discard it. 10s timeout so a
    // hung GitHub doesn't pin our request handler indefinitely.
    let tokenRes: Response;
    try {
      tokenRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          client_id: config.githubClientId,
          client_secret: config.githubClientSecret,
          code,
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (e: unknown) {
      if (isAbortLikeError(e)) {
        return c.text('GitHub token exchange timed out after 10s. Please retry.', 504);
      }
      throw e;
    }

    if (!tokenRes.ok) {
      return c.text(`GitHub token exchange failed (HTTP ${tokenRes.status})`, 502);
    }

    const tokenData = (await tokenRes.json()) as { access_token?: string; error?: string };
    if (tokenData.error || !tokenData.access_token) {
      return c.text(
        `GitHub token exchange error: ${tokenData.error ?? 'no access_token in response'}`,
        502,
      );
    }

    // Look up the user's GitHub identity (10s timeout, same reason).
    let userRes: Response;
    try {
      userRes = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'tasklog-mcp',
        },
        signal: AbortSignal.timeout(10_000),
      });
    } catch (e: unknown) {
      if (isAbortLikeError(e)) {
        return c.text('GitHub user lookup timed out after 10s. Please retry.', 504);
      }
      throw e;
    }

    if (!userRes.ok) {
      return c.text(`GitHub user lookup failed (HTTP ${userRes.status})`, 502);
    }

    const user = (await userRes.json()) as { login?: string };
    if (!user.login) {
      return c.text('GitHub returned no login field', 502);
    }

    // Allow-list check
    if (!config.allowedGhUsers.includes(user.login)) {
      return c.html(
        `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Access denied</title>
<style>body{font-family:system-ui;max-width:480px;margin:4rem auto;padding:0 1rem}main{border:1px solid #ccc4;border-radius:8px;padding:2rem}</style>
</head><body><main>
<h1>Access denied</h1>
<p>GitHub user <strong>${escapeHtml(user.login)}</strong> is not authorized to use this Tasklog MCP server.</p>
<p>If you think this is a mistake, contact the server owner.</p>
</main></body></html>`,
        403,
      );
    }

    // Mint OUR auth code, bind it to all the flow params + the verified user
    const ourCode = opaqueToken();
    authCodes.insert({
      code: ourCode,
      client_id: flow.client_id,
      redirect_uri: flow.redirect_uri,
      code_challenge: flow.code_challenge,
      code_challenge_method: flow.code_challenge_method,
      scope: flow.scope,
      resource: flow.resource,
      github_user: user.login,
      expires_at: Math.floor(Date.now() / 1000) + AUTH_CODE_TTL_SECONDS,
    });

    // Cookie served its purpose; delete it.
    deleteCookie(c, AUTHFLOW_COOKIE, { path: '/' });

    // 302 back to the client with code (and echoed state if there was one)
    const redirect = new URL(flow.redirect_uri);
    redirect.searchParams.set('code', ourCode);
    if (flow.client_state) {
      redirect.searchParams.set('state', flow.client_state);
    }

    return c.redirect(redirect.toString(), 302);
  });
}

// AbortSignal.timeout fires a DOMException with name 'TimeoutError' on
// Node 20+; older fetch impls may surface name 'AbortError'. Accept both.
function isAbortLikeError(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false;
  const name = (e as { name?: string }).name;
  return name === 'AbortError' || name === 'TimeoutError';
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
