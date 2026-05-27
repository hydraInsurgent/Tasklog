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
  body: { title?: string; deadline?: string | null; priority?: number },
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

export const createProject = (body: { name: string }): Promise<Project> =>
  request('/api/projects', { method: 'POST', body: JSON.stringify(body) });

export const renameProject = (id: number, body: { name: string }): Promise<Project> =>
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
