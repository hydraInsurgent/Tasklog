/**
 * Tests for the pure-function pieces of the OAuth crypto layer.
 *
 * Run: npm test (from mcp/)
 *
 * DB-backed behaviour (refresh token rotation, audience validation,
 * access token expiry) is verified end-to-end via the OAuth smoke test
 * documented in P50-mcp-server.md, not here.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { pkceVerify, opaqueToken } from './crypto.js';

const sha256B64Url = (s: string): string =>
  createHash('sha256').update(s, 'ascii').digest('base64url');

test('pkceVerify accepts the correct S256 verifier', () => {
  const verifier = 'random-test-verifier-1234567890abcdef';
  const challenge = sha256B64Url(verifier);
  assert.equal(pkceVerify(verifier, challenge), true);
});

test('pkceVerify rejects a wrong verifier', () => {
  const verifier = 'correct-verifier-abc';
  const challenge = sha256B64Url(verifier);
  assert.equal(pkceVerify('wrong-verifier-abc', challenge), false);
});

test('pkceVerify rejects a near-miss challenge (one character flipped)', () => {
  const verifier = 'verifier-near-miss-test';
  const challenge = sha256B64Url(verifier);
  // Flip the first character. base64url alphabet is A-Z a-z 0-9 - _
  const flipped = (challenge.charAt(0) === 'A' ? 'B' : 'A') + challenge.slice(1);
  assert.equal(pkceVerify(verifier, flipped), false);
});

test('pkceVerify rejects a length-mismatched challenge without throwing', () => {
  // timingSafeEqual would throw if we let it see unequal buffers; the
  // implementation guards against that. Make sure the guard works.
  assert.equal(pkceVerify('short', 'this-is-a-longer-challenge-that-cannot-match'), false);
});

test('opaqueToken returns 64-character lowercase hex', () => {
  const t = opaqueToken();
  assert.equal(t.length, 64);
  assert.match(t, /^[0-9a-f]{64}$/);
});

test('opaqueToken returns distinct values across calls', () => {
  const a = opaqueToken();
  const b = opaqueToken();
  assert.notEqual(a, b);
});
