/**
 * MCP tools for time tracking (#77).
 *
 * Seven tools wrap the time-entry API:
 *   start_timer      - start tracking a task (auto-stops any running timer)
 *   stop_timer       - stop the active timer; returns elapsed duration
 *   get_active_timer - what is currently being tracked?
 *   log_time         - manually add a completed time entry (start + end)
 *   edit_time_entry  - correct a logged entry's start or end time
 *   delete_time_entry - remove a logged entry permanently
 *   get_time_summary - totals by task for a date range
 *
 * The server stores timestamps in local time (consistent with the rest of
 * Tasklog). Callers should pass local ISO datetimes ("2026-06-11T14:00:00",
 * no timezone offset) for log_time / edit_time_entry.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as api from '../api-client.js';
import { runTool } from './result.js';

function formatDuration(seconds: number): string {
  if (seconds < 60) return '0m';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function clockLabel(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// The human label for an entry (#86): a linked task's title, else its free-text description,
// else a placeholder. Task-free entries carry only a description.
function entryLabel(e: { taskTitle: string; description: string | null }): string {
  return e.taskTitle || e.description || '(untitled)';
}

export function registerTimeTools(server: McpServer): void {
  server.tool(
    'start_timer',
    'Start a timer. Auto-stops any currently running timer first. Everything is optional: ' +
      'track a task (taskId), or a task-free activity by passing just a description ' +
      '(e.g. "Rise and Shine", "Sleep"). Optionally group it under a project. ' +
      'Returns the new time entry.',
    {
      taskId: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Optional task id to track. Omit for a task-free entry (use description).'),
      description: z
        .string()
        .optional()
        .describe('Free-text label for a task-free entry, e.g. "Rise and Shine".'),
      projectId: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Optional project to group the entry under. Defaults from the task when tracking one.'),
    },
    ({ taskId, description, projectId }) =>
      runTool('start_timer', () =>
        api.startTimer({
          ...(taskId !== undefined ? { taskId } : {}),
          ...(description !== undefined ? { description } : {}),
          ...(projectId !== undefined ? { projectId } : {}),
        }),
      (entry) =>
        `Timer started: "${entryLabel(entry)}"${entry.taskId ? ` (task #${entry.taskId})` : ''}\nStarted at: ${clockLabel(entry.startedAt)}`
      ),
  );

  server.tool(
    'stop_timer',
    'Stop the currently running timer. Returns the task name and elapsed duration. ' +
      'Returns a message if no timer is running.',
    {},
    () =>
      runTool('stop_timer', async () => {
        const active = await api.getActiveTimeEntry();
        if (!active) return null;
        try {
          return await api.stopTimer(active.id);
        } catch (err: unknown) {
          // 404 means the entry was already stopped by another client between the two calls.
          if (err instanceof api.ApiError && err.status === 404) return null;
          throw err;
        }
      }, (entry) => {
        if (!entry) return 'No timer is currently running.';
        const duration = formatDuration(entry.durationSeconds);
        return `Timer stopped: "${entryLabel(entry)}"\nDuration: ${duration} (${clockLabel(entry.startedAt)} - ${clockLabel(entry.endedAt!)})`;
      }),
  );

  server.tool(
    'get_active_timer',
    'Get the currently running timer. Returns the task name, start time, and elapsed time. ' +
      'Returns a message if no timer is running.',
    {},
    () =>
      runTool('get_active_timer', async () => api.getActiveTimeEntry(), (entry) => {
        if (!entry) return 'No timer is currently running.';
        const elapsed = Math.max(0, Math.floor((Date.now() - new Date(entry.startedAt).getTime()) / 1000));
        return `Tracking: "${entryLabel(entry)}"${entry.taskId ? ` (task #${entry.taskId})` : ''}\nStarted: ${clockLabel(entry.startedAt)} (${formatDuration(elapsed)} ago)`;
      }),
  );

  server.tool(
    'log_time',
    'Manually log a completed time entry. Start and end are required; task/description/project ' +
      'are optional (log a task-free activity by passing just a description). ' +
      'Pass local ISO datetimes (e.g. "2026-06-11T14:00:00", no timezone offset). ' +
      'End must be after start and not in the future.',
    {
      startedAt: z
        .string()
        .describe('Start time as a local ISO datetime, e.g. "2026-06-11T14:00:00".'),
      endedAt: z
        .string()
        .describe('End time as a local ISO datetime, e.g. "2026-06-11T16:30:00". Must be after startedAt.'),
      taskId: z.number().int().positive().optional().describe('Optional task id to log time on.'),
      description: z.string().optional().describe('Free-text label for a task-free entry, e.g. "Sleep".'),
      projectId: z.number().int().positive().optional().describe('Optional project to group the entry under.'),
    },
    ({ startedAt, endedAt, taskId, description, projectId }) =>
      runTool('log_time', () =>
        api.addTimeEntry({
          startedAt,
          endedAt,
          ...(taskId !== undefined ? { taskId } : {}),
          ...(description !== undefined ? { description } : {}),
          ...(projectId !== undefined ? { projectId } : {}),
        }),
      (entry) => {
        const duration = formatDuration(entry.durationSeconds);
        return `Logged: ${duration} on "${entryLabel(entry)}"\n${clockLabel(entry.startedAt)} - ${clockLabel(entry.endedAt!)}`;
      }),
  );

  server.tool(
    'edit_time_entry',
    'Edit a logged (closed) time entry: its start/end time, description, project, or the ' +
      'linked task. Pass only the fields you want to change; omit the rest to keep them. ' +
      'Pass null for description/projectId/taskId to clear/unlink. End must remain after ' +
      'start. Pass local ISO datetimes (e.g. "2026-06-11T14:00:00", no timezone offset).',
    {
      id: z.number().int().positive().describe('ID of the time entry to edit.'),
      startedAt: z
        .string()
        .optional()
        .describe('New start time as a local ISO datetime, e.g. "2026-06-11T14:00:00".'),
      endedAt: z
        .string()
        .optional()
        .describe('New end time as a local ISO datetime, e.g. "2026-06-11T16:30:00". Must be after startedAt.'),
      description: z
        .string()
        .nullable()
        .optional()
        .describe('New free-text label; null clears it.'),
      projectId: z
        .number()
        .int()
        .positive()
        .nullable()
        .optional()
        .describe('New project id; null un-groups (Inbox).'),
      taskId: z
        .number()
        .int()
        .positive()
        .nullable()
        .optional()
        .describe('Link to a task id; null unlinks (makes it task-free).'),
    },
    ({ id, startedAt, endedAt, description, projectId, taskId }) =>
      runTool('edit_time_entry', async () => {
        const body: { startedAt?: string; endedAt?: string; description?: string | null; projectId?: number | null; taskId?: number | null } = {};
        if (startedAt !== undefined) body.startedAt = startedAt;
        if (endedAt !== undefined) body.endedAt = endedAt;
        if (description !== undefined) body.description = description;
        if (projectId !== undefined) body.projectId = projectId;
        if (taskId !== undefined) body.taskId = taskId;
        return api.updateTimeEntry(id, body);
      }, (entry) => {
        const duration = entry.endedAt ? formatDuration(Math.max(0, Math.round((new Date(entry.endedAt).getTime() - new Date(entry.startedAt).getTime()) / 1000))) : 'running';
        return `Updated entry #${entry.id}: "${entryLabel(entry)}"\n${clockLabel(entry.startedAt)}${entry.endedAt ? ` - ${clockLabel(entry.endedAt)} (${duration})` : ' (running)'}`;
      }),
  );

  server.tool(
    'delete_time_entry',
    'Permanently delete a logged time entry. Use when the user wants to remove an incorrect or duplicate entry. ' +
      'This cannot be undone.',
    {
      id: z.number().int().positive().describe('ID of the time entry to delete.'),
    },
    ({ id }) =>
      runTool('delete_time_entry', async () => {
        await api.deleteTimeEntry(id);
        return { id, deleted: true };
      }, ({ id }) => `Deleted time entry #${id}.`),
  );

  server.tool(
    'get_time_summary',
    'Get time tracked for a date range, grouped by client/project with totals (#86). ' +
      'Use from === to for a single day. Returns per-project totals (prefixed with their ' +
      'client / life area) sorted by most time first, plus a grand total. Task-free entries ' +
      'with no project fall under "(no project)".',
    {
      from: z.string().describe('Start date in YYYY-MM-DD format (inclusive).'),
      to: z.string().describe('End date in YYYY-MM-DD format (inclusive).'),
    },
    ({ from, to }) =>
      runTool('get_time_summary', async () => {
        // Use T00:00:00 of the day AFTER `to` as the exclusive upper bound.
        // T23:59:59 misses entries that straddle midnight by up to one minute.
        const toDate = new Date(to);
        toDate.setDate(toDate.getDate() + 1);
        const toExclusive = `${toDate.toISOString().slice(0, 10)}T00:00:00`;
        // Fetch entries + projects together so we can label each group by project name
        // (the entry only carries projectId + the client name, not the project name).
        const [entries, projects] = await Promise.all([
          api.listTimeEntries(`${from}T00:00:00`, toExclusive),
          api.listProjects(),
        ]);
        return { from, to, toExclusive, entries, projects };
      }, ({ from, to, toExclusive, entries, projects }) => {
        const closed = entries.filter((e) => e.endedAt !== null);
        if (closed.length === 0) {
          return `No completed time entries from ${from} to ${to}.`;
        }

        const projectById = new Map(projects.map((p) => [p.id, p]));

        // Clamp each entry to the query window before summing so entries that straddle
        // the boundary don't inflate the total. windowStart/End are epoch ms.
        const windowStart = new Date(`${from}T00:00:00`).getTime();
        const windowEnd = new Date(toExclusive).getTime();

        // Group by project (id), labelled "Client / Project"; ungrouped entries share "(no project)".
        const byGroup = new Map<string, { label: string; seconds: number }>();
        let totalSeconds = 0;
        for (const e of closed) {
          const entryStart = Math.max(new Date(e.startedAt).getTime(), windowStart);
          const entryEnd = Math.min(new Date(e.endedAt!).getTime(), windowEnd);
          const secs = Math.max(0, Math.round((entryEnd - entryStart) / 1000));

          const key = e.projectId != null ? `p${e.projectId}` : 'none';
          const project = e.projectId != null ? projectById.get(e.projectId) : undefined;
          const clientName = e.clientName ?? project?.client?.name ?? null;
          const projectName = project?.name ?? null;
          const label = projectName
            ? clientName ? `${clientName} / ${projectName}` : projectName
            : '(no project)';

          const prev = byGroup.get(key);
          if (prev) prev.seconds += secs;
          else byGroup.set(key, { label, seconds: secs });
          totalSeconds += secs;
        }

        const label = from === to ? from : `${from} to ${to}`;
        const lines = [`Time tracked ${label}:`];
        const sorted = [...byGroup.values()].sort((a, b) => b.seconds - a.seconds);
        for (const g of sorted) {
          lines.push(`  ${g.label}: ${formatDuration(g.seconds)}`);
        }
        lines.push(`Total: ${formatDuration(totalSeconds)}`);
        return lines.join('\n');
      }),
  );
}
