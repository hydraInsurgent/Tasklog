/**
 * Middleware stack for the MCP endpoint.
 *
 * Three middleware applied in order:
 *
 *   1. originMiddleware - rejects browser-origin requests that aren't
 *      claude.ai (or localhost in dev). MCP spec requires Origin validation
 *      to prevent DNS rebinding.
 *
 *   2. protocolVersionMiddleware - rejects MCP-Protocol-Version values we
 *      don't support. Spec says non-matching versions MUST 400.
 *
 *   3. bearerAuthMiddleware - validates the Authorization: Bearer token
 *      against our access_tokens table, checks audience claim, returns 401
 *      with RFC 9728 WWW-Authenticate on failure (so the client knows where
 *      to find the OAuth metadata).
 *
 * All three apply only to /mcp routes. OAuth endpoints (/authorize, /token,
 * /register, /.well-known/*) are intentionally open.
 */

import type { Context, MiddlewareHandler } from 'hono';
import { config } from '../config.js';
import { accessTokens } from './store.js';

const SUPPORTED_PROTOCOL_VERSION = '2025-06-18';

export const originMiddleware: MiddlewareHandler = async (c, next) => {
  const origin = c.req.header('origin');
  // No Origin = not a browser-initiated request. Allowed (server-to-server
  // calls from claude.ai's backend, curl smoke tests, etc.).
  if (!origin) {
    return next();
  }
  if (!isAllowedOrigin(origin)) {
    return c.text(`Origin not allowed: ${origin}`, 403);
  }
  return next();
};

function isAllowedOrigin(origin: string): boolean {
  if (origin === 'https://claude.ai') return true;
  if (!config.isProduction) {
    try {
      const url = new URL(origin);
      if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return true;
    } catch {
      // Fall through to false
    }
  }
  return false;
}

export const protocolVersionMiddleware: MiddlewareHandler = async (c, next) => {
  const version = c.req.header('mcp-protocol-version');
  // Per the spec, the version header is REQUIRED only on requests AFTER
  // the initialize handshake. Missing on the initialize is fine. To be
  // pragmatic: accept missing, reject only when present and wrong.
  if (version && version !== SUPPORTED_PROTOCOL_VERSION) {
    return c.text(
      `Unsupported MCP-Protocol-Version: ${version}. Server supports ${SUPPORTED_PROTOCOL_VERSION}.`,
      400,
    );
  }
  return next();
};

export const bearerAuthMiddleware: MiddlewareHandler = async (c, next) => {
  const auth = c.req.header('authorization');
  if (!auth || !auth.toLowerCase().startsWith('bearer ')) {
    return unauthorized(c, 'missing or malformed Bearer token');
  }
  const token = auth.slice(7).trim();
  if (!token) {
    return unauthorized(c, 'empty Bearer token');
  }

  const record = accessTokens.get(token);
  if (!record) {
    return unauthorized(c, 'token not found or revoked');
  }
  if (record.expires_at < Math.floor(Date.now() / 1000)) {
    return unauthorized(c, 'token expired');
  }
  // RFC 8707 + MCP spec: token MUST be intended for this resource (us).
  if (record.audience !== config.publicUrl) {
    return unauthorized(c, `token audience mismatch (token issued for ${record.audience})`);
  }

  return next();
};

function unauthorized(c: Context, description: string) {
  // RFC 9728 challenge: tell the client where to find our protected resource
  // metadata so it can discover the authorization server.
  const challenge =
    `Bearer resource_metadata="${config.publicUrl}/.well-known/oauth-protected-resource"` +
    `, error="invalid_token"` +
    `, error_description="${description.replace(/"/g, '\\"')}"`;
  c.header('WWW-Authenticate', challenge);
  return c.text('Unauthorized', 401);
}
