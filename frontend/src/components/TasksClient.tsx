"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { Trash2, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { getTasks, createTask, deleteTask, completeTask, Task, Project } from "@/lib/api";
import { formatDate, deadlineColorClass } from "@/lib/format";
import AddTaskForm from "./AddTaskForm";
import TaskCard from "./TaskCard";

// Feedback shown briefly after an action (replaces TempData flash messages from v1).
type Feedback = { type: "success" | "error"; message: string } | null;

interface Props {
  // Controls which tasks are shown. "all" = no filter, "inbox" = unassigned,
  // number = tasks belonging to that project ID.
  activeView: "all" | "inbox" | number;
  // Full project list, used to display project names in the table.
  projects: Project[];
}

export default function TasksClient({ activeView, projects }: Props) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<Feedback>(null);
  // Track which task ID has a delete in flight, to disable that row's button.
  const [deletingId, setDeletingId] = useState<number | null>(null);
  // Track which task ID has a completion request in flight.
  const [completingId, setCompletingId] = useState<number | null>(null);
  // Tasks currently mid-animation before disappearing from the list.
  const [hidingIds, setHidingIds] = useState<Set<number>>(new Set());
  // Whether to show completed tasks in the list.
  const [showCompleted, setShowCompleted] = useState(false);
  // Stores timers for hiding tasks so they can be cleared on unmount.
  const hideTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  // Fetch all tasks. Called on mount.
  const loadTasks = useCallback(async () => {
    try {
      const data = await getTasks();
      setTasks(data);
    } catch {
      showFeedback("error", "Failed to load tasks. Is the API running?");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // Clear all pending hide timers on unmount to avoid state updates on unmounted component.
  useEffect(() => {
    const timers = hideTimers.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, []);

  // Display a feedback message that disappears after 4 seconds.
  function showFeedback(type: "success" | "error", message: string) {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 4000);
  }

  // Called by AddTaskForm on submit. Updates local state so no full reload is needed.
  // When viewing a specific project, new tasks are assigned to that project automatically.
  async function handleAdd(title: string, deadline?: string, projectId?: number | null) {
    // If the caller didn't pass a projectId but we're viewing a specific project,
    // default to that project. Inbox / All views default to null (Inbox).
    const resolvedProjectId =
      projectId !== undefined ? projectId : typeof activeView === "number" ? activeView : null;
    const task = await createTask(title, deadline, resolvedProjectId);
    setTasks((prev) => [task, ...prev]);
    showFeedback("success", "Task created.");
  }

  // Delete a task by ID. Updates local state on success.
  async function handleDelete(id: number) {
    setDeletingId(id);
    try {
      await deleteTask(id);
      setTasks((prev) => prev.filter((t) => t.id !== id));
      showFeedback("success", "Task deleted.");
    } catch {
      showFeedback("error", "Failed to delete task. Please try again.");
    } finally {
      setDeletingId(null);
    }
  }

  // Toggle completion for a task. When marking complete and not showing completed tasks,
  // the row animates out before being removed from the list.
  async function handleComplete(id: number, isCompleted: boolean) {
    setCompletingId(id);
    try {
      const updated = await completeTask(id, isCompleted);
      // Use the full returned task so completedAt is set from the server.
      setTasks((prev) =>
        prev.map((t) => (t.id === id ? updated : t))
      );
      if (isCompleted && !showCompleted) {
        // Clear any existing timer for this task before starting a new one.
        // Without this, rapidly toggling the same task orphans the old timer -
        // it can't be cancelled and fires at an unexpected moment (#10).
        const existing = hideTimers.current.get(id);
        if (existing) clearTimeout(existing);

        setHidingIds((prev) => new Set(prev).add(id));
        const timer = setTimeout(() => {
          // Keep the task in the array - the visibleTasks filter hides it when
          // showCompleted is false. Removing it here broke "Show completed" and
          // caused the toggle button to disappear when all tasks were done.
          setHidingIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
          hideTimers.current.delete(id);
        }, 1500);
        hideTimers.current.set(id, timer);
      }
    } catch {
      showFeedback("error", "Failed to update task.");
    } finally {
      setCompletingId(null);
    }
  }

  // Apply the sidebar view filter before any completed-task filtering.
  const filteredTasks = tasks.filter((t) => {
    if (activeView === "all") return true;
    if (activeView === "inbox") return t.projectId === null;
    return t.projectId === activeView;
  });

  const hasCompleted = filteredTasks.some((t) => t.isCompleted);
  const visibleTasks = filteredTasks.filter(
    (t) => showCompleted || !t.isCompleted || hidingIds.has(t.id)
  );

  // Human-readable label for the current view, used in empty state text.
  const viewLabel =
    activeView === "all"
      ? "tasks"
      : activeView === "inbox"
      ? "inbox tasks"
      : `tasks in "${projects.find((p) => p.id === activeView)?.name ?? "this project"}"`;

  // Look up a project name by ID. Returns "Inbox" for null projectId.
  function projectName(projectId: number | null): string {
    if (projectId === null) return "Inbox";
    return projects.find((p) => p.id === projectId)?.name ?? "Unknown";
  }

  return (
    <div className="space-y-6">
      {/* Inline feedback message (color + icon: color-not-only-indicator rule). */}
      {feedback && (
        <div
          role="alert"
          className={`flex items-center gap-2 px-4 py-3 rounded-md text-sm font-medium ${
            feedback.type === "success"
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {feedback.type === "success" ? (
            <CheckCircle size={16} aria-hidden="true" />
          ) : (
            <XCircle size={16} aria-hidden="true" />
          )}
          {feedback.message}
        </div>
      )}

      {/* Task list panel */}
      <div className="bg-white border border-zinc-200 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-200 flex items-center justify-between">
          <h1
            className="text-lg font-semibold text-zinc-900"
            style={{ fontFamily: "var(--font-space-grotesk), sans-serif" }}
          >
            {activeView === "all"
              ? "All Tasks"
              : activeView === "inbox"
              ? "Inbox"
              : projects.find((p) => p.id === activeView)?.name ?? "Tasks"}
          </h1>
          {hasCompleted && (
            <button
              onClick={() => {
                setShowCompleted((prev) => {
                  const next = !prev;
                  if (next) {
                    // Turning "show completed" on - cancel all pending hide timers
                    // and clear animation state so tasks appear immediately (#11).
                    hideTimers.current.forEach((t) => clearTimeout(t));
                    hideTimers.current.clear();
                    setHidingIds(new Set());
                  }
                  return next;
                });
              }}
              className="text-sm text-zinc-500 hover:text-zinc-900 focus:outline-none focus:underline transition-colors duration-150 cursor-pointer"
            >
              {showCompleted ? "Hide completed" : "Show completed"}
            </button>
          )}
        </div>

        {loading ? (
          // Loading state: spinner (loading-states rule).
          <div className="flex items-center justify-center gap-2 py-16 text-zinc-400">
            <Loader2 size={20} className="animate-spin" aria-hidden="true" />
            <span>Loading tasks...</span>
          </div>
        ) : filteredTasks.length === 0 ? (
          <p className="py-16 text-center text-zinc-400 text-sm">
            No {viewLabel} yet. Add one below.
          </p>
        ) : (
          <>
          {/* Desktop table - hidden on mobile to avoid horizontal scroll. */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 text-left">
                  <th className="pl-6 pr-2 py-3 w-8">
                    <span className="sr-only">Complete</span>
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wide">
                    Title
                  </th>
                  {/* Project column - only meaningful in the All Tasks view */}
                  {activeView === "all" && (
                    <th className="px-6 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wide">
                      Project
                    </th>
                  )}
                  <th className="px-6 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wide">
                    Deadline
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wide">
                    Created
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wide">
                    Completed
                  </th>
                  <th className="px-6 py-3 w-12">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {visibleTasks.map((task) => {
                  const isHiding = hidingIds.has(task.id);
                  const isCompletedAndVisible = task.isCompleted && !isHiding;
                  return (
                    <tr
                      key={task.id}
                      className={`hover:bg-zinc-50 transition-colors duration-150${
                        isHiding ? " transition-all duration-300 opacity-0 translate-y-1" : ""
                      }${isCompletedAndVisible ? " opacity-50" : ""}`}
                    >
                      {/* Completion checkbox */}
                      <td className="pl-6 pr-2 py-4">
                        <input
                          type="checkbox"
                          checked={task.isCompleted}
                          onChange={(e) => handleComplete(task.id, e.target.checked)}
                          disabled={completingId === task.id}
                          aria-label={`Mark ${task.title} as ${task.isCompleted ? "incomplete" : "complete"}`}
                          className="w-4 h-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                        />
                      </td>

                      {/* Task title: links to detail page */}
                      <td className="px-6 py-4">
                        <Link
                          href={`/tasks/${task.id}`}
                          className="text-zinc-900 font-medium hover:text-blue-600 focus:outline-none focus:underline transition-colors duration-150"
                        >
                          {task.title}
                        </Link>
                      </td>

                      {/* Project cell - only shown in All Tasks view */}
                      {activeView === "all" && (
                        <td className="px-6 py-4 text-zinc-500 text-sm">
                          {projectName(task.projectId)}
                        </td>
                      )}

                      {/* Deadline with proximity-based color */}
                      <td
                        className={`px-6 py-4 ${deadlineColorClass(task.deadline)}`}
                      >
                        {task.deadline ? formatDate(task.deadline) : (
                          <span className="text-zinc-300">--</span>
                        )}
                      </td>

                      {/* Creation date */}
                      <td className="px-6 py-4 text-zinc-500">
                        {formatDate(task.createdAt)}
                      </td>

                      {/* Completion date - shown when task is done, dash otherwise */}
                      <td className="px-6 py-4 text-zinc-500">
                        {task.completedAt ? (
                          <span className="text-green-600">{formatDate(task.completedAt)}</span>
                        ) : (
                          <span className="text-zinc-300">--</span>
                        )}
                      </td>

                      {/* Delete button: min 44px touch target, aria-label, disabled during request. */}
                      <td className="px-6 py-4">
                        <button
                          onClick={() => handleDelete(task.id)}
                          disabled={deletingId === task.id}
                          aria-label={`Delete task: ${task.title}`}
                          className="flex items-center justify-center w-8 h-8 min-w-[44px] min-h-[44px] text-zinc-400 hover:text-red-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors duration-150 cursor-pointer"
                        >
                          {deletingId === task.id ? (
                            <Loader2
                              size={16}
                              className="animate-spin"
                              aria-hidden="true"
                            />
                          ) : (
                            <Trash2 size={16} aria-hidden="true" />
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile card list - shown below md: breakpoint, hidden on desktop. */}
          <div className="md:hidden">
            {visibleTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                projects={projects}
                activeView={activeView}
                onComplete={handleComplete}
                onDelete={handleDelete}
                deletingId={deletingId}
                completingId={completingId}
                isHiding={hidingIds.has(task.id)}
              />
            ))}
          </div>
          </>
        )}
      </div>

      {/* Add task form - pass projects for dropdown and pre-select the active project */}
      <AddTaskForm
        onAdd={handleAdd}
        projects={projects}
        defaultProjectId={typeof activeView === "number" ? activeView : null}
      />
    </div>
  );
}
