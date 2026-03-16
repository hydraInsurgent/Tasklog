// API client for the Tasklog .NET Web API.
// All functions talk to the base URL defined in NEXT_PUBLIC_API_URL.

const API_URL = process.env.NEXT_PUBLIC_API_URL;

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
  deadline: string | null; // ISO 8601 date string or null
  createdAt: string;       // ISO 8601 date string
  isCompleted: boolean;    // Whether the task has been marked done
  completedAt: string | null; // ISO 8601 datetime when completed, or null
  // The project this task belongs to. Null means the task is in the Inbox (uncategorized).
  projectId: number | null;
  // Labels applied to this task. Always present (empty array if none).
  labels: Label[];
}

// GET /api/tasks - fetch all tasks ordered by creation date (newest first).
export async function getTasks(): Promise<Task[]> {
  const res = await fetch(`${API_URL}/api/tasks`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch tasks.");
  return res.json();
}

// GET /api/tasks/:id - fetch a single task by ID.
export async function getTask(id: number): Promise<Task> {
  const res = await fetch(`${API_URL}/api/tasks/${id}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Task ${id} not found.`);
  return res.json();
}

// POST /api/tasks - create a new task. Returns the created task.
export async function createTask(
  title: string,
  deadline?: string,
  projectId?: number | null
): Promise<Task> {
  const res = await fetch(`${API_URL}/api/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, deadline: deadline ?? null, projectId: projectId ?? null }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? "Failed to create task.");
  }
  return res.json();
}

// DELETE /api/tasks/:id - delete a task. Returns nothing on success.
export async function deleteTask(id: number): Promise<void> {
  const res = await fetch(`${API_URL}/api/tasks/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Failed to delete task ${id}.`);
}

// PATCH /api/tasks/:id/complete - mark a task complete or incomplete.
// Returns the updated task.
export async function completeTask(id: number, isCompleted: boolean): Promise<Task> {
  const res = await fetch(`${API_URL}/api/tasks/${id}/complete`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isCompleted }),
  });
  if (!res.ok) throw new Error(`Failed to update task ${id}.`);
  return res.json();
}

// GET /api/projects - fetch all projects.
export async function getProjects(): Promise<Project[]> {
  const res = await fetch(`${API_URL}/api/projects`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch projects.");
  return res.json();
}

// POST /api/projects - create a new project. Returns the created project.
export async function createProject(name: string): Promise<Project> {
  const res = await fetch(`${API_URL}/api/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error("Failed to create project.");
  return res.json();
}

// PATCH /api/projects/:id - rename a project. Returns the updated project.
export async function renameProject(id: number, name: string): Promise<Project> {
  const res = await fetch(`${API_URL}/api/projects/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`Failed to rename project ${id}.`);
  return res.json();
}

// DELETE /api/projects/:id - delete a project. Returns nothing on success.
export async function deleteProject(id: number): Promise<void> {
  const res = await fetch(`${API_URL}/api/projects/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Failed to delete project ${id}.`);
}

// PATCH /api/tasks/:taskId/project - assign a task to a project (or null for Inbox).
// Returns the updated task.
export async function assignTaskProject(taskId: number, projectId: number | null): Promise<Task> {
  const res = await fetch(`${API_URL}/api/tasks/${taskId}/project`, {
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
  const res = await fetch(`${API_URL}/api/tasks/${taskId}/labels`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ labelIds }),
  });
  if (!res.ok) throw new Error(`Failed to update labels for task ${taskId}.`);
  return res.json();
}

// GET /api/labels - fetch all labels ordered alphabetically.
export async function getLabels(): Promise<Label[]> {
  const res = await fetch(`${API_URL}/api/labels`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch labels.");
  return res.json();
}

// POST /api/labels - create a new label. Returns the created label.
export async function createLabel(name: string, colorIndex: number): Promise<Label> {
  const res = await fetch(`${API_URL}/api/labels`, {
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
  const res = await fetch(`${API_URL}/api/labels/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, colorIndex }),
  });
  if (!res.ok) throw new Error(`Failed to update label ${id}.`);
  return res.json();
}

// DELETE /api/labels/:id - delete a label. Unlinks it from all tasks (tasks are not deleted).
export async function deleteLabel(id: number): Promise<void> {
  const res = await fetch(`${API_URL}/api/labels/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Failed to delete label ${id}.`);
}
