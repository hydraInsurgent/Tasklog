/**
 * OAuth discovery endpoints.
 *
 * Two metadata documents claude.ai needs to find our endpoints:
 *
 *   /.well-known/oauth-protected-resource    (RFC 9728)
 *   /.well-known/oauth-authorization-server  (RFC 8414)
 *
 * The MCP spec requires both. claude.ai's client makes a request to the
 * MCP endpoint without a token, gets a 401 with a WWW-Authenticate header
 * pointing at /.well-known/oauth-protected-resource, fetches that to learn
 * which authorization server to use, then fetches the authorization
 * server's metadata to find /authorize, /token, /register, and PKCE
 * support details.
 *
 * Both endpoints are public (no auth) and idempotent. They can be cached.
 */

import type { Hono } from 'hono';
import { config } from '../config.js';

export function mountWellKnown(app: Hono): void {
  // RFC 9728: Protected Resource Metadata. Tells the client which
  // authorization server(s) issue tokens accepted at this resource.
  app.get('/.well-known/oauth-protected-resource', (c) =>
    c.json({
      resource: config.publicUrl,
      authorization_servers: [config.publicUrl],
      scopes_supported: ['tasklog:rw'],
      bearer_methods_supported: ['header'],
      resource_documentation: 'https://github.com/hydraInsurgent/Tasklog',
    }),
  );

  // RFC 8414: Authorization Server Metadata. Tells the client which
  // endpoints to hit, which grants and challenge methods we support,
  // and that we are a public-client setup (no token_endpoint_auth).
  app.get('/.well-known/oauth-authorization-server', (c) =>
    c.json({
      issuer: config.publicUrl,
      authorization_endpoint: `${config.publicUrl}/authorize`,
      token_endpoint: `${config.publicUrl}/token`,
      registration_endpoint: `${config.publicUrl}/register`,
      scopes_supported: ['tasklog:rw'],
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      service_documentation: 'https://github.com/hydraInsurgent/Tasklog',
    }),
  );
}
