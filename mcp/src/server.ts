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
import { registerAllTools } from './tools/registry.js';

const PORT = Number(process.env.PORT ?? 5180);

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

// Service identification at the root for sanity-checking the scaffold is up.
app.get('/', (c) =>
  c.json({
    service: 'tasklog-mcp',
    status: 'ok',
    mcpEndpoint: '/mcp',
  }),
);

// The MCP endpoint. POST is the JSON-RPC request channel per the spec.
// The transport handles initialize, tools/list, tools/call, etc.
app.post('/mcp', (c) => transport.handleRequest(c.req.raw));

// Spec allows servers to refuse GET if they do not push server-initiated
// messages. Returning 405 keeps the surface honest. See
// docs/research/mcp-spec-2025-06-18.md section "Server-to-client (optional GET)".
app.get('/mcp', () =>
  new Response(null, { status: 405, headers: { Allow: 'POST' } }),
);

serve({ fetch: app.fetch, port: PORT });

console.log(`tasklog-mcp listening on http://localhost:${PORT}`);
console.log(`MCP endpoint: POST http://localhost:${PORT}/mcp`);
