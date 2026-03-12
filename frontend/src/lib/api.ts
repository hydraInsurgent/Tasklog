// API client for the Tasklog .NET Web API.
// All functions talk to the base URL defined in NEXT_PUBLIC_API_URL.

const API_URL = process.env.NEXT_PUBLIC_API_URL;

// The shape returned by the API for every task.
export interface Task {
  id: number;
  title: string;
  deadline: string | null; // ISO 8601 date string or null
  createdAt: string;       // ISO 8601 date string
  isCompleted: boolean;    // Whether the task has been marked done
  completedAt: string | null; // ISO 8601 datetime when completed, or null
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
  deadline?: string
): Promise<Task> {
  const res = await fetch(`${API_URL}/api/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, deadline: deadline ?? null }),
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
