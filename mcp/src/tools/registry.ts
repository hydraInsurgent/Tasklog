/**
 * Aggregates all MCP tools and registers them on a given server instance.
 * Adding a new tool family means: create the file, export a register fn,
 * and call it here. Keeps tool registration in one discoverable place.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTaskTools } from './tasks.js';
import { registerSubtaskTools } from './subtasks.js';
import { registerProjectTools } from './projects.js';
import { registerClientTools } from './clients.js';
import { registerLabelTools } from './labels.js';
import { registerTimeTools } from './time.js';

export function registerAllTools(server: McpServer): void {
  registerTaskTools(server);
  registerSubtaskTools(server);
  registerProjectTools(server);
  registerClientTools(server);
  registerLabelTools(server);
  registerTimeTools(server);
}
