/**
 * POST /token - the OAuth token endpoint.
 *
 * Two grant types per RFC 6749:
 *
 *   grant_type=authorization_code
 *     Required form fields: code, code_verifier, redirect_uri, client_id.
 *     We consume the auth code (one-use), validate it has not expired,
 *     check the client_id and redirect_uri match what was stored, verify
 *     the PKCE code_verifier against the stored S256 challenge, and issue
 *     a fresh access_token + refresh_token pair.
 *
 *   grant_type=refresh_token
 *     Required form fields: refresh_token, client_id.
 *     We consume the refresh token (rotation per OAuth 2.1 public clients),
 *     validate not expired, check client_id matches, and issue a fresh pair.
 *
 * Error responses use RFC 6749 error codes (invalid_request, invalid_grant,
 * unsupported_grant_type, etc.). claude.ai specifically expects standard
 * codes - returning a custom code on a bad refresh token will break their
 * token-refresh handling.
 *
 * Request content-type MUST be application/x-www-form-urlencoded per
 * RFC 6749 section 4.1.3 (NOT JSON).
 */

import type { Context, Hono } from 'hono';
import { config } from '../config.js';
import { authCodes, accessTokens, refreshTokens, inTransaction } from './store.js';
import { opaqueToken, pkceVerify } from './crypto.js';

const ACCESS_TOKEN_TTL_SECONDS = 60 * 60; // 1 hour
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

export function mountToken(app: Hono): void {
  app.post('/token', async (c) => {
    const contentType = c.req.header('content-type') ?? '';
    if (!contentType.includes('application/x-www-form-urlencoded')) {
      return errorResp(
        c,
        'invalid_request',
        'token endpoint requires application/x-www-form-urlencoded body',
        400,
      );
    }

    const body = await c.req.text();
    const form = Object.fromEntries(new URLSearchParams(body));

    const grant = form.grant_type;
    if (!grant) {
      return errorResp(c, 'invalid_request', 'grant_type is required', 400);
    }

    if (grant === 'authorization_code') return handleAuthCodeGrant(c, form);
    if (grant === 'refresh_token') return handleRefreshGrant(c, form);

    return errorResp(c, 'unsupported_grant_type', `grant_type "${grant}" not supported`, 400);
  });
}

// The outcome of an in-transaction grant attempt. Validation failures commit
// the transaction (consume sticks - OAuth 2.1 one-use); only crashes/throws
// roll back, in which case the consumed code/refresh token is restored.
type GrantOutcome =
  | { kind: 'fail'; error: string; description: string }
  | { kind: 'success'; payload: TokenResponse };

interface TokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token: string;
  scope: string;
}

function handleAuthCodeGrant(c: Context, form: Record<string, string>) {
  const missing = ['code', 'code_verifier', 'redirect_uri', 'client_id']
    .filter((k) => !form[k]);
  if (missing.length > 0) {
    return errorResp(c, 'invalid_request', `missing: ${missing.join(', ')}`, 400);
  }

  // Atomic: consume the auth code AND insert the new tokens together. If the
  // process crashes between consume and insert, SQLite rolls back and the
  // code is preserved for retry. See store.ts inTransaction.
  const outcome: GrantOutcome = inTransaction(() => {
    const record = authCodes.consume(form.code!);
    if (!record) {
      return { kind: 'fail', error: 'invalid_grant', description: 'code not found or already used' };
    }
    const now = Math.floor(Date.now() / 1000);
    if (record.expires_at < now) {
      return { kind: 'fail', error: 'invalid_grant', description: 'code expired' };
    }
    if (record.client_id !== form.client_id) {
      return { kind: 'fail', error: 'invalid_grant', description: 'client_id does not match the auth code' };
    }
    if (record.redirect_uri !== form.redirect_uri) {
      return { kind: 'fail', error: 'invalid_grant', description: 'redirect_uri does not match the auth code' };
    }
    if (!pkceVerify(form.code_verifier!, record.code_challenge)) {
      return { kind: 'fail', error: 'invalid_grant', description: 'PKCE verification failed' };
    }
    return {
      kind: 'success',
      payload: issueTokenPair({
        client_id: record.client_id,
        audience: record.resource ?? config.publicUrl,
        github_user: record.github_user,
        scope: record.scope,
      }),
    };
  });

  if (outcome.kind === 'fail') {
    return errorResp(c, outcome.error, outcome.description, 400);
  }
  return c.json(outcome.payload);
}

function handleRefreshGrant(c: Context, form: Record<string, string>) {
  const missing = ['refresh_token', 'client_id'].filter((k) => !form[k]);
  if (missing.length > 0) {
    return errorResp(c, 'invalid_request', `missing: ${missing.join(', ')}`, 400);
  }

  // Atomic: consume + rotate. A crash between consume and the new inserts
  // rolls back, leaving the old refresh token intact so the client can retry.
  const outcome: GrantOutcome = inTransaction(() => {
    const record = refreshTokens.consume(form.refresh_token!);
    if (!record) {
      return { kind: 'fail', error: 'invalid_grant', description: 'refresh token not found or already used' };
    }
    const now = Math.floor(Date.now() / 1000);
    if (record.expires_at < now) {
      return { kind: 'fail', error: 'invalid_grant', description: 'refresh token expired' };
    }
    if (record.client_id !== form.client_id) {
      return { kind: 'fail', error: 'invalid_grant', description: 'client_id does not match the refresh token' };
    }
    return {
      kind: 'success',
      payload: issueTokenPair({
        client_id: record.client_id,
        audience: record.audience,
        github_user: record.github_user,
        scope: record.scope,
      }),
    };
  });

  if (outcome.kind === 'fail') {
    return errorResp(c, outcome.error, outcome.description, 400);
  }
  return c.json(outcome.payload);
}

// Runs inside the transaction; returns the response payload but does NOT
// touch the Hono context. The caller decides whether to commit the txn (by
// returning normally) or roll it back (by throwing).
function issueTokenPair(info: {
  client_id: string;
  audience: string;
  github_user: string;
  scope: string;
}): TokenResponse {
  const now = Math.floor(Date.now() / 1000);
  const access = opaqueToken();
  const refresh = opaqueToken();

  accessTokens.insert({
    token: access,
    client_id: info.client_id,
    audience: info.audience,
    github_user: info.github_user,
    scope: info.scope,
    expires_at: now + ACCESS_TOKEN_TTL_SECONDS,
  });

  refreshTokens.insert({
    token: refresh,
    client_id: info.client_id,
    audience: info.audience,
    github_user: info.github_user,
    scope: info.scope,
    expires_at: now + REFRESH_TOKEN_TTL_SECONDS,
  });

  return {
    access_token: access,
    token_type: 'Bearer',
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    refresh_token: refresh,
    scope: info.scope,
  };
}

function errorResp(c: Context, error: string, error_description: string, status: number) {
  return c.json({ error, error_description }, status as 400 | 401 | 403);
}
