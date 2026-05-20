/**
 * RFC 7591 Dynamic Client Registration endpoint.
 *
 * claude.ai POSTs a JSON body describing itself ("I am claude.ai, here are
 * my redirect URIs, here is the auth method I want to use") and we return
 * a freshly minted client_id. No client_secret because we are a public-
 * client setup (PKCE replaces the shared secret).
 *
 * We accept any well-formed request - we do NOT restrict registrations
 * to specific clients here, because that is the whole point of DCR
 * (clients self-register). The actual access control happens at /authorize,
 * where we check the GitHub upstream username against ALLOWED_GH_USERS.
 *
 * Per the RFC the response echoes back the registration with the
 * server-assigned client_id added.
 */

import type { Hono } from 'hono';
import { z } from 'zod';
import { clients } from './store.js';
import { opaqueToken } from './crypto.js';

// Field length caps are not in RFC 7591 - they exist here to bound the cost
// of public, unauthenticated DCR. Sized generously so legitimate clients
// (claude.ai, Claude Code) fit easily; an attacker can no longer balloon
// auth.db with megabyte-sized strings or thousand-entry redirect_uris.
const RegisterRequest = z
  .object({
    client_name: z.string().max(255).optional(),
    redirect_uris: z.array(z.string().min(1).max(2048)).min(1).max(10),
    token_endpoint_auth_method: z.string().max(64).optional(),
    grant_types: z.array(z.string().max(64)).max(8).optional(),
    response_types: z.array(z.string().max(64)).max(8).optional(),
    scope: z.string().max(255).optional(),
  })
  .passthrough();

export function mountRegister(app: Hono): void {
  app.post('/register', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json(
        { error: 'invalid_request', error_description: 'request body must be JSON' },
        400,
      );
    }

    const parsed = RegisterRequest.safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          error: 'invalid_client_metadata',
          error_description: parsed.error.message,
        },
        400,
      );
    }

    // Validate redirect URIs syntactically. The RFC allows http for loopback
    // (Claude Code CLI uses http://localhost:<port>/callback) but requires
    // https for everything else.
    for (const uri of parsed.data.redirect_uris) {
      try {
        const u = new URL(uri);
        if (u.protocol !== 'https:' && u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') {
          return c.json(
            {
              error: 'invalid_redirect_uri',
              error_description: `redirect_uri must use https (or http on localhost): ${uri}`,
            },
            400,
          );
        }
      } catch {
        return c.json(
          {
            error: 'invalid_redirect_uri',
            error_description: `redirect_uri is not a valid URL: ${uri}`,
          },
          400,
        );
      }
    }

    const client_id = opaqueToken();
    const record = clients.insert({
      client_id,
      client_name: parsed.data.client_name ?? 'Unnamed Client',
      redirect_uris: parsed.data.redirect_uris,
    });

    // Per RFC 7591 section 3.2.1, the response echoes the metadata back with
    // the server-assigned client_id. We do not issue a client_secret
    // (public client, PKCE replaces it).
    return c.json(
      {
        client_id: record.client_id,
        client_name: record.client_name,
        redirect_uris: record.redirect_uris,
        token_endpoint_auth_method: 'none',
        grant_types: parsed.data.grant_types ?? ['authorization_code', 'refresh_token'],
        response_types: parsed.data.response_types ?? ['code'],
        client_id_issued_at: record.created_at,
      },
      201,
    );
  });
}
