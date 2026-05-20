/**
 * Crypto primitives for the OAuth flow.
 *
 *   - opaqueToken(): random URL-safe string used for client_id, auth codes,
 *     access tokens, refresh tokens. 32 bytes (256 bits) hex-encoded.
 *   - pkceVerify(): RFC 7636 S256 validation. Hashes the verifier and
 *     constant-time compares to the stored challenge.
 *
 * We do not use JWTs; tokens are opaque strings looked up in SQLite.
 * The plain string is what the client sees and what we store - no
 * signing or encoding.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * 32 random bytes hex-encoded. Used wherever the spec wants a "globally
 * unique, cryptographically secure" identifier (auth codes, tokens, etc).
 */
export function opaqueToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Verify an RFC 7636 S256 PKCE verifier against a stored challenge.
 *
 * The client (claude.ai) generated a random `code_verifier`, hashed it with
 * SHA-256, and base64url-encoded the digest to produce `code_challenge`.
 * We stored that challenge with the auth code. When the client redeems
 * the code at /token they send the original verifier. We recompute the
 * challenge and constant-time compare.
 *
 * Returns true if the verifier matches the challenge.
 */
export function pkceVerify(codeVerifier: string, storedChallenge: string): boolean {
  const computed = base64UrlEncode(
    createHash('sha256').update(codeVerifier, 'ascii').digest(),
  );
  // timingSafeEqual requires equal-length buffers. Length-mismatched
  // inputs cannot match anyway.
  if (computed.length !== storedChallenge.length) return false;
  return timingSafeEqual(
    Buffer.from(computed, 'ascii'),
    Buffer.from(storedChallenge, 'ascii'),
  );
}

/**
 * base64url encoding per RFC 4648 section 5. Standard base64 with
 *   '+' -> '-'
 *   '/' -> '_'
 *   trailing '=' padding removed
 */
function base64UrlEncode(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
