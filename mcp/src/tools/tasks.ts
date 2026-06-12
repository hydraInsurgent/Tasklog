/**
 * MCP tools for task operations.
 *
 * Fourteen tools wrap the task-related Tasklog API endpoints: ten single-task
 * tools (incl. add_task_comment and log_habit_checkin) plus four bulk tools
 * (bulk_set_completion, bulk_assign_to_project, bulk_set_deadline,
 * bulk_set_priority) that apply one operation to many tasks in a single
 * transactional call. The completion toggle
 * is a single tool
 * (set_task_completion) that takes a boolean - earlier versions split it into
 * separate complete_task and uncomplete_task tools, but the LLM picks the right
 * value from natural language reliably and one tool reduces the surface area.
 *
 * list_tasks accepts an optional filter object that the backend translates
 * into a query string on GET /api/tasks. Filters AND across dimensions and
 * OR within projectIds and labelIds arrays - matches the web UI's filter
 * panel semantics.
 *
 * Recurrence (v2.14.0): create_task and update_task accept an RRULE-shaped
 * `recurrence` string (see RECURRENCE_DESCRIPTION); tasks carry recurrence /
 * seriesId / isRecurring. No new tool - completing a recurring task via
 * set_task_completion spawns the next occurrence server-side.
 *
 * Habits (v2.16.0): create_task and update_task accept an `isHabit` flag; tasks
 * carry it in their shape. log_habit_checkin marks a habit done for a day
 * (idempotent - one check-in per habit per day); the streak is computed
 * server-side and surfaced on the web Habits view.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as api from '../api-client.js';
import { runTool } from './result.js';

// Shared across create_task and update_task. Teaches the supported RRULE subset
// (RFC 5545-shaped) so the LLM can turn "every weekday" / "monthly on the 1st"
// into a rule string. The backend rejects anything outside this subset with a 400.
const RECURRENCE_DESCRIPTION =
  'Optional recurrence rule, RRULE-shaped. Supported forms: "FREQ=DAILY" (every ' +
  'day), "FREQ=DAILY;INTERVAL=N" (every N days), "FREQ=WEEKLY;BYDAY=MO,WE,FR" ' +
  '(those weekdays; codes SU MO TU WE TH FR SA), "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO" ' +
  '(every other Monday), "FREQ=MONTHLY;BYMONTHDAY=15" (that day each month), ' +
  '"FREQ=MONTHLY;BYMONTHDAY=-1" (last day), "FREQ=MONTHLY;BYDAY=3TH" (3rd Thursday; ' +
  'ordinal 1-4 or -1 for last), "FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=1" (every 2 ' +
  'months). Add an end condition with ";UNTIL=YYYYMMDD" (stops after that date) or ' +
  '";COUNT=N" (stops after N occurrences) - not both. Requires a deadline - the rule ' +
  'advances from it. Completing a recurring task automatically creates the next ' +
  'occurrence with its deadline advanced per the rule, until the end condition is ' +
  'reached. (Natural-language phrases are not parsed - pass the rule string.)';

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
        'tagged urgent", "what is P1", etc. ' +
        'Returns: array of tasks, each with id, title, description (or null), ' +
        'deadline (ISO date or null), dueStatus ("overdue" | "today" | ' +
        '"this_week" | "later" | "none", computed server-side from the ' +
        'deadline), priority (1-4, 1=P1 urgent .. 4=P4 none), isCompleted, ' +
        'completedAt, projectId, project, labels[], recurrence (RRULE string or ' +
        'null) and isRecurring.',
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
        priorities: z
          .array(z.number().int().min(1).max(4))
          .max(4)
          .optional()
          .describe(
            'Filter by priority. Tasks with ANY of the listed priorities match ' +
              '(1=P1 urgent, 2=P2 high, 3=P3 medium, 4=P4 none). E.g. [1] for "what is P1".',
          ),
        createdAfter: z
          .string()
          .optional()
          .describe(
            'ISO 8601 date/datetime. Returns tasks created on or after this. ' +
              'For "what did I add today", pass today\'s date (matches from midnight on).',
          ),
        createdBefore: z
          .string()
          .optional()
          .describe('ISO 8601 date/datetime. Returns tasks created on or before this instant.'),
        sort: z
          .enum(['created', 'deadline', 'priority'])
          .optional()
          .describe(
            'Sort field (default "created"). "deadline" puts tasks with no deadline last; ' +
              '"priority" with order=asc lists P1 first.',
          ),
        order: z
          .enum(['asc', 'desc'])
          .optional()
          .describe('Sort direction (default "desc").'),
        limit: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe('Return only the first N tasks after sorting. Omit for all. Useful for "top 5 by priority".'),
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
        'list_tasks items, including dueStatus) plus its comments[] ' +
        '({ id, body, createdAt }, newest first), or 404 if not found.',
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
            'Optional deadline as an ISO 8601 date (e.g. "2026-12-31", treated as ' +
              'end of that day) or datetime for a specific moment (e.g. ' +
              '"2026-12-31T15:00"). Omit if no deadline.',
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
        priority: z
          .number()
          .int()
          .min(1)
          .max(4)
          .optional()
          .describe(
            'Optional priority: 1=P1 (urgent), 2=P2 (high), 3=P3 (medium), ' +
              '4=P4 (none). Omit to default to P4 (no priority).',
          ),
        description: z
          .string()
          .max(2000)
          .optional()
          .describe('Optional free-text notes/context for the task (up to 2000 chars).'),
        recurrence: z
          .string()
          .optional()
          .describe(RECURRENCE_DESCRIPTION + ' Omit for a one-off task.'),
        isHabit: z
          .boolean()
          .optional()
          .describe(
            'When true, the task is tracked as a daily habit (it appears on the ' +
              'Habits view with a streak and gets daily check-ins via ' +
              'log_habit_checkin). Omit or false for an ordinary task.',
          ),
        weeklyTarget: z
          .number()
          .int()
          .min(1)
          .max(7)
          .optional()
          .describe(
            'Habit frequency: target check-ins per calendar week (1-7), e.g. 3 for ' +
              '"3 times a week". Only valid when isHabit is true. A habit is scheduled ' +
              'EITHER on specific days (recurrence) OR by a weekly target, never both - ' +
              'passing both is rejected. Omit for a specific-days or plain daily habit.',
          ),
      },
    },
    async ({ title, deadline, projectId, priority, description, recurrence, isHabit, weeklyTarget }) =>
      runTool(
        'create_task',
        () => api.createTask({ title, deadline, projectId, priority, description, recurrence, isHabit, weeklyTarget }),
        (t) =>
          `Created task #${t.id}: "${t.title}"` +
          (t.deadline ? ` (due ${t.deadline})` : '') +
          (t.recurrence ? ` repeating (${t.recurrence})` : '') +
          (t.projectId ? ` in project ${t.projectId}` : ' in Inbox'),
      ),
  );

  server.registerTool(
    'update_task',
    {
      title: 'Update Task',
      description:
        'Change a task\'s title, deadline, priority, and/or description. Use when ' +
        'the user says "rename task X", "change the deadline of X to Friday", "move ' +
        'X to next week", "clear X\'s deadline", "make X a P1", "add a note to X", ' +
        'etc. Only the fields ' +
        'you pass are changed; omitted fields are left as-is. Pass deadline as ' +
        'null to remove an existing deadline. To change a task\'s project or ' +
        'labels, use assign_task_to_project or set_task_labels instead. Returns: ' +
        'the updated task (same shape as list_tasks items, including dueStatus).',
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
            'New deadline as an ISO 8601 date (e.g. "2026-12-31", end of that day) ' +
              'or datetime for a specific moment (e.g. "2026-12-31T15:00"). Pass null ' +
              'to clear the deadline. Omit to leave it unchanged.',
          ),
        priority: z
          .number()
          .int()
          .min(1)
          .max(4)
          .optional()
          .describe(
            'New priority: 1=P1 (urgent), 2=P2 (high), 3=P3 (medium), 4=P4 ' +
              '(none). Omit to leave it unchanged. There is no "clear" - use 4 for none.',
          ),
        description: z
          .string()
          .max(2000)
          .nullable()
          .optional()
          .describe(
            'New free-text description (up to 2000 chars). Pass null (or an empty ' +
              'string) to clear it. Omit to leave it unchanged.',
          ),
        recurrence: z
          .string()
          .nullable()
          .optional()
          .describe(
            RECURRENCE_DESCRIPTION +
              ' Pass null to stop the task repeating. Omit to leave it unchanged.',
          ),
        isHabit: z
          .boolean()
          .optional()
          .describe(
            'true to track the task as a daily habit, false to stop tracking it ' +
              'as one. Omit to leave it unchanged. (Past check-ins are kept.)',
          ),
        weeklyTarget: z
          .number()
          .int()
          .min(1)
          .max(7)
          .nullable()
          .optional()
          .describe(
            'Set the "x times a week" habit frequency (1-7, habits only). Setting it ' +
              'clears any specific-days recurrence (the two modes are mutually exclusive); ' +
              'pass null to drop the weekly target. Omit to leave it unchanged.',
          ),
      },
    },
    async ({ id, title, deadline, priority, description, recurrence, isHabit, weeklyTarget }) => {
      // Build the PATCH body preserving the keep/clear/set distinction:
      // undefined = omit (keep), null = clear (deadline/description/recurrence/weeklyTarget), value = set.
      const body: {
        title?: string;
        deadline?: string | null;
        priority?: number;
        description?: string | null;
        recurrence?: string | null;
        isHabit?: boolean;
        weeklyTarget?: number | null;
      } = {};
      if (title !== undefined) body.title = title;
      if (deadline !== undefined) body.deadline = deadline;
      if (priority !== undefined) body.priority = priority;
      if (description !== undefined) body.description = description;
      if (recurrence !== undefined) body.recurrence = recurrence;
      if (isHabit !== undefined) body.isHabit = isHabit;
      if (weeklyTarget !== undefined) body.weeklyTarget = weeklyTarget;
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
        '"move X to Inbox". Pass projectName to target by name (saves a ' +
        'list_projects lookup) or projectId; an ambiguous/unknown name returns ' +
        'an error. Returns: the updated task (same shape as list_tasks items, ' +
        'including dueStatus).',
      inputSchema: {
        taskId: z.number().int().positive().describe('The task id to move.'),
        projectId: z
          .number()
          .int()
          .positive()
          .nullable()
          .optional()
          .describe(
            'The destination project id, or null to put the task in Inbox ' +
              '(no project). Omit if using projectName.',
          ),
        projectName: z
          .string()
          .optional()
          .describe(
            'Destination project by name (case-insensitive, exact). Wins over ' +
              'projectId. Errors if the name matches zero or multiple projects.',
          ),
      },
    },
    async ({ taskId, projectId, projectName }) =>
      runTool('assign_task_to_project', () =>
        api.setTaskProject(taskId, { projectId, projectName }),
      ),
  );

  server.registerTool(
    'set_task_labels',
    {
      title: 'Set Task Labels',
      description:
        'Replace the full set of labels on a task. Pass the FINAL desired ' +
        'list (this is not additive) as labelIds OR labelNames; an empty array ' +
        'removes all labels. labelNames is resolved by name (saves a list_labels ' +
        'lookup) and wins over labelIds; an ambiguous/unknown name returns an ' +
        'error. Returns: the updated task with its new labels[] (same shape as ' +
        'list_tasks items, including dueStatus).',
      inputSchema: {
        taskId: z
          .number()
          .int()
          .positive()
          .describe('The task id whose labels are being set.'),
        labelIds: z
          .array(z.number().int().positive())
          .optional()
          .describe(
            'The complete final list of label ids. Existing labels not in ' +
              'this list are removed. Omit if using labelNames.',
          ),
        labelNames: z
          .array(z.string())
          .optional()
          .describe(
            'The complete final list of label names (case-insensitive, exact). ' +
              'Wins over labelIds. Errors if any name matches zero or multiple labels.',
          ),
      },
    },
    async ({ taskId, labelIds, labelNames }) =>
      runTool('set_task_labels', () => api.setTaskLabels(taskId, { labelIds, labelNames })),
  );

  server.registerTool(
    'add_task_comment',
    {
      title: 'Add Task Comment',
      description:
        'Add a timestamped free-text comment/note to a task. Use when the user ' +
        'says "add a note to X", "log progress on X", "comment on X". Read a ' +
        "task's comments via get_task. Returns: the created comment " +
        '{ id, body, createdAt }.',
      inputSchema: {
        taskId: z.number().int().positive().describe('The task id to comment on.'),
        body: z
          .string()
          .min(1)
          .max(2000)
          .describe('The comment text (1-2000 chars).'),
      },
    },
    async ({ taskId, body }) =>
      runTool('add_task_comment', () => api.addTaskComment(taskId, body)),
  );

  server.registerTool(
    'log_habit_checkin',
    {
      title: 'Log Habit Check-in',
      description:
        'Mark a habit task done for a day (default today). Use when the user says ' +
        '"I meditated today", "mark my workout done", "log my reading". The task ' +
        'should be a habit (isHabit=true) - that is what gives it a streak. ' +
        'Idempotent: logging the same day twice does not create a duplicate. ' +
        'Returns: the check-in { id, checkInDate, createdAt, taskId }.',
      inputSchema: {
        taskId: z.number().int().positive().describe('The habit task id to check in.'),
        date: z
          .string()
          .optional()
          .describe(
            'Optional ISO 8601 date (e.g. "2026-05-28") to check in for a past day. ' +
              'Omit for today.',
          ),
      },
    },
    async ({ taskId, date }) =>
      runTool(
        'log_habit_checkin',
        () => api.addCheckIn(taskId, date),
        (c) => `Checked in habit #${c.taskId} for ${c.checkInDate.slice(0, 10)}.`,
      ),
  );

  server.registerTool(
    'undo_habit_checkin',
    {
      title: 'Undo Habit Check-in',
      description:
        'Remove a habit check-in for a given day (default today). Use when the ' +
        'user says "undo my check-in", "I didn\'t actually do it today", or ' +
        '"remove my gym check-in". 404 if no check-in exists for that day. ' +
        'Returns: confirmation message.',
      inputSchema: {
        taskId: z.number().int().positive().describe('The habit task id.'),
        date: z
          .string()
          .optional()
          .describe(
            'ISO 8601 date (e.g. "2026-05-28") of the check-in to remove. Omit for today.',
          ),
      },
    },
    async ({ taskId, date }) =>
      runTool(
        'undo_habit_checkin',
        async () => { await api.deleteCheckIn(taskId, date); return { taskId, date }; },
        ({ taskId, date }) =>
          `Removed check-in for habit #${taskId} on ${date ?? 'today'}.`,
      ),
  );

  server.registerTool(
    'get_habit_checkins',
    {
      title: 'Get Habit Check-ins',
      description:
        'List all check-in dates for a habit task, newest first. Use to see the ' +
        'history of a specific habit or debug a streak calculation. ' +
        'Returns: array of check-in objects { id, checkInDate, createdAt, taskId }.',
      inputSchema: {
        taskId: z.number().int().positive().describe('The habit task id.'),
      },
    },
    async ({ taskId }) =>
      runTool(
        'get_habit_checkins',
        () => api.listCheckIns(taskId),
        (checkIns) => {
          if (checkIns.length === 0) return `No check-ins found for task #${taskId}.`;
          const lines = checkIns.slice(0, 20).map((c) => `  ${c.checkInDate.slice(0, 10)}`);
          const more = checkIns.length > 20 ? `\n  ... and ${checkIns.length - 20} more` : '';
          return `Check-ins for task #${taskId} (${checkIns.length} total):\n${lines.join('\n')}${more}`;
        },
      ),
  );

  server.registerTool(
    'get_habits',
    {
      title: 'Get Habits',
      description:
        'Get all habit tasks with their current streak, done-today status, and ' +
        'weekly progress. Use when the user asks "how are my habits?", "what\'s my ' +
        'streak?", "did I do my habits today?". Returns richer data than list_tasks ' +
        'because streaks are computed server-side.',
    },
    async () =>
      runTool(
        'get_habits',
        () => api.getHabits(),
        (habits) => {
          if (habits.length === 0) return 'No habits set up yet. Create a task with isHabit=true.';
          const lines = habits.map((h) => {
            const done = h.doneToday ? 'Done today' : 'Not done today';
            if (h.weeklyTarget !== null) {
              const week = `${h.thisWeekCount ?? 0}/${h.weeklyTarget}x this week`;
              return `  ${h.task.title} - ${done} | ${week} | ${h.currentStreak}-week streak`;
            }
            return `  ${h.task.title} - ${done} | ${h.currentStreak}-day streak`;
          });
          return `Habits (${habits.length}):\n${lines.join('\n')}`;
        },
      ),
  );

  server.registerTool(
    'list_task_comments',
    {
      title: 'List Task Comments',
      description:
        'List comments on a task, newest first. Use when the user asks to see ' +
        'notes or history on a task. get_task also includes comments, so prefer ' +
        'this only when you specifically need just the comments. ' +
        'Returns: array of { id, body, createdAt }.',
      inputSchema: {
        taskId: z.number().int().positive().describe('The task id.'),
      },
    },
    async ({ taskId }) =>
      runTool(
        'list_task_comments',
        () => api.listTaskComments(taskId),
        (comments) => {
          if (comments.length === 0) return `No comments on task #${taskId}.`;
          return comments
            .map((c) => `[${c.createdAt.slice(0, 10)}] ${c.body} (id: ${c.id})`)
            .join('\n');
        },
      ),
  );

  server.registerTool(
    'delete_task_comment',
    {
      title: 'Delete Task Comment',
      description:
        'Permanently delete a comment from a task. Use when the user asks to ' +
        'remove a specific note or comment. Cannot be undone. ' +
        'Returns: confirmation message.',
      inputSchema: {
        taskId: z.number().int().positive().describe('The task id the comment belongs to.'),
        commentId: z.number().int().positive().describe('The comment id to delete.'),
      },
    },
    async ({ taskId, commentId }) =>
      runTool(
        'delete_task_comment',
        async () => { await api.deleteTaskComment(taskId, commentId); return { taskId, commentId }; },
        ({ commentId }) => `Deleted comment #${commentId}.`,
      ),
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
        'to Inbox". Pass projectName to target by name (saves a list_projects ' +
        'lookup) or projectId; an ambiguous/unknown name returns an error. Returns: ' +
        'array of the updated tasks (same shape as list_tasks items, including dueStatus).',
      inputSchema: {
        taskIds,
        projectId: z
          .number()
          .int()
          .positive()
          .nullable()
          .optional()
          .describe('Destination project id, or null to move all to Inbox. Omit if using projectName.'),
        projectName: z
          .string()
          .optional()
          .describe('Destination project by name (case-insensitive, exact). Wins over projectId.'),
      },
    },
    async ({ taskIds, projectId, projectName }) =>
      runTool('bulk_assign_to_project', () =>
        api.bulkTasks('assignProject', taskIds, { projectId, projectName }),
      ),
  );

  server.registerTool(
    'bulk_set_priority',
    {
      title: 'Bulk Set Priority',
      description:
        'Set the priority on many tasks at once. Use when the user says "make ' +
        'these all P1", "bump these to high priority". Returns: array of the ' +
        'updated tasks (same shape as list_tasks items, including dueStatus).',
      inputSchema: {
        taskIds,
        priority: z
          .number()
          .int()
          .min(1)
          .max(4)
          .describe('Priority for all selected tasks: 1=P1 urgent .. 4=P4 none.'),
      },
    },
    async ({ taskIds, priority }) =>
      runTool('bulk_set_priority', () =>
        api.bulkTasks('setPriority', taskIds, { priority }),
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
