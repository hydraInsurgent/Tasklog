/**
 * HTTP client for the Tasklog .NET API.
 *
 * One function per REST endpoint defined in docs/architecture.md. Throws
 * ApiError on non-2xx responses so MCP tool handlers can render the failure
 * to the LLM as an isError tool result instead of a JSON-RPC protocol error.
 *
 * Base URL is read from TASKLOG_API_URL env var (default localhost:5115 for
 * dev). On the phone, the runit service sets this to http://localhost:5115
 * because tasklog-mcp and tasklog-api share the same loopback.
 */

const API_BASE = process.env.TASKLOG_API_URL ?? 'http://localhost:5115';

// Mirror the data model from docs/architecture.md. These types describe what
// the .NET API returns, not what the MCP tools expose.

export interface Project {
  id: number;
  name: string;
  color?: string | null;
  createdAt: string;
}

export interface Label {
  id: number;
  name: string;
  colorIndex: number;
  createdAt: string;
}

export interface Task {
  id: number;
  title: string;
  // Optional free-text notes/context. Null = no description.
  description: string | null;
  deadline: string | null;
  // Computed server-side from the deadline relative to today. Read-only - never sent.
  dueStatus: 'overdue' | 'today' | 'this_week' | 'later' | 'none';
  // Todoist-style priority: 1 = P1 (urgent) .. 4 = P4 (none, default). Always present.
  priority: number;
  createdAt: string;
  isCompleted: boolean;
  completedAt: string | null;
  projectId: number | null;
  labels: Label[];
  // Recurrence rule (RRULE-shaped, e.g. "FREQ=DAILY", "FREQ=WEEKLY;BYDAY=MO,WE").
  // Null = the task does not repeat. Completing a recurring task spawns the next occurrence.
  recurrence: string | null;
  // Links all occurrences of the same repeating task. Null for non-recurring tasks.
  seriesId: string | null;
  // Convenience flag, server-computed: whether the task repeats. Read-only.
  isRecurring: boolean;
  // Whether this task is tracked as a daily habit (gets check-ins + a streak).
  isHabit: boolean;
  // "x times a week" habit frequency target (1-7), or null if the habit is scheduled on
  // specific days (recurrence) / daily, or is not a habit. Mutually exclusive with recurrence.
  weeklyTarget: number | null;
  // Timestamped comments. Present on get_task (single task); absent on list_tasks.
  comments?: Comment[];
  // Subtask progress counts, present on every task (0 when none). The full rows
  // (subtasks[]) are present only on get_task, absent on list_tasks.
  subtaskCount?: number;
  completedSubtaskCount?: number;
  subtasks?: Subtask[];
}

export interface Comment {
  id: number;
  body: string;
  createdAt: string;
}

// A lightweight checklist item under a task. Title + done flag + manual order +
// optional deadline. Present on get_task; managed via the subtask tools.
export interface Subtask {
  id: number;
  title: string;
  isCompleted: boolean;
  position: number;
  deadline: string | null;
  createdAt: string;
  taskId: number;
}

// A single daily check-in on a habit task. CheckInDate is date-only (local
// midnight). One row per (task, day) - logging the same day twice is idempotent.
export interface CheckIn {
  id: number;
  checkInDate: string;
  createdAt: string;
  taskId: number;
}

// ApiError carries the HTTP status and body so callers can decide whether to
// surface a "not found" vs a generic failure to the LLM.
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    body: string,
  ) {
    super(`HTTP ${status} ${statusText}${body ? ': ' + body : ''}`);
    this.name = 'ApiError';
  }
}

// 15s upstream timeout - tasklog-api on the phone is loopback, but proot +
// SQLite can stall under load. Surface a clean 504 to the LLM so it can
// retry or tell the user rather than hanging the MCP request indefinitely.
const REQUEST_TIMEOUT_MS = 15_000;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: init?.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
  } catch (e: unknown) {
    if (
      typeof e === 'object' &&
      e !== null &&
      ((e as { name?: string }).name === 'AbortError' ||
        (e as { name?: string }).name === 'TimeoutError')
    ) {
      throw new ApiError(
        504,
        'Gateway Timeout',
        `Tasklog API did not respond within ${REQUEST_TIMEOUT_MS / 1000}s`,
      );
    }
    throw e;
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new ApiError(res.status, res.statusText, body);
  }
  // DELETE returns 204 No Content; surface as undefined.
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// --- Tasks ---

// Filter shape for listTasks(). All fields optional - omit to skip that filter.
// Mirrors the query-string shape on the backend (see TaskFilterQuery in
// TasksController.cs). Combination semantics: AND across dimensions, OR within
// projectIds / labelIds arrays. Tasks with no deadline are excluded from
// dueBefore / dueAfter filters. inbox=true with non-empty projectIds is a 400.
export interface TaskFilter {
  projectIds?: number[];
  inbox?: boolean;
  labelIds?: number[];
  dueBefore?: string; // ISO 8601 date
  dueAfter?: string;
  completed?: boolean;
  text?: string;
  priorities?: number[]; // P1-P4 values; OR within
  createdAfter?: string; // ISO 8601 datetime; inclusive >=
  createdBefore?: string; // ISO 8601 datetime; inclusive <=
  sort?: string; // created | deadline | priority
  order?: string; // asc | desc
  limit?: number; // cap result to first N after sorting
}

// Serialize the filter object into URLSearchParams, omitting undefined fields.
// Arrays are emitted as REPEATED keys (?projectIds=3&projectIds=5), which is
// what ASP.NET Core model binding binds to int[] natively. Comma-separated
// (?projectIds=3,5) does NOT bind - it tries to parse "3,5" as a single int
// and the filter silently matches nothing. Empty arrays are omitted so they
// don't accidentally filter to "no tasks". Exported only for tests; in
// production it is used internally by listTasks().
export function buildTaskQuery(filter?: TaskFilter): string {
  if (!filter) return '';
  const params = new URLSearchParams();
  if (filter.projectIds && filter.projectIds.length > 0) {
    for (const id of filter.projectIds) params.append('projectIds', String(id));
  }
  if (filter.inbox !== undefined) params.set('inbox', String(filter.inbox));
  if (filter.labelIds && filter.labelIds.length > 0) {
    for (const id of filter.labelIds) params.append('labelIds', String(id));
  }
  if (filter.dueBefore) params.set('dueBefore', filter.dueBefore);
  if (filter.dueAfter) params.set('dueAfter', filter.dueAfter);
  if (filter.completed !== undefined) params.set('completed', String(filter.completed));
  // Send the trimmed value so the wire query matches what the backend and the
  // frontend match on (all three trim before comparing).
  if (filter.text && filter.text.trim() !== '') params.set('text', filter.text.trim());
  if (filter.priorities && filter.priorities.length > 0) {
    for (const p of filter.priorities) params.append('priorities', String(p));
  }
  if (filter.createdAfter) params.set('createdAfter', filter.createdAfter);
  if (filter.createdBefore) params.set('createdBefore', filter.createdBefore);
  if (filter.sort) params.set('sort', filter.sort);
  if (filter.order) params.set('order', filter.order);
  if (filter.limit !== undefined) params.set('limit', String(filter.limit));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export const listTasks = (filter?: TaskFilter): Promise<Task[]> =>
  request(`/api/tasks${buildTaskQuery(filter)}`);

export const getTask = (id: number): Promise<Task> => request(`/api/tasks/${id}`);

export const createTask = (body: {
  title: string;
  deadline?: string;
  projectId?: number;
  priority?: number;
  description?: string;
  recurrence?: string;
  isHabit?: boolean;
  weeklyTarget?: number;
}): Promise<Task> =>
  request('/api/tasks', { method: 'POST', body: JSON.stringify(body) });

export const deleteTask = (id: number): Promise<void> =>
  request(`/api/tasks/${id}`, { method: 'DELETE' });

// Partial update of title and/or deadline. Only the keys present in `body` are
// sent (JSON.stringify omits undefined), so the backend's present-key detection
// leaves omitted fields unchanged. deadline: null clears the deadline; a string
// sets it. Pass {} and nothing changes.
export const updateTask = (
  id: number,
  body: {
    title?: string;
    deadline?: string | null;
    priority?: number;
    description?: string | null;
    recurrence?: string | null;
    isHabit?: boolean;
    weeklyTarget?: number | null;
  },
): Promise<Task> =>
  request(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(body) });

export const setTaskComplete = (id: number, isCompleted: boolean): Promise<Task> =>
  request(`/api/tasks/${id}/complete`, {
    method: 'PATCH',
    body: JSON.stringify({ isCompleted }),
  });

// projectName (when given) is resolved by name server-side and wins over projectId.
export const setTaskProject = (
  id: number,
  body: { projectId?: number | null; projectName?: string },
): Promise<Task> =>
  request(`/api/tasks/${id}/project`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });

// labelNames (when given) is resolved by name server-side and wins over labelIds.
export const setTaskLabels = (
  id: number,
  body: { labelIds?: number[]; labelNames?: string[] },
): Promise<Task> =>
  request(`/api/tasks/${id}/labels`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });

// Add a timestamped comment to a task. Returns the created comment.
export const addTaskComment = (taskId: number, body: string): Promise<Comment> =>
  request(`/api/tasks/${taskId}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });

export const listTaskComments = (taskId: number): Promise<Comment[]> =>
  request(`/api/tasks/${taskId}/comments`);

export const deleteTaskComment = (taskId: number, commentId: number): Promise<void> =>
  request(`/api/tasks/${taskId}/comments/${commentId}`, { method: 'DELETE' });

// --- Subtasks ---

// Add a checklist item to a task. deadline is an optional ISO date; omit for none.
// Returns the created subtask (positioned at the bottom of the list).
export const addSubtask = (
  taskId: number,
  title: string,
  deadline?: string,
): Promise<Subtask> =>
  request(`/api/tasks/${taskId}/subtasks`, {
    method: 'POST',
    body: JSON.stringify(deadline ? { title, deadline } : { title }),
  });

export const listSubtasks = (taskId: number): Promise<Subtask[]> =>
  request(`/api/tasks/${taskId}/subtasks`);

// Partial update: any of title / deadline (null clears) / isCompleted. Omit a
// field to leave it unchanged. Returns the updated subtask.
export const updateSubtask = (
  taskId: number,
  subtaskId: number,
  body: { title?: string; deadline?: string | null; isCompleted?: boolean },
): Promise<Subtask> =>
  request(`/api/tasks/${taskId}/subtasks/${subtaskId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });

export const deleteSubtask = (taskId: number, subtaskId: number): Promise<void> =>
  request(`/api/tasks/${taskId}/subtasks/${subtaskId}`, { method: 'DELETE' });

// Rewrite subtask order. orderedIds must be exactly the task's subtask ids in
// the desired order. Returns the reordered list.
export const reorderSubtasks = (
  taskId: number,
  orderedIds: number[],
): Promise<Subtask[]> =>
  request(`/api/tasks/${taskId}/subtasks/reorder`, {
    method: 'POST',
    body: JSON.stringify({ orderedIds }),
  });

// Mark a habit done for a day (default today). Idempotent: logging the same day
// twice returns the existing check-in rather than creating a duplicate. date is
// an optional ISO date (yyyy-MM-dd); omit for today.
export const addCheckIn = (taskId: number, date?: string): Promise<CheckIn> =>
  request(`/api/tasks/${taskId}/checkins`, {
    method: 'POST',
    body: JSON.stringify(date ? { date } : {}),
  });

export const listCheckIns = (taskId: number): Promise<CheckIn[]> =>
  request(`/api/tasks/${taskId}/checkins`);

// Undo a check-in for a given day (default today). 404 if no check-in exists for that day.
export const deleteCheckIn = (taskId: number, date?: string): Promise<void> =>
  request(`/api/tasks/${taskId}/checkins${date ? `?date=${encodeURIComponent(date)}` : ''}`, { method: 'DELETE' });

// --- Habits ---

export interface WeekStatus {
  weekStart: string;
  count: number;
  status: string; // 'met' | 'missed' | 'in_progress'
}

// The per-habit shape from GET /api/habits: task + computed streak stats.
// currentStreak unit is DAYS for daily/specific-days habits, WEEKS for frequency habits.
export interface HabitSummary {
  task: Task;
  currentStreak: number;
  doneToday: boolean;
  recentCheckIns: string[];
  weeklyTarget: number | null;
  thisWeekCount: number | null;
  recentWeeks: WeekStatus[] | null;
}

export const getHabits = (): Promise<HabitSummary[]> => request('/api/habits');

// Bulk operations: one transactional POST applies one operation to many tasks.
// data carries the per-operation payload (isCompleted / projectId / projectName /
// deadline / priority). Returns the affected tasks.
export const bulkTasks = (
  operation: 'complete' | 'assignProject' | 'setDeadline' | 'setPriority',
  taskIds: number[],
  data?: {
    isCompleted?: boolean;
    projectId?: number | null;
    projectName?: string;
    deadline?: string | null;
    priority?: number;
  },
): Promise<Task[]> =>
  request('/api/tasks/bulk', {
    method: 'POST',
    body: JSON.stringify({ operation, taskIds, data }),
  });

// --- Projects ---

export const listProjects = (): Promise<Project[]> => request('/api/projects');

export const createProject = (body: { name: string; color?: string }): Promise<Project> =>
  request('/api/projects', { method: 'POST', body: JSON.stringify(body) });

export const renameProject = (id: number, body: { name: string; color?: string | null }): Promise<Project> =>
  request(`/api/projects/${id}`, { method: 'PATCH', body: JSON.stringify(body) });

export const deleteProject = (id: number): Promise<void> =>
  request(`/api/projects/${id}`, { method: 'DELETE' });

// --- Labels ---

export const listLabels = (): Promise<Label[]> => request('/api/labels');

export const createLabel = (body: {
  name: string;
  colorIndex: number;
}): Promise<Label> =>
  request('/api/labels', { method: 'POST', body: JSON.stringify(body) });

export const updateLabel = (
  id: number,
  body: { name: string; colorIndex: number },
): Promise<Label> =>
  request(`/api/labels/${id}`, { method: 'PATCH', body: JSON.stringify(body) });

export const deleteLabel = (id: number): Promise<void> =>
  request(`/api/labels/${id}`, { method: 'DELETE' });

// --- Time Entries ---

export interface TimeEntry {
  id: number;
  taskId: number;
  taskTitle: string;
  projectId: number | null;
  projectColor: string | null;
  startedAt: string; // local ISO datetime
  endedAt: string | null; // null = currently running
  durationSeconds: number; // 0 while running
}

export const startTimer = (taskId: number): Promise<TimeEntry> =>
  request('/api/time-entries/start', { method: 'POST', body: JSON.stringify({ taskId }) });

export const stopTimer = (entryId: number): Promise<TimeEntry> =>
  request(`/api/time-entries/${entryId}/stop`, { method: 'POST' });

// GET /active returns 204 No Content when idle - handle separately.
export async function getActiveTimeEntry(): Promise<TimeEntry | null> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/time-entries/active`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: unknown) {
    if (
      typeof e === 'object' && e !== null &&
      ((e as { name?: string }).name === 'AbortError' || (e as { name?: string }).name === 'TimeoutError')
    ) {
      throw new ApiError(504, 'Gateway Timeout', `Tasklog API did not respond within ${REQUEST_TIMEOUT_MS / 1000}s`);
    }
    throw e;
  }
  if (res.status === 204) return null;
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new ApiError(res.status, res.statusText, body);
  }
  const text = await res.text();
  return text ? (JSON.parse(text) as TimeEntry) : null;
}

export const addTimeEntry = (
  taskId: number,
  startedAt: string,
  endedAt: string,
): Promise<TimeEntry> =>
  request('/api/time-entries', {
    method: 'POST',
    body: JSON.stringify({ taskId, startedAt, endedAt }),
  });

export const listTimeEntries = (from: string, to: string): Promise<TimeEntry[]> =>
  request(`/api/time-entries?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);

export const updateTimeEntry = (
  id: number,
  body: { startedAt?: string; endedAt?: string },
): Promise<TimeEntry> =>
  request(`/api/time-entries/${id}`, { method: 'PATCH', body: JSON.stringify(body) });

export const deleteTimeEntry = (id: number): Promise<void> =>
  request(`/api/time-entries/${id}`, { method: 'DELETE' });
