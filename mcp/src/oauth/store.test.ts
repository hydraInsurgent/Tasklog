/**
 * Tests for store.ts: the inTransaction wrapper (added in #50 to make auth
 * code consume + token insert atomic) and the consume() one-use semantics.
 *
 * Uses an in-memory SQLite DB (AUTH_DB_PATH=:memory: env var set by the test
 * script). Each test file runs in its own Node subprocess so DBs are isolated
 * across files; within this file, tests share one DB so each uses unique IDs.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { authCodes, refreshTokens, accessTokens, inTransaction } from './store.js';

describe('inTransaction', () => {
  test('returns the function value on normal return', () => {
    const result = inTransaction(() => 42);
    assert.equal(result, 42);
  });

  test('rolls back DB writes when the function throws', () => {
    const tokenName = 'tx-rollback-token';
    assert.throws(() =>
      inTransaction(() => {
        accessTokens.insert({
          token: tokenName,
          client_id: 'c',
          audience: 'a',
          github_user: 'u',
          scope: 's',
          expires_at: 9999999999,
        });
        throw new Error('rollback me');
      }),
    );
    assert.equal(accessTokens.get(tokenName), null);
  });

  test('commits DB writes when the function returns normally', () => {
    const tokenName = 'tx-commit-token';
    inTransaction(() => {
      accessTokens.insert({
        token: tokenName,
        client_id: 'c',
        audience: 'a',
        github_user: 'u',
        scope: 's',
        expires_at: 9999999999,
      });
      return 'done';
    });
    const row = accessTokens.get(tokenName);
    assert.ok(row);
    assert.equal(row?.token, tokenName);
  });
});

describe('authCodes.consume', () => {
  test('returns the row and deletes it (one-use semantic)', () => {
    const code = 'one-use-code';
    authCodes.insert({
      code,
      client_id: 'c',
      redirect_uri: 'https://x',
      code_challenge: 'cc',
      code_challenge_method: 'S256',
      scope: 's',
      resource: null,
      github_user: 'u',
      expires_at: 9999999999,
    });
    const first = authCodes.consume(code);
    assert.ok(first);
    assert.equal(first?.code, code);
    const second = authCodes.consume(code);
    assert.equal(second, null);
  });

  test('returns null for an unknown code', () => {
    assert.equal(authCodes.consume('store-test-does-not-exist'), null);
  });
});

describe('refreshTokens.consume', () => {
  test('returns the row and deletes it (rotation)', () => {
    const token = 'rotate-rt';
    refreshTokens.insert({
      token,
      client_id: 'c',
      audience: 'a',
      github_user: 'u',
      scope: 's',
      expires_at: 9999999999,
    });
    const first = refreshTokens.consume(token);
    assert.ok(first);
    const second = refreshTokens.consume(token);
    assert.equal(second, null);
  });

  test('returns null for unknown token', () => {
    assert.equal(refreshTokens.consume('store-test-does-not-exist'), null);
  });
});
