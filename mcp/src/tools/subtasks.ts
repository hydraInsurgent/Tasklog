/**
 * MCP tools for subtask (checklist item) operations.
 *
 * Six thin tools wrap the subtask sub-resource under /api/tasks/{taskId}/subtasks:
 * add_subtask, list_subtasks, set_subtask_completion, update_subtask,
 * delete_subtask, and reorder_subtasks. Subtasks are lightweight - a title, a
 * done flag, a manual order, and an optional deadline - so the tools stay small.
 *
 * set_subtask_completion is split out from the general update_subtask (mirroring
 * how set_task_completion is its own tool) because "tick this off" is the most
 * common operation and a dedicated boolean tool is the clearest surface for it.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as api from '../api-client.js';
import { runTool } from './result.js';

export function registerSubtaskTools(server: McpServer): void {
  server.registerTool(
    'add_subtask',
    {
      title: 'Add Subtask',
      description:
        'Add a checklist item (subtask) under a parent task. Use when the user ' +
        'wants to break a task into steps, e.g. "add a subtask to task 5: draft ' +
        'the intro". The subtask is added at the bottom of the list. An optional ' +
        'deadline (ISO date yyyy-MM-dd, or a full ISO datetime for a timed one) ' +
        'makes the subtask also surface as its own dated item in the web list. ' +
        'Returns the created subtask.',
      inputSchema: {
        taskId: z.number().int().positive().describe('The parent task id.'),
        title: z.string().min(1).max(500).describe('The checklist line.'),
        deadline: z
          .string()
          .optional()
          .describe('Optional ISO date/datetime deadline for this subtask.'),
      },
    },
    async ({ taskId, title, deadline }) =>
      runTool('add_subtask', () => api.addSubtask(taskId, title, deadline)),
  );

  server.registerTool(
    'list_subtasks',
    {
      title: 'List Subtasks',
      description:
        "List a task's subtasks in their manual order. Use when the user asks " +
        '"what are the subtasks of task 5" or to see checklist progress. Returns ' +
        'an array of subtasks, each with id, title, isCompleted, position, ' +
        'deadline (ISO or null), and taskId.',
      inputSchema: {
        taskId: z.number().int().positive().describe('The parent task id.'),
      },
    },
    async ({ taskId }) => runTool('list_subtasks', () => api.listSubtasks(taskId)),
  );

  server.registerTool(
    'set_subtask_completion',
    {
      title: 'Set Subtask Completion',
      description:
        'Tick a subtask off or reopen it. Use for "mark subtask 3 done" or ' +
        '"uncheck it". Pass isCompleted true to complete, false to reopen. ' +
        'Returns the updated subtask.',
      inputSchema: {
        taskId: z.number().int().positive().describe('The parent task id.'),
        subtaskId: z.number().int().positive().describe('The subtask id.'),
        isCompleted: z
          .boolean()
          .describe('true = done, false = reopen.'),
      },
    },
    async ({ taskId, subtaskId, isCompleted }) =>
      runTool('set_subtask_completion', () => api.updateSubtask(taskId, subtaskId, { isCompleted })),
  );

  server.registerTool(
    'update_subtask',
    {
      title: 'Update Subtask',
      description:
        "Edit a subtask's title and/or deadline. Use for \"rename subtask 3\" or " +
        '"set a deadline on the subtask". Omit a field to leave it unchanged; ' +
        'pass deadline as null to clear it. Returns the updated subtask.',
      inputSchema: {
        taskId: z.number().int().positive().describe('The parent task id.'),
        subtaskId: z.number().int().positive().describe('The subtask id.'),
        title: z
          .string()
          .min(1)
          .max(500)
          .optional()
          .describe('New title. Omit to leave unchanged.'),
        deadline: z
          .string()
          .nullable()
          .optional()
          .describe(
            'New ISO date/datetime deadline, or null to clear. Omit to leave unchanged.',
          ),
      },
    },
    async ({ taskId, subtaskId, title, deadline }) =>
      runTool('update_subtask', () =>
        api.updateSubtask(taskId, subtaskId, {
          ...(title !== undefined ? { title } : {}),
          ...(deadline !== undefined ? { deadline } : {}),
        }),
      ),
  );

  server.registerTool(
    'delete_subtask',
    {
      title: 'Delete Subtask',
      description:
        'Delete a subtask from its parent task. Use for "remove subtask 3". ' +
        'This is permanent. Returns nothing on success.',
      inputSchema: {
        taskId: z.number().int().positive().describe('The parent task id.'),
        subtaskId: z.number().int().positive().describe('The subtask id.'),
      },
    },
    async ({ taskId, subtaskId }) =>
      runTool('delete_subtask', () => api.deleteSubtask(taskId, subtaskId)),
  );

  server.registerTool(
    'reorder_subtasks',
    {
      title: 'Reorder Subtasks',
      description:
        "Set the order of a task's subtasks. Pass orderedIds as the full set of " +
        'the task\'s subtask ids in the desired top-to-bottom order (it must ' +
        'contain exactly those ids). Returns the reordered list.',
      inputSchema: {
        taskId: z.number().int().positive().describe('The parent task id.'),
        orderedIds: z
          .array(z.number().int().positive())
          .min(1)
          .describe("All of the task's subtask ids, in the desired order."),
      },
    },
    async ({ taskId, orderedIds }) =>
      runTool('reorder_subtasks', () => api.reorderSubtasks(taskId, orderedIds)),
  );
}
