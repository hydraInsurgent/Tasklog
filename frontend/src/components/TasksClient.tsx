"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { usePolling } from "@/hooks/usePolling";
import Link from "next/link";
import { Trash2, CheckCircle, XCircle, Loader2, MoreHorizontal, Plus, Pencil, ListChecks } from "lucide-react";
import { getTasks, createTask, deleteTask, completeTask, getLabels, setTaskLabels, updateTask, bulkTasks, BulkOperation, Task, Project, Label } from "@/lib/api";
import { formatDate, formatDeadline, deadlineColorClass, projectName, labelColor } from "@/lib/format";
import AddTaskForm from "./AddTaskForm";
import TaskCard from "./TaskCard";
import EditTaskModal from "./EditTaskModal";
import DeadlinePopover from "./DeadlinePopover";
import BulkActionsBar from "./BulkActionsBar";
import PriorityDot from "./PriorityDot";
import RecurringBadge from "./RecurringBadge";
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
  // The task currently open in the edit modal (null = modal closed).
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  // Which task's deadline quick-popover is open in the DESKTOP table (mobile
  // cards manage their own popover state internally).
  const [deadlinePopoverId, setDeadlinePopoverId] = useState<number | null>(null);
  // Multi-select state. selectionMode toggles the selection checkboxes + bulk bar.
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  // True while a bulk request is in flight (disables the bulk bar actions).
  const [bulkBusy, setBulkBusy] = useState(false);

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
    deletingId === null && completingId === null && hidingIds.size === 0 &&
    editingTask === null && deadlinePopoverId === null && !selectionMode;

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

  // --- Multi-select ---

  // Leave select mode and drop the selection. Clears BOTH the mode flag and the
  // selection set - the latter is what lets the bulk bar's `size > 0` render
  // guard hide the bar. Called on Cancel/Done, after a bulk action, and whenever
  // the view/filter changes (so we never act on tasks the user can no longer see).
  const exitSelectMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  // Changing the sidebar view or filters clears any in-progress selection.
  useEffect(() => {
    exitSelectMode();
  }, [activeView, filterState, exitSelectMode]);

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Apply a bulk operation to the current selection, then merge the returned
  // tasks back into local state and exit select mode.
  async function handleBulk(
    operation: BulkOperation,
    data?: { isCompleted?: boolean; projectId?: number | null; deadline?: string | null; priority?: number },
  ) {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setBulkBusy(true);
    try {
      const updated = await bulkTasks(operation, ids, data);
      const byId = new Map(updated.map((t) => [t.id, t]));
      setTasks((prev) => prev.map((t) => byId.get(t.id) ?? t));
      const verb =
        operation === "complete"
          ? data?.isCompleted
            ? "completed"
            : "reopened"
          : operation === "assignProject"
          ? "moved"
          : "updated";
      showFeedback("success", `${updated.length} task${updated.length === 1 ? "" : "s"} ${verb}.`);
      exitSelectMode();
    } catch (err) {
      // Surface the backend's specific reason (bulkTasks extracts it) so a bad
      // selection reads differently from a server error.
      showFeedback("error", err instanceof Error ? err.message : "Bulk action failed. Please try again.");
    } finally {
      setBulkBusy(false);
    }
  }

  // Called by AddTaskForm on submit. Updates local state so no full reload is needed.
  // When viewing a specific project, new tasks are assigned to that project automatically.
  async function handleAdd(title: string, deadline?: string, projectId?: number | null, labelIds?: number[], priority?: number, description?: string, recurrence?: string, isHabit?: boolean) {
    // If the caller didn't pass a projectId but we're viewing a specific project,
    // default to that project. Inbox / All views default to null (Inbox).
    const resolvedProjectId =
      projectId !== undefined ? projectId : typeof activeView === "number" ? activeView : null;
    let task = await createTask(title, deadline, resolvedProjectId, priority, description, recurrence, isHabit);

    // Apply labels immediately after creation if any were selected.
    // setTaskLabels returns the updated task with labels populated.
    if (labelIds && labelIds.length > 0) {
      task = await setTaskLabels(task.id, labelIds);
    }

    setTasks((prev) => [task, ...prev]);
    showFeedback("success", "Task created.");
  }

  // Called by EditTaskModal after a successful save with the canonical task.
  // Replace it in local state so the list reflects the edit without a reload.
  function handleSaved(updated: Task) {
    setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    setEditingTask(null);
    showFeedback("success", "Task updated.");
  }

  // Quick deadline change from the popover (desktop rows + mobile cards).
  // Patches just the deadline and updates local state with the returned task.
  async function handleDeadlineQuickSet(id: number, deadline: string | null) {
    try {
      const updated = await updateTask(id, { deadline });
      setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
      showFeedback("success", deadline ? "Deadline updated." : "Deadline cleared.");
    } catch {
      showFeedback("error", "Failed to update deadline. Please try again.");
    }
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

      // Completing a recurring task spawns the next occurrence server-side. Pull
      // it in immediately (instead of waiting for the next poll) by fetching and
      // adding only the tasks we don't already have, so the new occurrence shows
      // up without disturbing the completed row's hide animation.
      if (isCompleted && updated.isRecurring) {
        try {
          const fresh = await getTasks();
          setTasks((prev) => {
            const known = new Set(prev.map((t) => t.id));
            const spawned = fresh.filter((t) => !known.has(t.id));
            return spawned.length > 0 ? [...spawned, ...prev] : prev;
          });
        } catch {
          // Non-fatal: the background poll will surface the new occurrence shortly.
        }
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

    // 5. Text filter - case-insensitive substring on the title. Whitespace-only
    // text is treated as no filter (matches the backend behaviour).
    const text = filterState.text.trim().toLowerCase();
    if (text !== "") {
      if (!t.title.toLowerCase().includes(text)) return false;
    }

    // 6. Priority filter - OR within the selected priorities (matches labels).
    if (filterState.priorities.length > 0) {
      if (!filterState.priorities.includes(t.priority)) return false;
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
      <div className="bg-white border border-border rounded-lg">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h1
            className="text-lg font-semibold text-text-primary"
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
              className="hidden md:flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-md hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 transition-colors duration-150 cursor-pointer"
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
                className="text-sm text-text-muted hover:text-text-primary focus:outline-none focus:underline transition-colors duration-150 cursor-pointer"
              >
                {showCompleted ? "Hide completed" : "Show completed"}
              </button>
            )}

            {/* Select toggle - enters/leaves multi-select mode. Shown only when
                there are tasks to select. */}
            {!loading && filteredTasks.length > 0 && (
              <button
                onClick={() => (selectionMode ? exitSelectMode() : setSelectionMode(true))}
                aria-pressed={selectionMode}
                className={`flex items-center gap-1.5 text-sm focus:outline-none focus:underline transition-colors duration-150 cursor-pointer ${
                  selectionMode ? "text-accent font-medium" : "text-text-muted hover:text-text-primary"
                }`}
              >
                <ListChecks size={16} aria-hidden="true" />
                {selectionMode ? "Done" : "Select"}
              </button>
            )}

            {/* Filter button - three-dot menu opens the filter panel. */}
            <div ref={filterButtonRef} className="relative">
              <button
                onClick={() => setFilterPanelOpen((prev) => !prev)}
                aria-label="Filter tasks"
                aria-expanded={filterPanelOpen}
                className="relative flex items-center justify-center w-8 h-8 min-w-[44px] min-h-[44px] text-text-muted hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 rounded transition-colors duration-150 cursor-pointer"
              >
                <MoreHorizontal size={16} aria-hidden="true" />
                {/* Active filter count badge */}
                {hasActiveFilters(filterState) && (
                  <span className="absolute top-1 right-1 flex items-center justify-center w-4 h-4 rounded-full bg-accent text-white text-[10px] font-bold leading-none">
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
          <div className="flex items-center justify-center gap-2 py-16 text-text-muted">
            <Loader2 size={20} className="animate-spin" aria-hidden="true" />
            <span>Loading tasks...</span>
          </div>
        ) : filteredTasks.length === 0 ? (
          <p className="py-16 text-center text-text-muted text-sm">
            No {viewLabel} yet. Add one below.
          </p>
        ) : (
          <>
          {/* Desktop table - hidden on mobile to avoid horizontal scroll. */}
          <div className="hidden md:block overflow-x-auto overflow-hidden rounded-b-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-muted text-left">
                  {/* Select-all checkbox - only in select mode. */}
                  {selectionMode && (
                    <th className="pl-6 pr-2 py-3 w-8">
                      <input
                        type="checkbox"
                        checked={visibleTasks.length > 0 && visibleTasks.every((t) => selectedIds.has(t.id))}
                        onChange={(e) =>
                          setSelectedIds(
                            e.target.checked ? new Set(visibleTasks.map((t) => t.id)) : new Set(),
                          )
                        }
                        aria-label="Select all tasks"
                        className="w-4 h-4 rounded border-border text-accent focus:ring-2 focus:ring-accent cursor-pointer"
                      />
                    </th>
                  )}
                  <th className={`${selectionMode ? "pl-2" : "pl-6"} pr-2 py-3 w-8`}>
                    <span className="sr-only">Complete</span>
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-text-muted uppercase tracking-wide">
                    Title
                  </th>
                  {/* Project column - only meaningful in the All Tasks view */}
                  {activeView === "all" && (
                    <th className="px-6 py-3 text-xs font-medium text-text-muted uppercase tracking-wide">
                      Project
                    </th>
                  )}
                  <th className="px-6 py-3 text-xs font-medium text-text-muted uppercase tracking-wide">
                    Deadline
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-text-muted uppercase tracking-wide">
                    Created
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-text-muted uppercase tracking-wide">
                    Labels
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-text-muted uppercase tracking-wide">
                    Completed
                  </th>
                  <th className="px-6 py-3 w-12">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-muted">
                {visibleTasks.map((task) => {
                  const isHiding = hidingIds.has(task.id);
                  const isCompletedAndVisible = task.isCompleted && !isHiding;
                  return (
                    <tr
                      key={task.id}
                      className={`hover:bg-surface-raised transition-colors duration-150${
                        isHiding ? " transition-all duration-300 opacity-0 translate-y-1" : ""
                      }${isCompletedAndVisible ? " opacity-50" : ""}`}
                    >
                      {/* Selection checkbox - only in select mode. */}
                      {selectionMode && (
                        <td className="pl-6 pr-2 py-4">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(task.id)}
                            onChange={() => toggleSelect(task.id)}
                            aria-label={`Select ${task.title}`}
                            className="w-4 h-4 rounded border-border text-accent focus:ring-2 focus:ring-accent cursor-pointer"
                          />
                        </td>
                      )}

                      {/* Completion checkbox */}
                      <td className={`${selectionMode ? "pl-2" : "pl-6"} pr-2 py-4`}>
                        <input
                          type="checkbox"
                          checked={task.isCompleted}
                          onChange={(e) => handleComplete(task.id, e.target.checked)}
                          disabled={completingId === task.id}
                          aria-label={`Mark ${task.title} as ${task.isCompleted ? "incomplete" : "complete"}`}
                          className="w-4 h-4 rounded border-border text-text-primary focus:ring-accent disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                        />
                      </td>

                      {/* Task title: links to detail page, with a priority dot */}
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-2">
                          <Link
                            href={`/tasks/${task.id}`}
                            className="inline-flex items-center gap-1.5 text-text-primary font-medium hover:text-accent focus:outline-none focus:underline transition-colors duration-150"
                          >
                            <PriorityDot priority={task.priority} />
                            {task.title}
                          </Link>
                          <RecurringBadge recurrence={task.recurrence} />
                        </span>
                      </td>

                      {/* Project cell - only shown in All Tasks view */}
                      {activeView === "all" && (
                        <td className="px-6 py-4 text-text-muted text-sm">
                          {projectName(task.projectId, projects)}
                        </td>
                      )}

                      {/* Deadline - click to open the quick-set popover */}
                      <td className="px-6 py-4">
                        <div className="relative inline-block">
                          <button
                            type="button"
                            onClick={() =>
                              setDeadlinePopoverId(deadlinePopoverId === task.id ? null : task.id)
                            }
                            aria-label={`Change deadline for ${task.title}`}
                            className={`rounded px-1 -mx-1 hover:bg-surface-raised focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer transition-colors duration-150 ${deadlineColorClass(task.deadline)}`}
                          >
                            {task.deadline ? formatDeadline(task.deadline) : (
                              <span className="text-zinc-300">Set date</span>
                            )}
                          </button>
                          {deadlinePopoverId === task.id && (
                            <DeadlinePopover
                              onPick={(d) => handleDeadlineQuickSet(task.id, d)}
                              onClose={() => setDeadlinePopoverId(null)}
                            />
                          )}
                        </div>
                      </td>

                      {/* Creation date */}
                      <td className="px-6 py-4 text-text-muted">
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
                      <td className="px-6 py-4 text-text-muted">
                        {task.completedAt ? (
                          <span className="text-green-600">{formatDate(task.completedAt)}</span>
                        ) : (
                          <span className="text-zinc-300">--</span>
                        )}
                      </td>

                      {/* Edit + Delete actions */}
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <button
                            onClick={() => setEditingTask(task)}
                            aria-label={`Edit task: ${task.title}`}
                            className="flex items-center justify-center w-8 h-8 min-w-[44px] min-h-[44px] text-text-muted hover:text-accent focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 rounded transition-colors duration-150 cursor-pointer"
                          >
                            <Pencil size={16} aria-hidden="true" />
                          </button>
                          <button
                            onClick={() => handleDelete(task.id)}
                            disabled={deletingId === task.id}
                            aria-label={`Delete task: ${task.title}`}
                            className="flex items-center justify-center w-8 h-8 min-w-[44px] min-h-[44px] text-text-muted hover:text-danger focus:outline-none focus:ring-2 focus:ring-danger focus:ring-offset-1 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors duration-150 cursor-pointer"
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
                        </div>
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
                onEdit={setEditingTask}
                onDeadlineChange={handleDeadlineQuickSet}
                selectionMode={selectionMode}
                selected={selectedIds.has(task.id)}
                onToggleSelect={toggleSelect}
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

      {/* Edit modal - rendered only when a task is being edited */}
      {editingTask && (
        <EditTaskModal
          task={editingTask}
          projects={projects}
          allLabels={allLabels}
          onSaved={handleSaved}
          onClose={() => setEditingTask(null)}
        />
      )}

      {/* Bulk-actions bar - shown while tasks are selected in select mode. */}
      {selectionMode && selectedIds.size > 0 && (
        <BulkActionsBar
          count={selectedIds.size}
          projects={projects}
          busy={bulkBusy}
          onComplete={() => handleBulk("complete", { isCompleted: true })}
          onUncomplete={() => handleBulk("complete", { isCompleted: false })}
          onMoveToProject={(projectId) => handleBulk("assignProject", { projectId })}
          onSetDeadline={(deadline) => handleBulk("setDeadline", { deadline })}
          onSetPriority={(priority) => handleBulk("setPriority", { priority })}
          onCancel={exitSelectMode}
        />
      )}
    </div>
  );
}
