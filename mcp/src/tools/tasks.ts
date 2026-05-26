/**
 * MCP tools for task operations.
 *
 * Eleven tools wrap the task-related Tasklog API endpoints: eight single-task
 * tools plus three bulk tools (bulk_set_completion, bulk_assign_to_project,
 * bulk_set_deadline) that apply one operation to many tasks in a single
 * transactional call. The completion toggle is a single tool
 * (set_task_completion) that takes a boolean - earlier versions split it into
 * separate complete_task and uncomplete_task tools, but the LLM picks the right
 * value from natural language reliably and one tool reduces the surface area.
 *
 * list_tasks accepts an optional filter object that the backend translates
 * into a query string on GET /api/tasks. Filters AND across dimensions and
 * OR within projectIds and labelIds arrays - matches the web UI's filter
 * panel semantics.
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
        'List tasks, with optional filters. Call with no params to list all ' +
        'tasks. Provide filters to narrow the result: project, inbox-only, ' +
        'labels, deadline range, completion status, or substring in the title. ' +
        'Filters AND together across dimensions; within projectIds and ' +
        'labelIds arrays the semantics are OR (matches if task has any of the ' +
        'given values). Use when the user asks "what tasks do I have", ' +
        '"what is due this week", "what is in the Work project", "tasks ' +
        'tagged urgent", etc. ' +
        'Returns: array of tasks, each with id, title, deadline (ISO date or ' +
        'null), dueStatus ("overdue" | "today" | "this_week" | "later" | ' +
        '"none", computed server-side from the deadline), isCompleted, ' +
        'completedAt, projectId, project, labels[].',
      inputSchema: {
        projectIds: z
          .array(z.number().int().positive())
          .max(50)
          .optional()
          .describe(
            'Filter by project ids. Tasks in ANY of the listed projects ' +
              'match. Cannot be combined with inbox=true.',
          ),
        inbox: z
          .boolean()
          .optional()
          .describe(
            'When true, returns only tasks with no project assigned (Inbox). ' +
              'Cannot be combined with a non-empty projectIds list.',
          ),
        labelIds: z
          .array(z.number().int().positive())
          .max(50)
          .optional()
          .describe(
            'Filter by label ids. Tasks tagged with ANY of the listed ' +
              'labels match.',
          ),
        dueBefore: z
          .string()
          .optional()
          .describe(
            'ISO 8601 date (e.g. "2026-12-31"). Returns tasks with a ' +
              'deadline on or before this date. Tasks with no deadline are ' +
              'excluded.',
          ),
        dueAfter: z
          .string()
          .optional()
          .describe(
            'ISO 8601 date. Returns tasks with a deadline on or after this ' +
              'date. Tasks with no deadline are excluded.',
          ),
        completed: z
          .boolean()
          .optional()
          .describe(
            'true = only completed tasks, false = only pending. Omit for both.',
          ),
        text: z
          .string()
          .max(200)
          .optional()
          .describe(
            'Case-insensitive substring match on task title. Useful for ' +
              '"find the task about X" queries.',
          ),
      },
    },
    async (filter) => runTool('list_tasks', () => api.listTasks(filter)),
  );

  server.registerTool(
    'get_task',
    {
      title: 'Get Task',
      description:
        'Fetch a single task by id. Returns: the task (same shape as ' +
        'list_tasks items, including dueStatus) or 404 if not found.',
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
        'to", "I need to", etc. Returns: the created task with its assigned id ' +
        '(same shape as list_tasks items, including dueStatus).',
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
    'update_task',
    {
      title: 'Update Task',
      description:
        'Change a task\'s title and/or deadline. Use when the user says ' +
        '"rename task X", "change the deadline of X to Friday", "move X to ' +
        'next week", "clear X\'s deadline", etc. Only the fields you pass are ' +
        'changed; omitted fields are left as-is. Pass deadline as null to ' +
        'remove an existing deadline. To change a task\'s project or labels, ' +
        'use assign_task_to_project or set_task_labels instead. Returns: the ' +
        'updated task (same shape as list_tasks items, including dueStatus).',
      inputSchema: {
        id: z.number().int().positive().describe('The task id to update.'),
        title: z
          .string()
          .min(1)
          .optional()
          .describe('New title. Omit to leave the title unchanged.'),
        deadline: z
          .string()
          .nullable()
          .optional()
          .describe(
            'New deadline as an ISO 8601 date string (e.g. "2026-12-31"). ' +
              'Pass null to clear the deadline. Omit to leave it unchanged.',
          ),
      },
    },
    async ({ id, title, deadline }) => {
      // Build the PATCH body preserving the keep/clear/set distinction:
      // undefined = omit (keep), null = clear, string = set.
      const body: { title?: string; deadline?: string | null } = {};
      if (title !== undefined) body.title = title;
      if (deadline !== undefined) body.deadline = deadline;
      return runTool('update_task', () => api.updateTask(id, body));
    },
  );

  server.registerTool(
    'delete_task',
    {
      title: 'Delete Task',
      description:
        'Permanently delete a task. Use when the user explicitly says ' +
        '"delete" or "remove" - not for completing tasks (use ' +
        'set_task_completion). Returns: { id, deleted: true }.',
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
    'set_task_completion',
    {
      title: 'Set Task Completion',
      description:
        'Toggle a task\'s completion state. Use with isCompleted=true when the ' +
        'user says "I finished X", "mark X complete", "X is done"; use ' +
        'isCompleted=false when the user says "I did not actually finish X", ' +
        '"undo X", "reopen X". Sets the task\'s completedAt timestamp when ' +
        'isCompleted=true; clears it when false. Returns: the updated task ' +
        '(same shape as list_tasks items, including dueStatus).',
      inputSchema: {
        id: z.number().int().positive().describe('The task id.'),
        isCompleted: z
          .boolean()
          .describe(
            'true to mark the task complete, false to reopen a completed task.',
          ),
      },
    },
    async ({ id, isCompleted }) =>
      runTool('set_task_completion', () => api.setTaskComplete(id, isCompleted)),
  );

  server.registerTool(
    'assign_task_to_project',
    {
      title: 'Assign Task to Project',
      description:
        'Move a task to a different project, or remove it from any project ' +
        '(move to Inbox). Use when the user says "put X under project Y" or ' +
        '"move X to Inbox". Returns: the updated task (same shape as ' +
        'list_tasks items, including dueStatus).',
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
        'remove all labels from the task. Returns: the updated task with its ' +
        'new labels[] (same shape as list_tasks items, including dueStatus).',
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

  // --- Bulk tools (act on many tasks in one transactional call) ---

  // A reusable schema for the task-id list shared by the bulk tools.
  const taskIds = z
    .array(z.number().int().positive())
    .min(1)
    .max(100)
    .describe('The task ids to act on. Non-empty; up to 100 per call.');

  server.registerTool(
    'bulk_set_completion',
    {
      title: 'Bulk Set Completion',
      description:
        'Mark many tasks complete or incomplete at once. Use when the user says ' +
        '"mark these done", "complete all of these", "reopen these". One call ' +
        'instead of one per task. Returns: array of the updated tasks (same shape ' +
        'as list_tasks items, including dueStatus).',
      inputSchema: {
        taskIds,
        isCompleted: z
          .boolean()
          .describe('true to mark all complete, false to reopen all.'),
      },
    },
    async ({ taskIds, isCompleted }) =>
      runTool('bulk_set_completion', () =>
        api.bulkTasks('complete', taskIds, { isCompleted }),
      ),
  );

  server.registerTool(
    'bulk_assign_to_project',
    {
      title: 'Bulk Assign to Project',
      description:
        'Move many tasks to one project (or to Inbox) at once. Use when the user ' +
        'says "move these to Work", "put all of these in project X", "send these ' +
        'to Inbox". Returns: array of the updated tasks (same shape as list_tasks ' +
        'items, including dueStatus).',
      inputSchema: {
        taskIds,
        projectId: z
          .number()
          .int()
          .positive()
          .nullable()
          .describe('Destination project id, or null to move all to Inbox.'),
      },
    },
    async ({ taskIds, projectId }) =>
      runTool('bulk_assign_to_project', () =>
        api.bulkTasks('assignProject', taskIds, { projectId }),
      ),
  );

  server.registerTool(
    'bulk_set_deadline',
    {
      title: 'Bulk Set Deadline',
      description:
        'Set or clear the deadline on many tasks at once. Use when the user says ' +
        '"push all of these to Friday", "clear the deadlines on these". Pass ' +
        'deadline as null to clear. Returns: array of the updated tasks (same ' +
        'shape as list_tasks items, including dueStatus).',
      inputSchema: {
        taskIds,
        deadline: z
          .string()
          .nullable()
          .describe(
            'New deadline as an ISO 8601 date string (e.g. "2026-12-31") for all ' +
              'selected tasks, or null to clear them.',
          ),
      },
    },
    async ({ taskIds, deadline }) =>
      runTool('bulk_set_deadline', () =>
        api.bulkTasks('setDeadline', taskIds, { deadline }),
      ),
  );
}
