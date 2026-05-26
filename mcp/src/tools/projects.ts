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
        'List all projects in Tasklog. Use to find project ids before ' +
        'assigning tasks. Returns: array of projects, each with id, name, createdAt.',
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
        'Returns: the created project { id, name, createdAt }.',
      inputSchema: {
        name: z
          .string()
          .min(1)
          .describe('The project name. Required, non-empty.'),
      },
    },
    async ({ name }) =>
      runTool('create_project', () => api.createProject({ name })),
  );

  server.registerTool(
    'rename_project',
    {
      title: 'Rename Project',
      description:
        'Change a project\'s name. Tasks within the project are not affected. ' +
        'Returns: the updated project { id, name, createdAt }.',
      inputSchema: {
        id: z.number().int().positive().describe('The project id to rename.'),
        name: z.string().min(1).describe('The new project name.'),
      },
    },
    async ({ id, name }) =>
      runTool('rename_project', () => api.renameProject(id, { name })),
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
