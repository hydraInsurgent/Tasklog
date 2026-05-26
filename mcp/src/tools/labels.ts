/**
 * MCP tools for label operations. Four tools mapping 1-to-1 to the Tasklog
 * label endpoints in docs/architecture.md.
 *
 * colorIndex is an integer 0-9 that maps to a VIBGYOR-style palette in the
 * frontend (see UI-SPEC.md). The MCP server does not enforce the mapping;
 * any 0-9 value is accepted and the frontend renders accordingly.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as api from '../api-client.js';
import { runTool } from './result.js';

export function registerLabelTools(server: McpServer): void {
  server.registerTool(
    'list_labels',
    {
      title: 'List Labels',
      description:
        'List all labels in Tasklog. Use to find label ids before applying ' +
        'them to a task via set_task_labels. Returns: array of labels, each ' +
        'with id, name, colorIndex (0-9), createdAt.',
    },
    async () => runTool('list_labels', () => api.listLabels()),
  );

  server.registerTool(
    'create_label',
    {
      title: 'Create Label',
      description:
        'Create a new label. Labels are global tags that can be applied to ' +
        'any task across any project. Returns: the created label ' +
        '{ id, name, colorIndex, createdAt }.',
      inputSchema: {
        name: z.string().min(1).describe('The label name. Required, non-empty.'),
        colorIndex: z
          .number()
          .int()
          .min(0)
          .max(9)
          .describe(
            'Color index 0-9. Maps to a VIBGYOR-style palette in the ' +
              'frontend. Pick anything in range when the user does not specify.',
          ),
      },
    },
    async ({ name, colorIndex }) =>
      runTool('create_label', () => api.createLabel({ name, colorIndex })),
  );

  server.registerTool(
    'update_label',
    {
      title: 'Update Label',
      description:
        'Update a label\'s name and/or color. Both name and colorIndex are ' +
        'required by the API; pass the existing value for the field you do ' +
        'not want to change (call list_labels first if needed). Returns: the ' +
        'updated label { id, name, colorIndex, createdAt }.',
      inputSchema: {
        id: z.number().int().positive().describe('The label id to update.'),
        name: z.string().min(1).describe('The new (or unchanged) label name.'),
        colorIndex: z
          .number()
          .int()
          .min(0)
          .max(9)
          .describe('The new (or unchanged) color index 0-9.'),
      },
    },
    async ({ id, name, colorIndex }) =>
      runTool('update_label', () => api.updateLabel(id, { name, colorIndex })),
  );

  server.registerTool(
    'delete_label',
    {
      title: 'Delete Label',
      description:
        'Permanently delete a label. The label is unlinked from all tasks ' +
        'but the tasks themselves remain (no cascade delete). Returns: ' +
        '{ id, deleted: true, note }.',
      inputSchema: {
        id: z.number().int().positive().describe('The label id to delete.'),
      },
    },
    async ({ id }) =>
      runTool('delete_label', async () => {
        await api.deleteLabel(id);
        return { id, deleted: true, note: 'Label removed from all tasks; tasks were kept.' };
      }),
  );
}
