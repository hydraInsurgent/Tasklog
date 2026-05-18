/**
 * MCP tools for task operations.
 *
 * Eight tools wrap the seven task-related Tasklog API endpoints. Two of them
 * (complete_task and uncomplete_task) share the same underlying endpoint
 * (PATCH /api/tasks/{id}/complete) but are split into separate tools so the
 * LLM can pick the right one from natural language: "mark X done" vs
 * "I did not finish X after all, undo it".
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as api from '../api-client.js';
import { runTool } from './result.js';

export function registerTaskTools(server: McpServer): void {
  server.registerTool(
    'list_tasks',
    {
      title: 'List Tasks',
      description:
        'List all tasks in Tasklog. Returns each task with id, title, ' +
        'deadline, completion status, assigned project, and labels. Use ' +
        'when the user asks about pending work, what is due, or what is on ' +
        'their list.',
    },
    async () => runTool('list_tasks', () => api.listTasks()),
  );

  server.registerTool(
    'get_task',
    {
      title: 'Get Task',
      description: 'Fetch a single task by id. Returns 404 if not found.',
      inputSchema: {
        id: z.number().int().positive().describe('The task id.'),
      },
    },
    async ({ id }) => runTool('get_task', () => api.getTask(id)),
  );

  server.registerTool(
    'create_task',
    {
      title: 'Create Task',
      description:
        'Create a new task. Use when the user says "add a task", "remind me ' +
        'to", "I need to", etc. Returns the created task with its assigned id.',
      inputSchema: {
        title: z
          .string()
          .min(1)
          .describe('The task title. Required, non-empty.'),
        deadline: z
          .string()
          .optional()
          .describe(
            'Optional deadline as an ISO 8601 date string (e.g. ' +
              '"2026-12-31"). Omit if no deadline.',
          ),
        projectId: z
          .number()
          .int()
          .positive()
          .optional()
          .describe(
            'Optional project id to assign the task to. Omit to put the ' +
              'task in Inbox (no project).',
          ),
      },
    },
    async ({ title, deadline, projectId }) =>
      runTool(
        'create_task',
        () => api.createTask({ title, deadline, projectId }),
        (t) =>
          `Created task #${t.id}: "${t.title}"` +
          (t.deadline ? ` (due ${t.deadline})` : '') +
          (t.projectId ? ` in project ${t.projectId}` : ' in Inbox'),
      ),
  );

  server.registerTool(
    'delete_task',
    {
      title: 'Delete Task',
      description:
        'Permanently delete a task. Use when the user explicitly says ' +
        '"delete" or "remove" - not for completing tasks (use complete_task).',
      inputSchema: {
        id: z.number().int().positive().describe('The task id to delete.'),
      },
    },
    async ({ id }) =>
      runTool('delete_task', async () => {
        await api.deleteTask(id);
        return { id, deleted: true };
      }),
  );

  server.registerTool(
    'complete_task',
    {
      title: 'Complete Task',
      description:
        'Mark a task as done. Use when the user says "I finished X", "mark X ' +
        'complete", "X is done", etc. Sets the task\'s completedAt timestamp.',
      inputSchema: {
        id: z.number().int().positive().describe('The task id to complete.'),
      },
    },
    async ({ id }) =>
      runTool('complete_task', () => api.setTaskComplete(id, true)),
  );

  server.registerTool(
    'uncomplete_task',
    {
      title: 'Uncomplete Task',
      description:
        'Reopen a completed task. Use when the user says "I did not actually ' +
        'finish X", "undo the completion of X", or marks something as not ' +
        'done. Clears the task\'s completedAt timestamp.',
      inputSchema: {
        id: z.number().int().positive().describe('The task id to uncomplete.'),
      },
    },
    async ({ id }) =>
      runTool('uncomplete_task', () => api.setTaskComplete(id, false)),
  );

  server.registerTool(
    'assign_task_to_project',
    {
      title: 'Assign Task to Project',
      description:
        'Move a task to a different project, or remove it from any project ' +
        '(move to Inbox). Use when the user says "put X under project Y" or ' +
        '"move X to Inbox".',
      inputSchema: {
        taskId: z.number().int().positive().describe('The task id to move.'),
        projectId: z
          .number()
          .int()
          .positive()
          .nullable()
          .describe(
            'The destination project id, or null to put the task in Inbox ' +
              '(no project).',
          ),
      },
    },
    async ({ taskId, projectId }) =>
      runTool('assign_task_to_project', () =>
        api.setTaskProject(taskId, projectId),
      ),
  );

  server.registerTool(
    'set_task_labels',
    {
      title: 'Set Task Labels',
      description:
        'Replace the full set of labels on a task. Pass the FINAL desired ' +
        'list of label ids - this is not additive. Pass an empty array to ' +
        'remove all labels from the task.',
      inputSchema: {
        taskId: z
          .number()
          .int()
          .positive()
          .describe('The task id whose labels are being set.'),
        labelIds: z
          .array(z.number().int().positive())
          .describe(
            'The complete final list of label ids. Existing labels not in ' +
              'this list are removed.',
          ),
      },
    },
    async ({ taskId, labelIds }) =>
      runTool('set_task_labels', () => api.setTaskLabels(taskId, labelIds)),
  );
}
