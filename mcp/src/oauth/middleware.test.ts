/**
 * Tests for the middleware stack protecting /mcp.
 *
 * Strategy: mount each middleware on a fresh Hono app, simulate a request via
 * app.request(), assert the resulting status. Uses an in-memory SQLite DB
 * (AUTH_DB_PATH=:memory: env var set by the test script).
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import {
  bearerAuthMiddleware,
  originMiddleware,
  protocolVersionMiddleware,
} from './middleware.js';
import { accessTokens } from './store.js';
import { config } from '../config.js';

describe('bearerAuthMiddleware', () => {
  let app: Hono;
  beforeEach(() => {
    app = new Hono();
    app.use('/test', bearerAuthMiddleware);
    app.get('/test', (c) => c.text('ok'));
  });

  test('401 when Authorization header is missing', async () => {
    const res = await app.request('/test');
    assert.equal(res.status, 401);
    assert.match(res.headers.get('www-authenticate') ?? '', /Bearer/);
  });

  test('401 when Authorization is not a Bearer scheme', async () => {
    const res = await app.request('/test', { headers: { authorization: 'Basic dXNlcjpwYXNz' } });
    assert.equal(res.status, 401);
  });

  test('401 when token is empty', async () => {
    const res = await app.request('/test', { headers: { authorization: 'Bearer ' } });
    assert.equal(res.status, 401);
  });

  test('401 when token is not in DB', async () => {
    const res = await app.request('/test', {
      headers: { authorization: 'Bearer no-such-token-123' },
    });
    assert.equal(res.status, 401);
  });

  test('401 when token is expired', async () => {
    const token = 'mw-expired-token';
    accessTokens.insert({
      token,
      client_id: 'c',
      audience: config.publicUrl,
      github_user: 'u',
      scope: 'tasklog:rw',
      expires_at: Math.floor(Date.now() / 1000) - 100,
    });
    const res = await app.request('/test', {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 401);
  });

  test('401 when audience does not match publicUrl', async () => {
    const token = 'mw-bad-audience';
    accessTokens.insert({
      token,
      client_id: 'c',
      audience: 'https://other.example.com',
      github_user: 'u',
      scope: 'tasklog:rw',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    });
    const res = await app.request('/test', {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 401);
  });

  test('passes when token is valid', async () => {
    const token = 'mw-valid-token';
    accessTokens.insert({
      token,
      client_id: 'c',
      audience: config.publicUrl,
      github_user: 'u',
      scope: 'tasklog:rw',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    });
    const res = await app.request('/test', {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
    assert.equal(await res.text(), 'ok');
  });

  test('audience trailing-slash normalization: token with publicUrl + "/" still passes', async () => {
    const token = 'mw-slash-audience';
    accessTokens.insert({
      token,
      client_id: 'c',
      audience: config.publicUrl + '/',
      github_user: 'u',
      scope: 'tasklog:rw',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    });
    const res = await app.request('/test', {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
  });
});

describe('originMiddleware', () => {
  let app: Hono;
  beforeEach(() => {
    app = new Hono();
    app.use('/test', originMiddleware);
    app.get('/test', (c) => c.text('ok'));
  });

  test('passes when Origin header is missing (server-to-server / curl)', async () => {
    const res = await app.request('/test');
    assert.equal(res.status, 200);
  });

  test('passes when Origin is https://claude.ai', async () => {
    const res = await app.request('/test', { headers: { origin: 'https://claude.ai' } });
    assert.equal(res.status, 200);
  });

  test('403 when Origin is some other site', async () => {
    const res = await app.request('/test', {
      headers: { origin: 'https://evil.example.com' },
    });
    assert.equal(res.status, 403);
  });
});

describe('protocolVersionMiddleware', () => {
  let app: Hono;
  beforeEach(() => {
    app = new Hono();
    app.use('/test', protocolVersionMiddleware);
    app.get('/test', (c) => c.text('ok'));
  });

  test('passes when header is missing (allowed pre-initialize)', async () => {
    const res = await app.request('/test');
    assert.equal(res.status, 200);
  });

  test('passes for currently published version 2025-06-18', async () => {
    const res = await app.request('/test', {
      headers: { 'mcp-protocol-version': '2025-06-18' },
    });
    assert.equal(res.status, 200);
  });

  test('passes for newer-than-published version (e.g. 2025-11-25 that claude.ai sends)', async () => {
    const res = await app.request('/test', {
      headers: { 'mcp-protocol-version': '2025-11-25' },
    });
    assert.equal(res.status, 200);
  });

  test('400 when header is malformed (not a date)', async () => {
    const res = await app.request('/test', {
      headers: { 'mcp-protocol-version': 'not-a-date' },
    });
    assert.equal(res.status, 400);
  });
});
