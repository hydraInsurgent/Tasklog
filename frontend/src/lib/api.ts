// API client for the Tasklog .NET Web API.
// The base URL is resolved by getApiUrl() differently for server and browser:
//
// Server-side (SSR/Next.js Node process):
//   Uses API_URL env var if set (production: http://localhost:5115 on the VM),
//   otherwise falls back to localhost:5115. Server-to-server call - never goes through nginx.
//
// Client-side (browser):
//   Uses NEXT_PUBLIC_API_URL env var if set (production: https://tasklog.manudubey.in),
//   otherwise derives from the browser's hostname with port 5115 (dev LAN access from phone).

function getApiUrl(): string {
  if (typeof window === "undefined") {
    // Server-side: API_URL is a private env var set on the VM; not exposed to the browser.
    return process.env.API_URL ?? "http://localhost:5115";
  }
  // Client-side: NEXT_PUBLIC_API_URL is baked into the browser bundle at build time.
  return process.env.NEXT_PUBLIC_API_URL ?? `http://${window.location.hostname}:5115`;
}

// The shape returned by the API for every project.
export interface Project {
  id: number;
  name: string;
  createdAt: string; // ISO 8601 datetime string
}

// The shape returned by the API for every label.
export interface Label {
  id: number;
  name: string;
  // Index into the 10-color VIBGYOR palette (0-9). Use labelColor() from lib/format.ts to resolve hex.
  colorIndex: number;
  createdAt: string; // ISO 8601 datetime string
}

// The shape returned by the API for every task.
export interface Task {
  id: number;
  title: string;
  // Optional free-text notes/context. Null = no description.
  description: string | null;
  deadline: string | null; // ISO 8601 date string or null
  // Server-computed due bucket relative to today. Read-only (the API never accepts it).
  // Available for display; the deadline pill keeps its own color thresholds (see format.ts).
  dueStatus: "overdue" | "today" | "this_week" | "later" | "none";
  // Todoist priority: 1=P1 (urgent) .. 4=P4 (none, default). Always present.
  priority: number;
  createdAt: string;       // ISO 8601 date string
  isCompleted: boolean;    // Whether the task has been marked done
  completedAt: string | null; // ISO 8601 datetime when completed, or null
  // The project this task belongs to. Null means the task is in the Inbox (uncategorized).
  projectId: number | null;
  // Labels applied to this task. Always present (empty array if none).
  labels: Label[];
  // Timestamped comments. Present on getTask (detail); absent on the list.
  comments?: Comment[];
}

// A timestamped free-text note on a task.
export interface Comment {
  id: number;
  body: string;
  createdAt: string;
}

// GET /api/tasks - fetch all tasks ordered by creation date (newest first).
export async function getTasks(): Promise<Task[]> {
  const res = await fetch(`${getApiUrl()}/api/tasks`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch tasks.");
  return res.json();
}

// GET /api/tasks/:id - fetch a single task by ID.
export async function getTask(id: number): Promise<Task> {
  const res = await fetch(`${getApiUrl()}/api/tasks/${id}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Task ${id} not found.`);
  return res.json();
}

// POST /api/tasks - create a new task. Returns the created task.
export async function createTask(
  title: string,
  deadline?: string,
  projectId?: number | null,
  priority?: number,
  description?: string
): Promise<Task> {
  const res = await fetch(`${getApiUrl()}/api/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, deadline: deadline ?? null, projectId: projectId ?? null, priority, description }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? "Failed to create task.");
  }
  return res.json();
}

// DELETE /api/tasks/:id - delete a task. Returns nothing on success.
export async function deleteTask(id: number): Promise<void> {
  const res = await fetch(`${getApiUrl()}/api/tasks/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Failed to delete task ${id}.`);
}

// PATCH /api/tasks/:id - partial update of title and/or deadline.
// Only the keys present in `fields` are sent; the backend leaves omitted
// fields unchanged. deadline: null clears the deadline, a string sets it.
// Returns the updated task.
export async function updateTask(
  id: number,
  fields: { title?: string; deadline?: string | null; priority?: number; description?: string | null },
): Promise<Task> {
  const res = await fetch(`${getApiUrl()}/api/tasks/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  });
  if (!res.ok) throw new Error(`Failed to update task ${id}.`);
  return res.json();
}

// PATCH /api/tasks/:id/complete - mark a task complete or incomplete.
// Returns the updated task.
export async function completeTask(id: number, isCompleted: boolean): Promise<Task> {
  const res = await fetch(`${getApiUrl()}/api/tasks/${id}/complete`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isCompleted }),
  });
  if (!res.ok) throw new Error(`Failed to update task ${id}.`);
  return res.json();
}

// POST /api/tasks/bulk - apply one operation to many tasks in a single
// transaction. data carries the per-operation payload. Returns the affected tasks.
export type BulkOperation = "complete" | "assignProject" | "setDeadline" | "setPriority";
export async function bulkTasks(
  operation: BulkOperation,
  taskIds: number[],
  data?: { isCompleted?: boolean; projectId?: number | null; deadline?: string | null; priority?: number },
): Promise<Task[]> {
  const res = await fetch(`${getApiUrl()}/api/tasks/bulk`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operation, taskIds, data }),
  });
  if (!res.ok) {
    // Surface the backend's specific message (e.g. "Project 999 not found")
    // instead of a flat failure, so the caller can tell a bad request apart
    // from a server error. Fall back to the status if the body has no message.
    const message = await res
      .json()
      .then((b) => b?.message)
      .catch(() => null);
    throw new Error(message || `Bulk operation failed (HTTP ${res.status}).`);
  }
  return res.json();
}

// POST /api/tasks/:id/comments - add a comment. Returns the created comment.
export async function addComment(taskId: number, body: string): Promise<Comment> {
  const res = await fetch(`${getApiUrl()}/api/tasks/${taskId}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
  });
  if (!res.ok) {
    const b = await res.json().then((x) => x?.message).catch(() => null);
    throw new Error(b || "Failed to add comment.");
  }
  return res.json();
}

// DELETE /api/tasks/:id/comments/:commentId - remove a comment.
export async function deleteComment(taskId: number, commentId: number): Promise<void> {
  const res = await fetch(`${getApiUrl()}/api/tasks/${taskId}/comments/${commentId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete comment.");
}

// GET /api/projects - fetch all projects.
export async function getProjects(): Promise<Project[]> {
  const res = await fetch(`${getApiUrl()}/api/projects`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch projects.");
  return res.json();
}

// POST /api/projects - create a new project. Returns the created project.
export async function createProject(name: string): Promise<Project> {
  const res = await fetch(`${getApiUrl()}/api/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error("Failed to create project.");
  return res.json();
}

// PATCH /api/projects/:id - rename a project. Returns the updated project.
export async function renameProject(id: number, name: string): Promise<Project> {
  const res = await fetch(`${getApiUrl()}/api/projects/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`Failed to rename project ${id}.`);
  return res.json();
}

// DELETE /api/projects/:id - delete a project. Returns nothing on success.
export async function deleteProject(id: number): Promise<void> {
  const res = await fetch(`${getApiUrl()}/api/projects/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Failed to delete project ${id}.`);
}

// PATCH /api/tasks/:taskId/project - assign a task to a project (or null for Inbox).
// Returns the updated task.
export async function assignTaskProject(taskId: number, projectId: number | null): Promise<Task> {
  const res = await fetch(`${getApiUrl()}/api/tasks/${taskId}/project`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId }),
  });
  if (!res.ok) throw new Error(`Failed to assign project for task ${taskId}.`);
  return res.json();
}

// PATCH /api/tasks/:taskId/labels - replace the full label set on a task.
// Pass an empty array to remove all labels. Returns the updated task.
export async function setTaskLabels(taskId: number, labelIds: number[]): Promise<Task> {
  const res = await fetch(`${getApiUrl()}/api/tasks/${taskId}/labels`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ labelIds }),
  });
  if (!res.ok) throw new Error(`Failed to update labels for task ${taskId}.`);
  return res.json();
}

// GET /api/labels - fetch all labels ordered alphabetically.
export async function getLabels(): Promise<Label[]> {
  const res = await fetch(`${getApiUrl()}/api/labels`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch labels.");
  return res.json();
}

// POST /api/labels - create a new label. Returns the created label.
export async function createLabel(name: string, colorIndex: number): Promise<Label> {
  const res = await fetch(`${getApiUrl()}/api/labels`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, colorIndex }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? "Failed to create label.");
  }
  return res.json();
}

// PATCH /api/labels/:id - update a label's name and/or color. Returns the updated label.
export async function updateLabel(id: number, name: string, colorIndex: number): Promise<Label> {
  const res = await fetch(`${getApiUrl()}/api/labels/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, colorIndex }),
  });
  if (!res.ok) throw new Error(`Failed to update label ${id}.`);
  return res.json();
}

// DELETE /api/labels/:id - delete a label. Unlinks it from all tasks (tasks are not deleted).
export async function deleteLabel(id: number): Promise<void> {
  const res = await fetch(`${getApiUrl()}/api/labels/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Failed to delete label ${id}.`);
}
