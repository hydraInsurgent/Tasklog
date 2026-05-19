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

// Stateless mode: a fresh McpServer + transport is built per request.
// claude.ai's connector does not echo Mcp-Session-Id headers, so stateful
// sessions trip 400 on every call after initialize. Per-request isolation
// matches the SDK's documented stateless pattern and avoids request-id
// collisions across concurrent calls. Cost: re-registering tool handlers
// on every request (~16 cheap function bindings).
function createMcpServerForRequest(): McpServer {
  const server = new McpServer({ name: 'tasklog-mcp', version: '0.1.0' });
  registerAllTools(server);
  return server;
}

const app = new Hono();

// Request logger - one line per request, status + duration. Keep here (not
// behind a flag) so production logs make debugging the OAuth flow possible.
// For /mcp requests, also log the headers claude.ai actually sends so we can
// diagnose protocol-version and session-id mismatches.
app.use('*', async (c, next) => {
  const start = Date.now();
  const ua = c.req.header('user-agent') ?? '';
  console.log(`[req] ${c.req.method} ${c.req.path}${c.req.url.includes('?') ? '?' + c.req.url.split('?')[1] : ''} ua="${ua.slice(0, 60)}"`);
  if (c.req.path === '/mcp' && c.req.method === 'POST') {
    const interesting = ['accept', 'content-type', 'mcp-protocol-version', 'mcp-session-id', 'origin'];
    const headers = interesting
      .map((h) => `${h}=${c.req.header(h) ?? '-'}`)
      .join(' ');
    console.log(`[req-hdrs] ${headers}`);
  }
  await next();
  console.log(`[res] ${c.req.method} ${c.req.path} ${c.res.status} ${Date.now() - start}ms`);
});

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
// Stateless: fresh server + transport per request, closed when done.
app.post('/mcp', async (c) => {
  const server = createMcpServerForRequest();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless - no Mcp-Session-Id header
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(c.req.raw);
  } finally {
    await transport.close();
    await server.close();
  }
});

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
