/**
 * GET /authorize - the user-facing OAuth start.
 *
 * claude.ai redirects the user's browser here with the OAuth params
 * (client_id, redirect_uri, code_challenge, state, scope, resource).
 * We:
 *   1. Validate the params: required fields present, response_type=code,
 *      code_challenge_method=S256, client_id exists, redirect_uri is
 *      one of the registered URIs for that client.
 *   2. Generate a CSRF state for OUR round trip to GitHub.
 *   3. Stash all the OAuth params plus the CSRF state in a short-lived
 *      signed cookie (so when GitHub redirects back, we can recover them).
 *   4. Render an HTML page with a "Log in with GitHub" button that links
 *      to github.com/login/oauth/authorize.
 *
 * The user clicks the button. GitHub does its own consent flow. When GitHub
 * redirects to /auth/github/callback, we read the cookie and continue (see
 * github.ts).
 */

import type { Hono } from 'hono';
import { setSignedCookie } from 'hono/cookie';
import { config } from '../config.js';
import { clients } from './store.js';
import { opaqueToken } from './crypto.js';

export const AUTHFLOW_COOKIE = 'tasklog-mcp-authflow';
const COOKIE_MAX_AGE_SECONDS = 600; // 10 minutes - enough for the user to log in at GitHub

export interface AuthFlowState {
  client_id: string;
  redirect_uri: string;
  client_state: string;
  code_challenge: string;
  code_challenge_method: string;
  scope: string;
  resource: string;
  github_state: string;
}

export function mountAuthorize(app: Hono): void {
  app.get('/authorize', async (c) => {
    const q = c.req.query();

    // Validate required params per RFC 6749 4.1.1 (authorization request)
    const missing = ['client_id', 'redirect_uri', 'response_type', 'code_challenge', 'code_challenge_method']
      .filter((k) => !q[k]);
    if (missing.length > 0) {
      return c.text(`Missing required parameter(s): ${missing.join(', ')}`, 400);
    }

    if (q.response_type !== 'code') {
      return c.text(`Unsupported response_type: ${q.response_type}. Only 'code' is supported.`, 400);
    }

    if (q.code_challenge_method !== 'S256') {
      return c.text(
        `Unsupported code_challenge_method: ${q.code_challenge_method}. Only 'S256' is supported.`,
        400,
      );
    }

    const client = clients.get(q.client_id!);
    if (!client) {
      return c.text(`Unknown client_id: ${q.client_id}`, 400);
    }

    if (!client.redirect_uris.includes(q.redirect_uri!)) {
      return c.text(
        `redirect_uri "${q.redirect_uri}" does not match any URI registered for this client`,
        400,
      );
    }

    // CSRF state for OUR round trip to GitHub. Stored in the cookie and
    // sent to GitHub; GitHub echoes it back on the callback so we can
    // verify the response is for the request we initiated.
    const githubState = opaqueToken();

    const flowState: AuthFlowState = {
      client_id: q.client_id!,
      redirect_uri: q.redirect_uri!,
      client_state: q.state ?? '',
      code_challenge: q.code_challenge!,
      code_challenge_method: q.code_challenge_method!,
      scope: q.scope ?? 'tasklog:rw',
      resource: q.resource ?? config.publicUrl,
      github_state: githubState,
    };

    await setSignedCookie(
      c,
      AUTHFLOW_COOKIE,
      JSON.stringify(flowState),
      config.sessionSecret,
      {
        maxAge: COOKIE_MAX_AGE_SECONDS,
        httpOnly: true,
        // In dev (HTTP) Secure breaks the cookie; in prod (HTTPS via Cloudflare
        // Tunnel) we want Secure on.
        secure: config.isProduction,
        sameSite: 'Lax',
        path: '/',
      },
    );

    // Build the GitHub authorize URL. We only need 'read:user' scope to get
    // the user's login for the allow-list check.
    const githubAuthUrl = new URL('https://github.com/login/oauth/authorize');
    githubAuthUrl.searchParams.set('client_id', config.githubClientId);
    githubAuthUrl.searchParams.set('redirect_uri', `${config.publicUrl}/auth/github/callback`);
    githubAuthUrl.searchParams.set('state', githubState);
    githubAuthUrl.searchParams.set('scope', 'read:user');

    const clientNameSafe = escapeHtml(client.client_name);
    const githubUrlSafe = escapeHtml(githubAuthUrl.toString());

    return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Tasklog MCP - Sign in</title>
  <style>
    :root { color-scheme: light dark; }
    body { font-family: system-ui, -apple-system, sans-serif; max-width: 480px; margin: 4rem auto; padding: 0 1rem; line-height: 1.5; }
    main { border: 1px solid #ccc4; border-radius: 8px; padding: 2rem; }
    h1 { margin: 0 0 0.5rem 0; font-size: 1.5rem; }
    p { margin: 0.75rem 0; }
    .btn { display: inline-block; padding: 0.75rem 1.25rem; background: #24292f; color: white; text-decoration: none; border-radius: 6px; font-weight: 600; margin-top: 1rem; }
    .btn:hover { background: #1f2328; }
    .small { color: #6b7280; font-size: 0.875rem; }
  </style>
</head>
<body>
  <main>
    <h1>Tasklog MCP</h1>
    <p><strong>${clientNameSafe}</strong> would like to access your Tasklog tasks.</p>
    <p class="small">Sign in with GitHub to authorize. Only allow-listed GitHub usernames are permitted.</p>
    <a class="btn" href="${githubUrlSafe}">Log in with GitHub</a>
  </main>
</body>
</html>`);
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
