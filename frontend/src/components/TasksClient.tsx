"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { usePolling } from "@/hooks/usePolling";
import Link from "next/link";
import { Trash2, CheckCircle, XCircle, Loader2, MoreHorizontal, Plus } from "lucide-react";
import { getTasks, createTask, deleteTask, completeTask, getLabels, setTaskLabels, Task, Project, Label } from "@/lib/api";
import { formatDate, deadlineColorClass, projectName, labelColor } from "@/lib/format";
import AddTaskForm from "./AddTaskForm";
import TaskCard from "./TaskCard";
import FilterPanel, { FilterState, EMPTY_FILTER, hasActiveFilters, activeFilterCount } from "./FilterPanel";

// Feedback shown briefly after an action (replaces TempData flash messages from v1).
type Feedback = { type: "success" | "error"; message: string } | null;

interface Props {
  // Controls which tasks are shown. "all" = no filter, "inbox" = unassigned,
  // number = tasks belonging to that project ID.
  activeView: "all" | "inbox" | number;
  // Full project list, used to display project names in the table.
  projects: Project[];
  // Additional filter criteria applied on top of activeView.
  filterState: FilterState;
  // Called when the user applies new filters from the panel.
  onFilterChange: (fs: FilterState) => void;
}

export default function TasksClient({ activeView, projects, filterState, onFilterChange }: Props) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [allLabels, setAllLabels] = useState<Label[]>([]);
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
  // Whether the filter panel popover is open.
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  // Ref for the filter trigger button, used to position the panel.
  const filterButtonRef = useRef<HTMLDivElement>(null);

  // Fetch all tasks and labels in parallel. Called on mount.
  const loadTasks = useCallback(async () => {
    try {
      // Fetch tasks and labels concurrently - neither depends on the other.
      const [data, labelsData] = await Promise.all([getTasks(), getLabels()]);
      setTasks(data);
      setAllLabels(labelsData);
    } catch {
      showFeedback("error", "Failed to load tasks. Is the API running?");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // Background polling: refresh tasks and labels every 30 seconds.
  // Pauses automatically when the tab is hidden or when the user has an
  // in-flight operation (delete, complete, hide animation) to avoid
  // overwriting optimistic state.
  const pollEnabled =
    deletingId === null && completingId === null && hidingIds.size === 0;

  usePolling(
    useCallback(async () => {
      const [freshTasks, freshLabels] = await Promise.all([getTasks(), getLabels()]);
      setTasks(freshTasks);
      setAllLabels(freshLabels);
    }, []),
    30000,
    pollEnabled,
  );

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
  async function handleAdd(title: string, deadline?: string, projectId?: number | null, labelIds?: number[]) {
    // If the caller didn't pass a projectId but we're viewing a specific project,
    // default to that project. Inbox / All views default to null (Inbox).
    const resolvedProjectId =
      projectId !== undefined ? projectId : typeof activeView === "number" ? activeView : null;
    let task = await createTask(title, deadline, resolvedProjectId);

    // Apply labels immediately after creation if any were selected.
    // setTaskLabels returns the updated task with labels populated.
    if (labelIds && labelIds.length > 0) {
      task = await setTaskLabels(task.id, labelIds);
    }

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

  // Apply the sidebar view filter, then the additional filter panel criteria.
  const filteredTasks = tasks.filter((t) => {
    // 1. Sidebar view filter.
    if (activeView === "inbox" && t.projectId !== null) return false;
    if (typeof activeView === "number" && t.projectId !== activeView) return false;

    // 2. Label filter - task must have at least one of the selected labels.
    if (filterState.labelIds.length > 0) {
      const taskLabelIds = t.labels.map((l) => l.id);
      if (!filterState.labelIds.some((id) => taskLabelIds.includes(id))) return false;
    }

    // 3. Project filter from the filter panel (only meaningful in "all" view).
    // projectId is null for Inbox tasks - check explicitly rather than using a sentinel value.
    if (filterState.projectIds.length > 0 && activeView === "all") {
      const pid = t.projectId;
      const matches = pid !== null && filterState.projectIds.includes(pid);
      if (!matches) return false;
    }

    // 4. Date filter.
    if (filterState.dateFilter !== "none") {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekEnd = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);
      const deadline = t.deadline ? new Date(t.deadline) : null;

      if (filterState.dateFilter === "today") {
        if (!deadline) return false;
        const d = new Date(deadline.getFullYear(), deadline.getMonth(), deadline.getDate());
        if (d.getTime() !== todayStart.getTime()) return false;
      }
      if (filterState.dateFilter === "this-week") {
        if (!deadline) return false;
        if (deadline < todayStart || deadline >= weekEnd) return false;
      }
      // Overdue: deadline is before today's midnight in the browser's local time.
      // Deadlines are stored as date-only strings (YYYY-MM-DD) from the backend,
      // so timezone ambiguity is minimal - the filter matches user-local calendar dates.
      if (filterState.dateFilter === "overdue") {
        if (!deadline || t.isCompleted) return false;
        if (deadline >= todayStart) return false;
      }
    }

    return true;
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
      <div className="bg-white border border-zinc-200 rounded-lg">
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

          {/* Right side: add task shortcut + show completed toggle + filter button */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                const el = document.getElementById("task-title") as HTMLInputElement | null;
                if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.focus(); }
              }}
              className="hidden md:flex items-center gap-2 px-4 py-2 bg-zinc-900 text-white text-sm font-medium rounded-md hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:ring-offset-2 transition-colors duration-150 cursor-pointer"
            >
              <Plus size={16} aria-hidden="true" />
              Add Task
            </button>
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

            {/* Filter button - three-dot menu opens the filter panel. */}
            <div ref={filterButtonRef} className="relative">
              <button
                onClick={() => setFilterPanelOpen((prev) => !prev)}
                aria-label="Filter tasks"
                aria-expanded={filterPanelOpen}
                className="relative flex items-center justify-center w-8 h-8 min-w-[44px] min-h-[44px] text-zinc-400 hover:text-zinc-700 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-1 rounded transition-colors duration-150 cursor-pointer"
              >
                <MoreHorizontal size={16} aria-hidden="true" />
                {/* Active filter count badge */}
                {hasActiveFilters(filterState) && (
                  <span className="absolute top-1 right-1 flex items-center justify-center w-4 h-4 rounded-full bg-blue-600 text-white text-[10px] font-bold leading-none">
                    {activeFilterCount(filterState)}
                  </span>
                )}
              </button>

              {/* Filter panel popover */}
              {filterPanelOpen && (
                <FilterPanel
                  filterState={filterState}
                  allLabels={allLabels}
                  allProjects={projects}
                  onApply={(fs) => {
                    onFilterChange(fs);
                    setFilterPanelOpen(false);
                  }}
                  onClose={() => setFilterPanelOpen(false)}
                />
              )}
            </div>
          </div>
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
          <div className="hidden md:block overflow-x-auto overflow-hidden rounded-b-lg">
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
                    Labels
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
                          {projectName(task.projectId, projects)}
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

                      {/* Labels - shown as #labelname in the label's color */}
                      <td className="px-6 py-4">
                        {task.labels && task.labels.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {task.labels.map((label) => (
                              <span
                                key={label.id}
                                className="text-xs font-medium"
                                style={{ color: labelColor(label.colorIndex) }}
                              >
                                #{label.name}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-zinc-300">--</span>
                        )}
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
          <div className="md:hidden overflow-hidden rounded-b-lg">
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

      {/* Add task form - pass projects and labels for dropdowns, pre-select the active project */}
      <AddTaskForm
        onAdd={handleAdd}
        projects={projects}
        defaultProjectId={typeof activeView === "number" ? activeView : null}
        allLabels={allLabels}
      />
    </div>
  );
}
