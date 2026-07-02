"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { usePolling } from "@/hooks/usePolling";
import { Trash2, CheckCircle, XCircle, Loader2, MoreHorizontal, Plus, Pencil, ListChecks, List, LayoutGrid, Flame, CornerDownRight } from "lucide-react";
import { getTasks, deleteTask, completeTask, toggleSubtask, getLabels, updateTask, bulkTasks, BulkOperation, Task, Project, Label, Habit } from "@/lib/api";
import { formatDate, formatDeadline, deadlineColorClass, projectName, labelColor } from "@/lib/format";
import TaskCard from "./TaskCard";
import CompleteWithSubtasksDialog from "./CompleteWithSubtasksDialog";
import TaskSheet from "./TaskSheet";
import TaskDetailModal from "./TaskDetailModal";
import TaskDoneControl from "./TaskDoneControl";
import TimerControl from "./TimerControl";
import { TASKS_CHANGED_EVENT } from "@/contexts/TimeTrackingContext";
import BoardView from "./BoardView";
import DeadlinePopover from "./DeadlinePopover";
import BulkActionsBar from "./BulkActionsBar";
import PriorityDot from "./PriorityDot";
import RecurringBadge from "./RecurringBadge";
import FilterPanel, { FilterState, hasActiveFilters, activeFilterCount } from "./FilterPanel";
import { occursOn } from "@/lib/recurrence";
import type { ViewMode, GroupBy } from "./ProjectLayout";

// A stable React key across the mixed list of real tasks and projected subtask rows,
// whose numeric ids can collide (a subtask id may equal a task id). Prefixed by kind.
const rowKey = (t: Task) => (t.isSubtask ? `s-${t.id}` : `t-${t.id}`);
// Open subtasks remaining on a parent (drives the completion dialog + the "2/5" chip).
const openSubtaskCount = (t: Task) => (t.subtaskCount ?? 0) - (t.completedSubtaskCount ?? 0);

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
  // Whether the create-task sheet is open. Lifted to ProjectLayout so its mobile
  // "+ Add Task" button (outside this component) can open the same sheet.
  creating: boolean;
  onCreatingChange: (creating: boolean) => void;
  // View-mode axis (list vs board) + grouping, persisted per-view in ProjectLayout.
  viewMode: ViewMode;
  groupBy: GroupBy;
  onViewModeChange: (mode: ViewMode) => void;
  onGroupByChange: (groupBy: GroupBy) => void;
  // Habit state (shared with the right-side panel): lookup by task id for the inline
  // badge + check-in control on habit rows, the in-flight set, and the toggle handler.
  habitsByTaskId: Map<number, Habit>;
  pendingCheckIns: Set<number>;
  onCheckInToggle: (taskId: number) => void;
  // Called after a create/edit/delete so ProjectLayout can refresh habits (a task's
  // habit-ness may have changed, or a habit was deleted).
  onHabitsChanged: () => void;
}

export default function TasksClient({
  activeView,
  projects,
  filterState,
  onFilterChange,
  creating,
  onCreatingChange,
  viewMode,
  groupBy,
  onViewModeChange,
  onGroupByChange,
  habitsByTaskId,
  pendingCheckIns,
  onCheckInToggle,
  onHabitsChanged,
}: Props) {
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
  // The task currently open in the detail overlay (null = closed).
  const [openingTask, setOpeningTask] = useState<Task | null>(null);
  // The task currently open in the edit sheet (null = closed).
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  // Which task's deadline quick-popover is open in the DESKTOP table (mobile
  // cards manage their own popover state internally).
  const [deadlinePopoverId, setDeadlinePopoverId] = useState<number | null>(null);
  // Multi-select state. selectionMode toggles the selection checkboxes + bulk bar.
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  // True while a bulk request is in flight (disables the bulk bar actions).
  const [bulkBusy, setBulkBusy] = useState(false);
  // When completing a parent that still has open subtasks, we hold it here to ask
  // the user how to resolve them (complete all vs pull out) before calling the API.
  const [subtaskConfirm, setSubtaskConfirm] = useState<Task | null>(null);

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

  // Refetch when a task is quick-created from the tracking bar (#77), so it appears at once.
  useEffect(() => {
    const onTasksChanged = () => loadTasks();
    window.addEventListener(TASKS_CHANGED_EVENT, onTasksChanged);
    return () => window.removeEventListener(TASKS_CHANGED_EVENT, onTasksChanged);
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

  // Called by TaskSheet after a successful create OR edit, with the canonical task.
  // "Edit" button inside the detail modal: close modal, open edit sheet.
  function handleEditFromModal(task: Task) {
    setOpeningTask(null);
    setEditingTask(task);
  }

  // Inline field saves from TaskDetailModal (project/due/priority/labels).
  function handleModalSaved(task: Task) {
    setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
    setOpeningTask(task);
    onHabitsChanged();
  }

  // New tasks (id not yet in the list) are prepended; edits replace in place. The
  // sheet handles the API calls itself; this just reconciles local state + closes.
  function handleSheetSaved(task: Task) {
    setTasks((prev) => {
      const exists = prev.some((t) => t.id === task.id);
      return exists ? prev.map((t) => (t.id === task.id ? task : t)) : [task, ...prev];
    });
    const wasEdit = editingTask !== null;
    setEditingTask(null);
    onCreatingChange(false);
    onHabitsChanged(); // habit-ness / schedule may have changed
    showFeedback("success", wasEdit ? "Task updated." : "Task created.");
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
      onHabitsChanged(); // if it was a habit, drop it from the panel too
      showFeedback("success", "Task deleted.");
    } catch {
      showFeedback("error", "Failed to delete task. Please try again.");
    } finally {
      setDeletingId(null);
    }
  }

  // Entry point for a task's done control. If completing a parent that still has open
  // subtasks, defer to the confirmation dialog (which picks completeAll vs pullOut);
  // otherwise complete straight away.
  function handleComplete(id: number, isCompleted: boolean) {
    const task = tasks.find((t) => !t.isSubtask && t.id === id);
    if (isCompleted && task && !task.isHabit && openSubtaskCount(task) > 0) {
      setSubtaskConfirm(task);
      return;
    }
    void performComplete(id, isCompleted);
  }

  // Toggle a single subtask (inline card circle, or a projected subtask row's control).
  // Optimistically updates the parent's embedded subtasks + counts, and drops a projected
  // dated row once it's completed. Reverts by refetching on error.
  async function handleToggleSubtask(parentTaskId: number, subtaskId: number, isCompleted: boolean) {
    setTasks((prev) =>
      prev
        .map((t) => {
          if (!t.isSubtask && t.id === parentTaskId && t.subtasks) {
            const subtasks = t.subtasks.map((s) => (s.id === subtaskId ? { ...s, isCompleted } : s));
            return { ...t, subtasks, completedSubtaskCount: subtasks.filter((s) => s.isCompleted).length };
          }
          return t;
        })
        // A projected dated-subtask row is only shown while incomplete - drop it once ticked.
        .filter((t) => !(t.isSubtask && t.id === subtaskId && isCompleted)),
    );
    try {
      await toggleSubtask(parentTaskId, subtaskId, isCompleted);
    } catch {
      showFeedback("error", "Failed to update subtask.");
      loadTasks();
    }
  }

  // Open the detail overlay for a projected subtask row's PARENT task (the projected row
  // itself isn't a real task). Falls back to a fetch if the parent isn't in local state.
  function openParentOf(subtaskRow: Task) {
    const parent = tasks.find((t) => !t.isSubtask && t.id === subtaskRow.parentTaskId);
    if (parent) setOpeningTask(parent);
  }

  // Toggle completion for a task. When marking complete and not showing completed tasks,
  // the row animates out before being removed from the list. subtaskMode (when the task
  // had open subtasks) tells the backend to complete-all or pull-them-out.
  async function performComplete(id: number, isCompleted: boolean, subtaskMode?: "completeAll" | "pullOut") {
    setCompletingId(id);
    try {
      const updated = await completeTask(id, isCompleted, subtaskMode);
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

      // Completing a recurring task spawns the next occurrence server-side; pulling
      // subtasks out creates new standalone tasks. Either way, pull the new rows in
      // immediately (instead of waiting for the next poll) by fetching and adding only
      // the tasks we don't already have, without disturbing the completed row's animation.
      if (isCompleted && (updated.isRecurring || subtaskMode === "pullOut")) {
        try {
          const fresh = await getTasks();
          setTasks((prev) => {
            // Key by rowKey so a projected subtask row (subtask id) never collides with a
            // real task id, and only merge in genuinely new REAL tasks (not projected rows).
            const known = new Set(prev.map((t) => (t.isSubtask ? `s-${t.id}` : `t-${t.id}`)));
            const spawned = fresh.filter((t) => !t.isSubtask && !known.has(`t-${t.id}`));
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

    // Habits only appear on the days they're scheduled. On off-days they live in
    // the sidebar habits section only - no point cluttering the task list.
    if (t.isHabit && !occursOn(t.recurrence, new Date())) return false;

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

  // A habit checked in today is "done for the day" - it steps out of the active list
  // (like a completed task) and returns tomorrow. It stays in the Habits panel/drawer.
  const isDoneForToday = (t: Task) =>
    t.isCompleted || (t.isHabit && (habitsByTaskId.get(t.id)?.doneToday ?? false));

  const hasCompleted = filteredTasks.some((t) => isDoneForToday(t));
  const visibleTasks = filteredTasks.filter(
    (t) => showCompleted || !isDoneForToday(t) || hidingIds.has(t.id)
  );
  // Real tasks only - projected subtask rows aren't bulk-selectable (a subtask id could
  // collide with a task id, and bulk ops act on tasks). Also the board shows tasks only.
  const selectableTasks = visibleTasks.filter((t) => !t.isSubtask);

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
              ? "bg-success-bg text-success border border-success/30"
              : "bg-danger-bg text-danger border border-danger/30"
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
      <div className="bg-surface border border-border rounded-xl shadow-sm">
        <div className="px-4 sm:px-6 py-4 border-b border-border flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="font-heading text-lg font-semibold text-text-primary">
            {activeView === "all"
              ? "All Tasks"
              : activeView === "inbox"
              ? "Inbox"
              : projects.find((p) => p.id === activeView)?.name ?? "Tasks"}
          </h1>

          {/* Right side: view toggle + group-by + add task + show completed + filter.
              Wraps onto its own row(s) on mobile so nothing clips off the edge. */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* List | Board segmented toggle */}
            <div className="flex items-center rounded-md border border-border overflow-hidden" role="group" aria-label="View mode">
              <button
                type="button"
                onClick={() => onViewModeChange("list")}
                aria-pressed={viewMode === "list"}
                aria-label="List view"
                title="List view"
                className={`flex items-center justify-center w-9 h-9 transition-colors duration-150 cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent ${
                  viewMode === "list" ? "bg-surface-raised text-text-primary" : "text-text-muted hover:text-text-primary"
                }`}
              >
                <List size={16} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => onViewModeChange("board")}
                aria-pressed={viewMode === "board"}
                aria-label="Board view"
                title="Board view"
                className={`flex items-center justify-center w-9 h-9 border-l border-border transition-colors duration-150 cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent ${
                  viewMode === "board" ? "bg-surface-raised text-text-primary" : "text-text-muted hover:text-text-primary"
                }`}
              >
                <LayoutGrid size={16} aria-hidden="true" />
              </button>
            </div>

            {/* Group-by - only meaningful in board mode */}
            {viewMode === "board" && (
              <label className="flex items-center gap-1.5 text-sm text-text-muted">
                <span className="hidden sm:inline">Group</span>
                <select
                  value={groupBy}
                  onChange={(e) => onGroupByChange(e.target.value as GroupBy)}
                  aria-label="Group board by"
                  className="px-2 py-1.5 border border-border rounded-md bg-surface text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer"
                >
                  <option value="due">Due</option>
                  <option value="project">Project</option>
                  <option value="priority">Priority</option>
                </select>
              </label>
            )}

            <button
              type="button"
              onClick={() => onCreatingChange(true)}
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

            {/* Select toggle - enters/leaves multi-select mode. List view only
                (the board has no row checkboxes). Shown only when there are tasks. */}
            {!loading && filteredTasks.length > 0 && viewMode === "list" && (
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
            No {viewLabel} yet.
          </p>
        ) : viewMode === "board" ? (
          <div className="p-4">
            <BoardView
              tasks={selectableTasks}
              groupBy={groupBy}
              projects={projects}
              habitsByTaskId={habitsByTaskId}
              completingId={completingId}
              deletingId={deletingId}
              pendingCheckIns={pendingCheckIns}
              onComplete={handleComplete}
              onCheckInToggle={onCheckInToggle}
              onOpen={setOpeningTask}
              onEdit={setEditingTask}
              onDelete={handleDelete}
            />
          </div>
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
                        checked={selectableTasks.length > 0 && selectableTasks.every((t) => selectedIds.has(t.id))}
                        onChange={(e) =>
                          setSelectedIds(
                            e.target.checked ? new Set(selectableTasks.map((t) => t.id)) : new Set(),
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
                  const openSubtasks = openSubtaskCount(task);
                  return (
                    <tr
                      key={rowKey(task)}
                      className={`group hover:bg-surface-raised transition-colors duration-150${
                        isHiding ? " transition-all duration-300 opacity-0 translate-y-1" : ""
                      }${isCompletedAndVisible ? " opacity-50" : ""}`}
                    >
                      {/* Selection checkbox - only in select mode, and not for projected
                          subtask rows (they aren't bulk-selectable). */}
                      {selectionMode && (
                        <td className="pl-6 pr-2 py-4">
                          {!task.isSubtask && (
                            <input
                              type="checkbox"
                              checked={selectedIds.has(task.id)}
                              onChange={() => toggleSelect(task.id)}
                              aria-label={`Select ${task.title}`}
                              className="w-4 h-4 rounded border-border text-accent focus:ring-2 focus:ring-accent cursor-pointer"
                            />
                          )}
                        </td>
                      )}

                      {/* Done control: a complete checkbox, or a check-in toggle for a
                          habit. A projected subtask row toggles its own subtask instead. */}
                      <td className={`${selectionMode ? "pl-2" : "pl-6"} pr-2 py-4`}>
                        <TaskDoneControl
                          task={task}
                          habit={habitsByTaskId.get(task.id)}
                          completing={completingId === task.id}
                          pendingCheckIn={pendingCheckIns.has(task.id)}
                          onComplete={
                            task.isSubtask
                              ? (sid, c) => handleToggleSubtask(task.parentTaskId!, sid, c)
                              : handleComplete
                          }
                          onCheckInToggle={onCheckInToggle}
                        />
                      </td>

                      {/* Task title: opens the detail overlay. Habits get a flame; a
                          projected subtask row shows a breadcrumb to its parent; a parent
                          with subtasks shows a "2/5" progress chip. */}
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-2 flex-wrap">
                          {task.isSubtask && (
                            <button
                              type="button"
                              onClick={() => openParentOf(task)}
                              className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-accent focus:outline-none focus:underline cursor-pointer"
                              aria-label={`Open parent task ${task.parentTitle}`}
                            >
                              <CornerDownRight size={12} aria-hidden="true" />
                              {task.parentTitle}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => (task.isSubtask ? openParentOf(task) : setOpeningTask(task))}
                            className="inline-flex items-center gap-1.5 text-text-primary font-medium hover:text-accent focus:outline-none focus:underline transition-colors duration-150 cursor-pointer"
                          >
                            <PriorityDot priority={task.priority} />
                            {task.title}
                          </button>
                          {task.isHabit && (
                            <Flame size={13} className="text-amber-500 shrink-0" aria-label="Habit" />
                          )}
                          <RecurringBadge recurrence={task.recurrence} />
                          {!task.isSubtask && (task.subtaskCount ?? 0) > 0 && (
                            <button
                              type="button"
                              onClick={() => setOpeningTask(task)}
                              title="Subtask progress"
                              className={`inline-flex items-center gap-1 text-xs rounded px-1.5 py-0.5 cursor-pointer transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-accent ${
                                openSubtasks === 0 ? "text-success bg-success-bg" : "text-text-muted bg-surface-raised hover:text-text-primary"
                              }`}
                            >
                              <ListChecks size={12} aria-hidden="true" />
                              {task.completedSubtaskCount ?? 0}/{task.subtaskCount ?? 0}
                            </button>
                          )}
                          {task.isHabit && !occursOn(task.recurrence, new Date()) && (
                            <span className="text-xs text-text-muted">not due today</span>
                          )}
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

                      {/* Edit + Delete actions (+ a hover-reveal timer play/stop, #77).
                          Projected subtask rows are managed from their parent's detail, so
                          they carry no task-level actions here. */}
                      <td className="px-6 py-4">
                        {!task.isSubtask && (
                        <div className="flex items-center gap-1">
                          <TimerControl task={task} />
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
                        )}
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
                key={rowKey(task)}
                task={task}
                projects={projects}
                activeView={activeView}
                onComplete={handleComplete}
                onDelete={handleDelete}
                onOpen={setOpeningTask}
                onOpenParent={openParentOf}
                onEdit={setEditingTask}
                onDeadlineChange={handleDeadlineQuickSet}
                onToggleSubtask={handleToggleSubtask}
                selectionMode={selectionMode}
                selected={selectedIds.has(task.id)}
                onToggleSelect={toggleSelect}
                deletingId={deletingId}
                completingId={completingId}
                isHiding={hidingIds.has(task.id)}
                habit={habitsByTaskId.get(task.id)}
                pendingCheckIn={pendingCheckIns.has(task.id)}
                onCheckInToggle={onCheckInToggle}
              />
            ))}
          </div>
          </>
        )}
      </div>

      {/* Task detail overlay - opens when clicking a task card title or board card. */}
      {openingTask && (
        <TaskDetailModal
          task={openingTask}
          projects={projects}
          allLabels={allLabels}
          onClose={() => setOpeningTask(null)}
          onEdit={handleEditFromModal}
          onSaved={handleModalSaved}
        />
      )}

      {/* Chip-driven sheet for both create (creating) and edit (editingTask). */}
      {(creating || editingTask) && (
        <TaskSheet
          task={editingTask ?? undefined}
          projects={projects}
          allLabels={allLabels}
          defaultProjectId={typeof activeView === "number" ? activeView : null}
          onSaved={handleSheetSaved}
          onClose={() => {
            setEditingTask(null);
            onCreatingChange(false);
          }}
        />
      )}

      {/* Completion confirmation - completing a parent that still has open subtasks. */}
      {subtaskConfirm && (
        <CompleteWithSubtasksDialog
          taskTitle={subtaskConfirm.title}
          openCount={openSubtaskCount(subtaskConfirm)}
          busy={completingId === subtaskConfirm.id}
          onCompleteAll={() => {
            const t = subtaskConfirm;
            setSubtaskConfirm(null);
            void performComplete(t.id, true, "completeAll");
          }}
          onPullOut={() => {
            const t = subtaskConfirm;
            setSubtaskConfirm(null);
            void performComplete(t.id, true, "pullOut");
          }}
          onCancel={() => setSubtaskConfirm(null)}
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
