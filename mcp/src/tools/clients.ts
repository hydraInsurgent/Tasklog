/**
 * MCP tools for client operations (#86). A client is the grouping level ABOVE
 * projects - a life area like "Work", "Family", "Self". Four tools mapping
 * 1-to-1 to the Tasklog /api/clients endpoints.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as api from '../api-client.js';
import { runTool } from './result.js';

export function registerClientTools(server: McpServer): void {
  server.registerTool(
    'list_clients',
    {
      title: 'List Clients',
      description:
        'List all clients in Tasklog. A client is the grouping level above projects ' +
        '(a life area, e.g. "Work", "Family"). Use to find client ids before grouping ' +
        'a project under one. Returns: array of clients, each with id, name, color, createdAt.',
    },
    async () => runTool('list_clients', () => api.listClients()),
  );

  server.registerTool(
    'create_client',
    {
      title: 'Create Client',
      description:
        'Create a new client (a life area that groups projects). Use when the user says ' +
        '"make a client/area for X". Returns: the created client { id, name, color, createdAt }.',
      inputSchema: {
        name: z.string().min(1).describe('The client name. Required, non-empty.'),
        color: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .optional()
          .describe('Optional hex color, e.g. "#4f46e5". Omit for no color.'),
      },
    },
    async ({ name, color }) =>
      runTool('create_client', () => api.createClient({ name, ...(color ? { color } : {}) })),
  );

  server.registerTool(
    'rename_client',
    {
      title: 'Rename Client',
      description:
        "Change a client's name and/or color. Its projects are not affected. " +
        'Returns: the updated client { id, name, color, createdAt }.',
      inputSchema: {
        id: z.number().int().positive().describe('The client id to update.'),
        name: z.string().min(1).describe('The new client name.'),
        color: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .optional()
          .describe('Optional new hex color. Omit to keep the existing color.'),
      },
    },
    async ({ id, name, color }) =>
      runTool('rename_client', () => api.renameClient(id, { name, ...(color !== undefined ? { color } : {}) })),
  );

  server.registerTool(
    'delete_client',
    {
      title: 'Delete Client',
      description:
        'Delete a client. Its projects are NOT deleted - they become Ungrouped ' +
        '(no client). Safe: no tasks or time are lost. ' +
        'Returns: { id, deleted: true, note }.',
      inputSchema: {
        id: z.number().int().positive().describe('The client id to delete.'),
      },
    },
    async ({ id }) =>
      runTool('delete_client', async () => {
        await api.deleteClient(id);
        return { id, deleted: true, note: "Client deleted; its projects are now Ungrouped." };
      }),
  );
}
