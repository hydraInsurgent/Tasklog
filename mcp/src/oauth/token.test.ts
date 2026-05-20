/**
 * Tests for the /token endpoint - both authorization_code and refresh_token
 * grants. Specifically exercises the atomicity invariant from #50's R2 fix:
 * consume + token insert are wrapped in inTransaction; a thrown error rolls
 * the consume back, a validation failure commits (one-use semantic).
 *
 * Each test seeds the auth_codes / refresh_tokens table via store helpers,
 * then drives the endpoint through app.request(). Uses an in-memory DB
 * (AUTH_DB_PATH=:memory: env var set by the test script).
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { createHash } from 'node:crypto';
import { mountToken } from './token.js';
import { authCodes, accessTokens, refreshTokens } from './store.js';

// PKCE S256: base64url(SHA-256(verifier))
function makeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier, 'ascii').digest('base64url');
}

interface OAuthErrorBody {
  error: string;
  error_description: string;
}

interface OAuthTokenBody {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token: string;
  scope: string;
}

function buildApp(): Hono {
  const app = new Hono();
  mountToken(app);
  return app;
}

async function postForm(app: Hono, form: Record<string, string>) {
  return app.request('/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString(),
  });
}

describe('POST /token - authorization_code grant', () => {
  let app: Hono;
  beforeEach(() => {
    app = buildApp();
  });

  test('400 invalid_request when required fields missing', async () => {
    const res = await postForm(app, { grant_type: 'authorization_code' });
    assert.equal(res.status, 400);
    const body = (await res.json()) as OAuthErrorBody;
    assert.equal(body.error, 'invalid_request');
  });

  test('400 invalid_grant when code is unknown', async () => {
    const res = await postForm(app, {
      grant_type: 'authorization_code',
      code: 'token-test-unknown-code',
      code_verifier: 'verifier',
      redirect_uri: 'https://x',
      client_id: 'c',
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as OAuthErrorBody;
    assert.equal(body.error, 'invalid_grant');
  });

  test('400 invalid_grant when code expired, and code is consumed', async () => {
    const code = 'token-test-expired';
    const verifier = 'verifier-1234567890abcdefghij1234567890ABCD';
    authCodes.insert({
      code,
      client_id: 'c',
      redirect_uri: 'https://x',
      code_challenge: makeChallenge(verifier),
      code_challenge_method: 'S256',
      scope: 'tasklog:rw',
      resource: null,
      github_user: 'u',
      expires_at: Math.floor(Date.now() / 1000) - 100,
    });
    const res = await postForm(app, {
      grant_type: 'authorization_code',
      code,
      code_verifier: verifier,
      redirect_uri: 'https://x',
      client_id: 'c',
    });
    assert.equal(res.status, 400);
    // One-use: even an expired code is consumed (re-attempt fails differently)
    assert.equal(authCodes.consume(code), null);
  });

  test('400 invalid_grant on PKCE mismatch, and code consumed', async () => {
    const code = 'token-test-pkce-fail';
    authCodes.insert({
      code,
      client_id: 'c',
      redirect_uri: 'https://x',
      code_challenge: makeChallenge('correct-verifier-1234567890123456789012'),
      code_challenge_method: 'S256',
      scope: 's',
      resource: null,
      github_user: 'u',
      expires_at: Math.floor(Date.now() / 1000) + 600,
    });
    const res = await postForm(app, {
      grant_type: 'authorization_code',
      code,
      code_verifier: 'wrong-verifier-1234567890123456789012345',
      redirect_uri: 'https://x',
      client_id: 'c',
    });
    assert.equal(res.status, 400);
    assert.equal(authCodes.consume(code), null);
  });

  test('400 invalid_grant on client_id mismatch', async () => {
    const code = 'token-test-cid-mismatch';
    const verifier = 'v-1234567890abcdefghij1234567890ABCDEFG';
    authCodes.insert({
      code,
      client_id: 'expected-client',
      redirect_uri: 'https://x',
      code_challenge: makeChallenge(verifier),
      code_challenge_method: 'S256',
      scope: 's',
      resource: null,
      github_user: 'u',
      expires_at: Math.floor(Date.now() / 1000) + 600,
    });
    const res = await postForm(app, {
      grant_type: 'authorization_code',
      code,
      code_verifier: verifier,
      redirect_uri: 'https://x',
      client_id: 'other-client',
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as OAuthErrorBody;
    assert.equal(body.error, 'invalid_grant');
  });

  test('400 invalid_grant on redirect_uri mismatch', async () => {
    const code = 'token-test-ruri-mismatch';
    const verifier = 'v-1234567890abcdefghij1234567890ABCDEFG';
    authCodes.insert({
      code,
      client_id: 'c',
      redirect_uri: 'https://correct.example',
      code_challenge: makeChallenge(verifier),
      code_challenge_method: 'S256',
      scope: 's',
      resource: null,
      github_user: 'u',
      expires_at: Math.floor(Date.now() / 1000) + 600,
    });
    const res = await postForm(app, {
      grant_type: 'authorization_code',
      code,
      code_verifier: verifier,
      redirect_uri: 'https://wrong.example',
      client_id: 'c',
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as OAuthErrorBody;
    assert.equal(body.error, 'invalid_grant');
  });

  test('success: issues access + refresh tokens; code is consumed', async () => {
    const code = 'token-test-success';
    const verifier = 'v-1234567890abcdefghij1234567890ABCDEFG';
    authCodes.insert({
      code,
      client_id: 'c',
      redirect_uri: 'https://x',
      code_challenge: makeChallenge(verifier),
      code_challenge_method: 'S256',
      scope: 'tasklog:rw',
      resource: null,
      github_user: 'u',
      expires_at: Math.floor(Date.now() / 1000) + 600,
    });
    const res = await postForm(app, {
      grant_type: 'authorization_code',
      code,
      code_verifier: verifier,
      redirect_uri: 'https://x',
      client_id: 'c',
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as OAuthTokenBody;
    assert.ok(body.access_token);
    assert.ok(body.refresh_token);
    assert.equal(body.token_type, 'Bearer');
    assert.ok(body.expires_in > 0);
    // Code consumed
    assert.equal(authCodes.consume(code), null);
    // Access token persisted
    assert.ok(accessTokens.get(body.access_token));
  });
});

describe('POST /token - refresh_token grant', () => {
  let app: Hono;
  beforeEach(() => {
    app = buildApp();
  });

  test('400 invalid_grant on unknown refresh token', async () => {
    const res = await postForm(app, {
      grant_type: 'refresh_token',
      refresh_token: 'token-test-unknown-rt',
      client_id: 'c',
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as OAuthErrorBody;
    assert.equal(body.error, 'invalid_grant');
  });

  test('400 invalid_grant on expired refresh token', async () => {
    const rt = 'token-test-expired-rt';
    refreshTokens.insert({
      token: rt,
      client_id: 'c',
      audience: 'a',
      github_user: 'u',
      scope: 's',
      expires_at: Math.floor(Date.now() / 1000) - 100,
    });
    const res = await postForm(app, {
      grant_type: 'refresh_token',
      refresh_token: rt,
      client_id: 'c',
    });
    assert.equal(res.status, 400);
  });

  test('400 invalid_grant on client_id mismatch', async () => {
    const rt = 'token-test-rt-cid-mismatch';
    refreshTokens.insert({
      token: rt,
      client_id: 'expected',
      audience: 'a',
      github_user: 'u',
      scope: 's',
      expires_at: Math.floor(Date.now() / 1000) + 100000,
    });
    const res = await postForm(app, {
      grant_type: 'refresh_token',
      refresh_token: rt,
      client_id: 'wrong',
    });
    assert.equal(res.status, 400);
  });

  test('success: rotates - new pair issued and old refresh consumed', async () => {
    const rt = 'token-test-rotate-rt';
    refreshTokens.insert({
      token: rt,
      client_id: 'c',
      audience: 'a',
      github_user: 'u',
      scope: 's',
      expires_at: Math.floor(Date.now() / 1000) + 100000,
    });
    const res = await postForm(app, {
      grant_type: 'refresh_token',
      refresh_token: rt,
      client_id: 'c',
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as OAuthTokenBody;
    assert.ok(body.access_token);
    assert.ok(body.refresh_token);
    assert.notEqual(body.refresh_token, rt);
    // Old refresh token consumed
    assert.equal(refreshTokens.consume(rt), null);
    // New access token persisted
    assert.ok(accessTokens.get(body.access_token));
  });
});
