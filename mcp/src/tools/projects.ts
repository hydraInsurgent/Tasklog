/**
 * MCP tools for project operations. Four tools mapping 1-to-1 to the
 * Tasklog project endpoints in docs/architecture.md.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as api from '../api-client.js';
import { runTool } from './result.js';

export function registerProjectTools(server: McpServer): void {
  server.registerTool(
    'list_projects',
    {
      title: 'List Projects',
      description:
        'List all projects in Tasklog, in sidebar order. Use to find project ids before ' +
        'assigning tasks. Returns: array of projects, each with id, name, color, clientId ' +
        '(the client/life-area it is grouped under, or null = Ungrouped), position, createdAt.',
    },
    async () => runTool('list_projects', () => api.listProjects()),
  );

  server.registerTool(
    'create_project',
    {
      title: 'Create Project',
      description:
        'Create a new project. Projects group related tasks. Use when the ' +
        'user says "make a project for X" or "start a new project Y". ' +
        'Optionally group it under a client (life area) via clientId. ' +
        'Returns: the created project { id, name, color, clientId, position, createdAt }.',
      inputSchema: {
        name: z
          .string()
          .min(1)
          .describe('The project name. Required, non-empty.'),
        color: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .optional()
          .describe('Optional hex color for the project, e.g. "#4f46e5". Omit for no color.'),
        clientId: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Optional client id to group this project under (see list_clients). Omit for Ungrouped.'),
      },
    },
    async ({ name, color, clientId }) =>
      runTool('create_project', () =>
        api.createProject({ name, ...(color ? { color } : {}), ...(clientId !== undefined ? { clientId } : {}) }),
      ),
  );

  server.registerTool(
    'rename_project',
    {
      title: 'Rename Project',
      description:
        "Change a project's name, color, and/or client grouping. Tasks within the project " +
        'are not affected. Pass clientId to move it under a client, or clientId: null to ' +
        'un-group it. Returns: the updated project { id, name, color, clientId, position, createdAt }.',
      inputSchema: {
        id: z.number().int().positive().describe('The project id to update.'),
        name: z.string().min(1).optional().describe('The new project name. Omit to keep it.'),
        color: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .optional()
          .describe('Optional new hex color, e.g. "#4f46e5". Omit to keep the existing color.'),
        clientId: z
          .number()
          .int()
          .positive()
          .nullable()
          .optional()
          .describe('Client id to group under; null to un-group (Ungrouped); omit to keep.'),
      },
    },
    async ({ id, name, color, clientId }) =>
      runTool('rename_project', () =>
        api.renameProject(id, {
          ...(name !== undefined ? { name } : {}),
          ...(color !== undefined ? { color } : {}),
          ...(clientId !== undefined ? { clientId } : {}),
        }),
      ),
  );

  server.registerTool(
    'delete_project',
    {
      title: 'Delete Project',
      description:
        'Permanently delete a project AND all of its tasks (cascade delete). ' +
        'Use only when the user explicitly confirms they want to delete a ' +
        'project. Consider warning the user about cascade impact first. ' +
        'Returns: { id, deleted: true, note } (note flags the cascade).',
      inputSchema: {
        id: z
          .number()
          .int()
          .positive()
          .describe(
            'The project id to delete. All tasks in this project are also deleted.',
          ),
      },
    },
    async ({ id }) =>
      runTool('delete_project', async () => {
        await api.deleteProject(id);
        return { id, deleted: true, note: 'Project and all its tasks were deleted.' };
      }),
  );
}
