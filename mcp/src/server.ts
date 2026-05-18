/**
 * tasklog-mcp - MCP server entry point.
 *
 * Wires up:
 *   - An McpServer instance with the full tool registry from src/tools/.
 *   - A WebStandardStreamableHTTPServerTransport in stateless mode
 *     (single-user app, no session state needed). enableJsonResponse=true
 *     so tool calls return application/json instead of SSE - simpler for
 *     clients that do not need streaming, and our tools are short.
 *   - A Hono HTTP app exposing the MCP endpoint at POST /mcp and returning
 *     405 for GET /mcp (we do not push server-initiated messages).
 *
 * OAuth endpoints (/authorize, /token, /register, /.well-known/...) and
 * Origin/auth middleware are added in Steps 3-4 of the plan
 * (docs/plans/P50-mcp-server.md).
 */

import { randomUUID } from 'node:crypto';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { config } from './config.js';
import { registerAllTools } from './tools/registry.js';
import { mountWellKnown } from './oauth/well-known.js';
import { mountRegister } from './oauth/register.js';
import { mountAuthorize } from './oauth/authorize.js';
import { mountGithubCallback } from './oauth/github.js';
import { mountToken } from './oauth/token.js';
import {
  originMiddleware,
  protocolVersionMiddleware,
  bearerAuthMiddleware,
} from './oauth/middleware.js';

const mcp = new McpServer({
  name: 'tasklog-mcp',
  version: '0.1.0',
});

registerAllTools(mcp);

// Stateful mode: the transport assigns a session id on the initialize
// response (Mcp-Session-Id header), and the client echoes it back on every
// subsequent request. The SDK rejects mid-stream calls without a valid
// session id. The alternative (stateless mode) requires constructing a
// new transport per request, which the SDK's high-level API does not make
// ergonomic. Stateful is simpler and matches how claude.ai's client behaves.
const transport = new WebStandardStreamableHTTPServerTransport({
  sessionIdGenerator: () => randomUUID(),
  enableJsonResponse: true,
});

await mcp.connect(transport);

const app = new Hono();

// Service identification at the root for sanity-checking the server is up.
app.get('/', (c) =>
  c.json({
    service: 'tasklog-mcp',
    status: 'ok',
    publicUrl: config.publicUrl,
    mcpEndpoint: '/mcp',
  }),
);

// OAuth discovery (RFC 9728 + RFC 8414) and Dynamic Client Registration
// (RFC 7591). claude.ai hits these BEFORE attempting the actual OAuth
// flow on /authorize and /token.
mountWellKnown(app);
mountRegister(app);
mountAuthorize(app);
mountGithubCallback(app);
mountToken(app);

// MCP endpoint middleware chain: Origin validation -> Protocol-Version
// check -> Bearer auth. Order chosen so the cheapest checks fail fastest
// (Origin is a header lookup, version is a header lookup, bearer is a DB
// query). All three apply only to /mcp; OAuth endpoints stay open.
app.use('/mcp', originMiddleware);
app.use('/mcp', protocolVersionMiddleware);
app.use('/mcp', bearerAuthMiddleware);

// The MCP endpoint. POST is the JSON-RPC request channel per the spec.
// The transport handles initialize, tools/list, tools/call, etc.
app.post('/mcp', (c) => transport.handleRequest(c.req.raw));

// Spec allows servers to refuse GET if they do not push server-initiated
// messages. Returning 405 keeps the surface honest. See
// docs/research/mcp-spec-2025-06-18.md section "Server-to-client (optional GET)".
app.get('/mcp', () =>
  new Response(null, { status: 405, headers: { Allow: 'POST' } }),
);

serve({ fetch: app.fetch, port: config.port });

console.log(`tasklog-mcp listening on http://localhost:${config.port}`);
console.log(`MCP endpoint:  POST ${config.publicUrl}/mcp`);
console.log(`OAuth metadata: GET ${config.publicUrl}/.well-known/oauth-authorization-server`);
console.log(`DCR endpoint:   POST ${config.publicUrl}/register`);
