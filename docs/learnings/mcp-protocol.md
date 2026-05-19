# The Model Context Protocol (MCP)

**Last updated:** 2026-05-19 - first encountered in MCP server feature (P50, 2026-05)

MCP is a JSON-RPC-based protocol that lets LLM applications connect to external systems (data, tools, prompts) without writing custom integrations for each service. Think of it as the Language Server Protocol but for AI: one server implementation works with any compliant client (Claude Desktop, claude.ai, custom agents, etc.). This file is the conceptual overview; the canonical normative content lives in [docs/research/mcp-spec-2025-06-18.md](../research/mcp-spec-2025-06-18.md).

## Mental model

MCP has exactly three roles:

```
+---------+        +-----------+         +-----------+
|         | <----> |           | <-----> |           |
|  Host   |        |  Client   |         |  Server   |
|  (LLM   |        |  (a       |         |  (your    |
|  app)   |        |   connector |       |   service) |
+---------+        +-----------+         +-----------+
```

- **Host**: the LLM application the user is talking to (claude.ai, Claude Desktop, an agent in your code).
- **Client**: a "connector" inside the host that speaks MCP to one specific server. A host can have many clients, one per server it integrates with.
- **Server**: a process that exposes some capability — your codebase, your calendar, your task list. Servers are where the protocol implementer (you) lives.

You write the **server**. The host and client are someone else's problem.

## What a server can offer

Three feature surfaces, in increasing complexity:

| Feature | What it is | Example |
|---|---|---|
| **Resources** | Read-only data the LLM can fetch by URI | `file:///project/src/main.rs`, `database://users/42` |
| **Prompts** | Templated prompt strings parameterized by the LLM or user | "Summarize this PR" template |
| **Tools** | Functions the LLM can invoke with arguments | `create_task`, `search_emails` |

Tools are the most-used feature and what most MCP servers (including Tasklog MCP) focus on. Resources and Prompts are optional.

## Why it exists

Before MCP, every LLM-to-external-service integration was bespoke. Each app re-implemented the same patterns: tool-calling protocols, authentication, message framing, capability discovery. The result: a permission-and-context jungle where adding a new integration meant another vendor-specific SDK.

MCP standardizes the wire format so:

- Any LLM host that speaks MCP can use any MCP server, no per-app code.
- Server authors target one protocol, get used by every host.
- Tool discovery, error handling, and authorization follow a single pattern.

It's not the first attempt — OpenAI's function-calling and various agent frameworks predate it — but it's the first vendor-neutral standard with traction across Anthropic, IDE vendors, and the open-source agent ecosystem.

## How it actually works

### Base wire format: JSON-RPC 2.0

Every message is a JSON-RPC 2.0 envelope:

```json
{ "jsonrpc": "2.0", "id": 1, "method": "tools/list" }
```

Responses are:

```json
{ "jsonrpc": "2.0", "id": 1, "result": { ... } }
```

Errors are:

```json
{ "jsonrpc": "2.0", "id": 1, "error": { "code": -32601, "message": "..." } }
```

Notifications (one-way, no response expected) omit the id.

### Transports

The same JSON-RPC messages flow over different physical channels:

| Transport | How | When |
|---|---|---|
| **stdio** | Server is a subprocess; messages over stdin/stdout, one per line | Local server, host launches it |
| **Streamable HTTP** | Server is a long-running HTTP service; messages over POST and (optionally) SSE | Remote server, multiple clients |

Tasklog MCP uses Streamable HTTP because claude.ai connectors require it (claude.ai's servers can't `exec` a process on your phone).

### Streamable HTTP specifics

Each MCP server hosts a single endpoint path (commonly `/mcp`) that handles:

- `POST /mcp` — every client-to-server JSON-RPC message lands here. Server responds with either `application/json` (one response) or `text/event-stream` (SSE stream, for streaming responses).
- `GET /mcp` — optional. Lets the server push messages to the client over SSE without the client asking first. If you don't push, return 405 Method Not Allowed.

### Session management

Two flavors:

- **Stateful**: server generates a session ID on initialize, returns it in the `Mcp-Session-Id` response header. Client MUST echo that header on every subsequent request. Server tracks per-session state (e.g. which capabilities were negotiated).
- **Stateless**: no session ID, each request is self-contained. The SDK we use (`@modelcontextprotocol/sdk` for Node) requires creating a *new transport instance per request* in this mode.

Per the spec: "Servers that require a session ID **SHOULD** respond to requests without an Mcp-Session-Id header (other than initialization) with HTTP 400 Bad Request." So if your client doesn't echo the session id and you're in stateful mode, every post-initialize call 400s.

**Which to use for a claude.ai connector: stateless.** claude.ai's connector does not echo `Mcp-Session-Id`. A stateful server will accept the initialize (200) then 400 every tools/list, tools/call - the UI surfaces this as "Couldn't reload tools from the server." See the "Real-world claude.ai connector quirks" section in [oauth-2-1-for-mcp.md](oauth-2-1-for-mcp.md) for the full debugging trail and the per-request transport pattern.

**The SDK refuses to share a stateless transport across requests** ("Stateless transport cannot be reused across requests. Create a new transport per request."). The correct pattern is to construct both `McpServer` AND transport inside the request handler, register tools, connect, handle, close. Cost is ~16 cheap function bindings per request, negligible.

### Protocol version negotiation

Two layers:

1. **JSON-RPC body**: the client sends `protocolVersion` in the `initialize` request params. The server replies with the version it agrees to in the `result.protocolVersion`. This is the negotiation - the SDK handles it.
2. **HTTP header**: on every request AFTER initialize, the client SHOULD include `MCP-Protocol-Version: <negotiated-version>`. Spec: "If the server receives a request with an invalid or unsupported MCP-Protocol-Version, it MUST respond with 400 Bad Request."

**Trap:** "unsupported" is defined by what the SDK accepts, not by the spec version published on modelcontextprotocol.io at the time you build. claude.ai sends versions newer than the published spec (we saw `2025-11-25` when the published spec was `2025-06-18`). Validating the HTTP header against a hard-coded enum will 400 every legitimate request.

**Fix:** at the HTTP layer, validate the *format* of the version string (regex `YYYY-MM-DD`) only. Let the SDK do the semantic decision in `initialize`. If the SDK accepted the version during initialize, the HTTP layer should accept it on subsequent requests.

```typescript
// HTTP middleware
const VERSION_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
if (version && !VERSION_PATTERN.test(version)) {
  return c.text(`Malformed MCP-Protocol-Version: ${version}`, 400);
}
```

### The lifecycle: initialize, then tools

Every MCP exchange follows the same opening:

```
Client -> Server:  initialize (request)
Server -> Client:  capabilities (response, with session id if stateful)
Client -> Server:  notifications/initialized (notification, no response)
Client -> Server:  tools/list, tools/call, ... (normal requests)
```

The `initialize` step is mandatory. Servers refuse other methods until they see it. `notifications/initialized` is the client confirming it received and understood the capabilities; servers return HTTP 202 with no body.

### Defining a tool

A tool definition is a JSON object:

```json
{
  "name": "create_task",
  "title": "Create Task",
  "description": "Create a new task in Tasklog. ...",
  "inputSchema": {
    "type": "object",
    "properties": {
      "title": { "type": "string", "description": "..." },
      "deadline": { "type": "string", "description": "..." }
    },
    "required": ["title"]
  }
}
```

`inputSchema` is JSON Schema. Most server SDKs let you define it via a typed schema library (we use Zod) and auto-generate the JSON Schema.

`title` is human-readable (shown in consent prompts); `name` is what the LLM uses (snake_case is convention).

### Calling a tool

Client request:

```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "method": "tools/call",
  "params": { "name": "create_task", "arguments": { "title": "Buy milk" } }
}
```

Server response (success):

```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "result": {
    "content": [{ "type": "text", "text": "Created task #42: Buy milk" }]
  }
}
```

Server response (tool error - the call reached the tool but the operation failed):

```json
{
  "result": {
    "content": [{ "type": "text", "text": "Failed: API rate limit exceeded" }],
    "isError": true
  }
}
```

Content blocks can be `text`, `image`, `audio`, `resource` (embedded resource), or `resource_link`. For most tools, `text` is enough.

### Two error mechanisms (important distinction)

- **Protocol errors** (JSON-RPC `error` field): used for transport-layer failures. Unknown method, malformed JSON, missing tool. The LLM does NOT see these as tool results; they're closer to "the call failed to land."
- **Tool execution errors** (`isError: true` in result): used for "the call landed but the operation failed." The LLM sees the error message and can react ("API said the task doesn't exist; let me ask the user for a different id").

Using the wrong one is a common bug. Rule of thumb: if the LLM could plausibly recover by asking the user or trying differently, use `isError`. If something is structurally broken (unknown tool name, bad arguments that schema validation should have caught), use a protocol error.

## Common misconceptions

- **"MCP is a Claude thing."** No. The protocol is vendor-neutral (Anthropic published the spec; multiple vendors implement it). Claude is the most-prominent host, but servers work with any compliant host.
- **"MCP replaces tool-calling APIs like OpenAI function-calling."** Not quite. Function-calling is between an LLM and your application code; MCP is between your application and external services. Most agents do both: LLM function-calls into the agent runtime, which then calls out to MCP servers.
- **"Streamable HTTP means everything streams."** No. The server can stream (return `text/event-stream`) or not (return `application/json`). For short tool calls (DB query, API call), non-streaming JSON is fine and simpler.
- **"Tools must be idempotent / read-only."** No. Tools can have side effects (create, update, delete). Hosts are expected to surface tool calls to the user before invoking; the protocol relies on the host for consent UX.
- **"Tool descriptions are metadata only."** No. They are the primary signal the LLM uses to choose which tool to call. A vague description = wrong tool gets picked. Treat tool descriptions like API documentation aimed at the model.
- **"Stateless HTTP transport is automatic and easy."** Depends on your SDK. Per-request transport construction can be cumbersome with high-level APIs; stateful mode is often easier even at scale.

## When it matters in practice

- **Adding a custom connector to claude.ai**: you build a Streamable HTTP MCP server with OAuth and host it publicly.
- **Building a coding agent that integrates with a private CI system**: stdio MCP server in the same machine, your agent shells it out.
- **Exposing an internal database to LLMs in your product**: MCP server in your stack, behind your auth, with tools like `query_users` and `get_user_recent_orders`.
- **Choosing tool granularity**: more tools with narrow descriptions = better selection by the LLM. Fewer tools with broad descriptions = LLM has to figure out arguments from context (worse). Lean toward "one English intent per tool."
- **Diagnosing why claude.ai is calling the wrong tool**: rewrite tool descriptions. Models pick from description; vague descriptions cause errors.

## Configuration in common stacks

| Stack | SDK | Pattern |
|---|---|---|
| Node.js | `@modelcontextprotocol/sdk` | `McpServer` class, `registerTool(name, config, callback)` |
| Python | `mcp` package | Decorator-based: `@server.tool(...)` |
| Go | `github.com/modelcontextprotocol/go-sdk` | Struct + handler registration |
| Cloudflare Workers | `@modelcontextprotocol/sdk` with `WebStandardStreamableHTTPServerTransport` | Same as Node but uses web-standard Request/Response |

## Further reading

- [Model Context Protocol spec, 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18) - the canonical normative document.
- [JSON-RPC 2.0 specification](https://www.jsonrpc.org/specification) - the wire format MCP rides on.
- Cross-link: [docs/research/mcp-spec-2025-06-18.md](../research/mcp-spec-2025-06-18.md) - verbatim spec excerpts for the parts the Tasklog MCP server implements.
- Cross-link: [docs/research/claude-ai-connector-oauth.md](../research/claude-ai-connector-oauth.md) - claude.ai's specific MCP client behavior.
