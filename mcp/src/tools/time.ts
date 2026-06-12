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

export function registerTimeTools(server: McpServer): void {
  server.tool(
    'start_timer',
    'Start a timer for a task. Auto-stops any currently running timer first. ' +
      'Returns the new time entry with the task name and start time.',
    {
      taskId: z.number().int().positive().describe('ID of the task to start tracking.'),
    },
    ({ taskId }) =>
      runTool('start_timer', async () => {
        const entry = await api.startTimer(taskId);
        return entry;
      }, (entry) =>
        `Timer started: "${entry.taskTitle}" (task #${entry.taskId})\nStarted at: ${clockLabel(entry.startedAt)}`
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
        return `Timer stopped: "${entry.taskTitle}"\nDuration: ${duration} (${clockLabel(entry.startedAt)} - ${clockLabel(entry.endedAt!)})`;
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
        return `Tracking: "${entry.taskTitle}" (task #${entry.taskId})\nStarted: ${clockLabel(entry.startedAt)} (${formatDuration(elapsed)} ago)`;
      }),
  );

  server.tool(
    'log_time',
    'Manually log a completed time entry on a task. Both start and end are required. ' +
      'Pass local ISO datetimes (e.g. "2026-06-11T14:00:00", no timezone offset). ' +
      'End must be after start and not in the future.',
    {
      taskId: z.number().int().positive().describe('ID of the task to log time on.'),
      startedAt: z
        .string()
        .describe('Start time as a local ISO datetime, e.g. "2026-06-11T14:00:00".'),
      endedAt: z
        .string()
        .describe('End time as a local ISO datetime, e.g. "2026-06-11T16:30:00". Must be after startedAt.'),
    },
    ({ taskId, startedAt, endedAt }) =>
      runTool('log_time', () => api.addTimeEntry(taskId, startedAt, endedAt), (entry) => {
        const duration = formatDuration(entry.durationSeconds);
        return `Logged: ${duration} on "${entry.taskTitle}"\n${clockLabel(entry.startedAt)} - ${clockLabel(entry.endedAt!)}`;
      }),
  );

  server.tool(
    'edit_time_entry',
    'Correct the start or end time of a logged (closed) time entry. ' +
      'Pass only the fields you want to change; omit the rest to keep them. ' +
      'End must remain after start. Pass local ISO datetimes (e.g. "2026-06-11T14:00:00", no timezone offset).',
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
    },
    ({ id, startedAt, endedAt }) =>
      runTool('edit_time_entry', async () => {
        const body: { startedAt?: string; endedAt?: string } = {};
        if (startedAt !== undefined) body.startedAt = startedAt;
        if (endedAt !== undefined) body.endedAt = endedAt;
        return api.updateTimeEntry(id, body);
      }, (entry) => {
        const duration = entry.endedAt ? formatDuration(Math.max(0, Math.round((new Date(entry.endedAt).getTime() - new Date(entry.startedAt).getTime()) / 1000))) : 'running';
        return `Updated entry #${entry.id} on "${entry.taskTitle}"\n${clockLabel(entry.startedAt)}${entry.endedAt ? ` - ${clockLabel(entry.endedAt)} (${duration})` : ' (running)'}`;
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
    'Get time tracked for a date range, grouped by task with totals. ' +
      'Use from === to for a single day. Returns per-task totals sorted by most time first, plus a grand total.',
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
        const entries = await api.listTimeEntries(`${from}T00:00:00`, toExclusive);
        return { from, to, toExclusive, entries };
      }, ({ from, to, toExclusive, entries }) => {
        const closed = entries.filter((e) => e.endedAt !== null);
        if (closed.length === 0) {
          return `No completed time entries from ${from} to ${to}.`;
        }

        // Clamp each entry to the query window before summing so entries that straddle
        // the boundary don't inflate the total. windowStart/End are epoch ms.
        const windowStart = new Date(`${from}T00:00:00`).getTime();
        const windowEnd = new Date(toExclusive).getTime();

        const byTask = new Map<number, { title: string; seconds: number }>();
        let totalSeconds = 0;
        for (const e of closed) {
          const entryStart = Math.max(new Date(e.startedAt).getTime(), windowStart);
          const entryEnd = Math.min(new Date(e.endedAt!).getTime(), windowEnd);
          const secs = Math.max(0, Math.round((entryEnd - entryStart) / 1000));
          const prev = byTask.get(e.taskId);
          if (prev) prev.seconds += secs;
          else byTask.set(e.taskId, { title: e.taskTitle, seconds: secs });
          totalSeconds += secs;
        }

        const label = from === to ? from : `${from} to ${to}`;
        const lines = [`Time tracked ${label}:`];
        const sorted = [...byTask.values()].sort((a, b) => b.seconds - a.seconds);
        for (const { title, seconds } of sorted) {
          lines.push(`  ${title}: ${formatDuration(seconds)}`);
        }
        lines.push(`Total: ${formatDuration(totalSeconds)}`);
        return lines.join('\n');
      }),
  );
}
