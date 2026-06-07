"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { usePolling } from "@/hooks/usePolling";
import { Menu, Plus, X, Flame } from "lucide-react";
import {
  getProjects,
  createProject,
  renameProject,
  deleteProject,
  getHabits,
  addCheckIn,
  removeCheckIn,
  Project,
  Habit,
} from "@/lib/api";
import { applyOptimisticCheckIn } from "@/lib/habits";
import ProjectSidebar from "./ProjectSidebar";
import TasksClient from "./TasksClient";
import HabitsPanel from "./HabitsPanel";
import { EMPTY_FILTER, type FilterState } from "./FilterPanel";

// Feedback shown briefly after a project action.
type Feedback = { type: "success" | "error"; message: string } | null;

// How a view is displayed. "list" = today's table/cards; "board" = grouped columns.
export type ViewMode = "list" | "board";
// What the board groups by. (List mode ignores this.)
export type GroupBy = "due" | "project" | "priority";
interface ViewConfig {
  mode: ViewMode;
  groupBy: GroupBy;
}
const DEFAULT_VIEW_CONFIG: ViewConfig = { mode: "list", groupBy: "due" };
const VIEW_CONFIG_KEY = "tasklog_view_config";

// Local "YYYY-MM-DD" for today, matching the server's local-day check-in dates.
function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function ProjectLayout() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [activeView, setActiveView] = useState<"all" | "inbox" | number>("all");
  // Whether the create-task sheet is open. Held here (not in TasksClient) so the
  // mobile "+ Add Task" button in this header can open the same sheet.
  const [creating, setCreating] = useState(false);

  // Habits are owned here so BOTH the task list (inline badge + check-in on habit
  // rows) and the right-side Habits panel share one source of truth + one toggle.
  const [habits, setHabits] = useState<Habit[]>([]);
  // Mirror of `habits` for synchronous reads in callbacks (a setState function updater
  // runs deferred, so we can't read the result inline - see handleCheckInToggle).
  const habitsRef = useRef<Habit[]>([]);
  useEffect(() => {
    habitsRef.current = habits;
  }, [habits]);
  // Task ids with a check-in toggle in flight (disables that control, pauses polling).
  const [pendingCheckIns, setPendingCheckIns] = useState<Set<number>>(new Set());

  // Per-view display config (list/board + group-by), persisted in localStorage so a
  // view remembers its layout across sessions. Keyed by the active view.
  const [viewConfigs, setViewConfigs] = useState<Record<string, ViewConfig>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const saved = localStorage.getItem(VIEW_CONFIG_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const viewKey = String(activeView);
  const viewConfig = viewConfigs[viewKey] ?? DEFAULT_VIEW_CONFIG;
  const setViewConfig = useCallback(
    (patch: Partial<ViewConfig>) => {
      setViewConfigs((prev) => {
        const current = prev[viewKey] ?? DEFAULT_VIEW_CONFIG;
        const next = { ...prev, [viewKey]: { ...current, ...patch } };
        try {
          localStorage.setItem(VIEW_CONFIG_KEY, JSON.stringify(next));
        } catch {
          /* localStorage may be unavailable - fail silently */
        }
        return next;
      });
    },
    [viewKey],
  );

  const [filterState, setFilterState] = useState<FilterState>(() => {
    // Restore filter state from sessionStorage so filters persist across
    // navigation (e.g. going to /labels and coming back).
    if (typeof window === "undefined") return EMPTY_FILTER;
    try {
      const saved = sessionStorage.getItem("tasklog_filter_state");
      return saved ? { ...EMPTY_FILTER, ...JSON.parse(saved) } : EMPTY_FILTER;
    } catch {
      return EMPTY_FILTER;
    }
  });
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Right-side habits drawer (mobile/tablet, where the inline panel is hidden).
  const [habitsDrawerOpen, setHabitsDrawerOpen] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  function showFeedback(type: "success" | "error", message: string) {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 4000);
  }

  // Load projects + habits on mount.
  const loadProjects = useCallback(async () => {
    try {
      setProjects(await getProjects());
    } catch {
      // Sidebar will show empty state.
    } finally {
      setLoadingProjects(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
    getHabits().then(setHabits).catch(() => {});
  }, [loadProjects]);

  // Background polling: projects + habits every 30s. Pause habit refresh while a
  // check-in toggle is in flight so the optimistic state isn't clobbered.
  usePolling(
    useCallback(async () => {
      setProjects(await getProjects());
    }, []),
    30000,
  );
  usePolling(
    useCallback(async () => {
      setHabits(await getHabits());
    }, []),
    30000,
    pendingCheckIns.size === 0,
  );

  // Persist filter state to sessionStorage so it survives navigation.
  useEffect(() => {
    try {
      sessionStorage.setItem("tasklog_filter_state", JSON.stringify(filterState));
    } catch {
      /* sessionStorage may be unavailable - fail silently */
    }
  }, [filterState]);

  // Toggle today's check-in for a habit, optimistically. Shared by the list + panel.
  // Streak delta is +/-1: the server counts consecutive scheduled days back from today,
  // so adding/removing today shifts it by one (good enough for the optimistic flash; the
  // next poll/refresh reconciles the exact schedule-aware value).
  const handleCheckInToggle = useCallback(async (taskId: number) => {
    // Determine the action SYNCHRONOUSLY from current state (via the ref) - reading it
    // from inside the setHabits updater would be too late (updaters run deferred).
    const current = habitsRef.current.find((h) => h.task.id === taskId);
    const markingDone = !(current?.doneToday ?? false);
    const key = todayKey();
    // The shared helper keeps day-pattern and frequency habits consistent in the optimistic
    // flash (frequency: weekly count + current-week cell + threshold-based week streak) (#76).
    setHabits((prev) =>
      prev.map((h) => (h.task.id === taskId ? applyOptimisticCheckIn(h, markingDone, key) : h)),
    );
    setPendingCheckIns((prev) => new Set(prev).add(taskId));
    try {
      if (markingDone) await addCheckIn(taskId);
      else await removeCheckIn(taskId);
    } catch {
      // Reconcile from the server on failure.
      try {
        setHabits(await getHabits());
      } catch {
        /* leave optimistic state if refetch also fails */
      }
    } finally {
      setPendingCheckIns((prev) => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
    }
  }, []);

  // When a task is created/edited/deleted, its habit-ness may have changed - refresh
  // habits so the panel + inline badges stay correct without a full reload.
  const refreshHabits = useCallback(() => {
    getHabits().then(setHabits).catch(() => {});
  }, []);

  async function handleCreateProject(name: string) {
    try {
      const created = await createProject(name);
      setProjects((prev) => [...prev, created]);
    } catch (err) {
      showFeedback("error", "Failed to create project. Please try again.");
      throw err;
    }
  }

  async function handleEditProject(id: number, name: string) {
    try {
      const updated = await renameProject(id, name);
      setProjects((prev) => prev.map((p) => (p.id === id ? updated : p)));
    } catch (err) {
      showFeedback("error", "Failed to rename project. Please try again.");
      throw err;
    }
  }

  async function handleDeleteProject(id: number) {
    try {
      await deleteProject(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
      if (activeView === id) setActiveView("all");
    } catch (err) {
      showFeedback("error", "Failed to delete project. Please try again.");
      throw err;
    }
  }

  function handleSelectView(view: "all" | "inbox" | number) {
    setActiveView(view);
    setDrawerOpen(false);
  }

  const sidebarProps = {
    projects,
    activeView,
    onSelectView: handleSelectView,
    onCreateProject: handleCreateProject,
    onEditProject: handleEditProject,
    onDeleteProject: handleDeleteProject,
  };

  // Habit lookup by task id, for the list's inline badge + check-in on habit rows.
  const habitsByTaskId = useMemo(() => {
    const m = new Map<number, Habit>();
    for (const h of habits) m.set(h.task.id, h);
    return m;
  }, [habits]);

  return (
    <div className="flex min-h-screen -mx-4 -my-8">
      {/* Desktop sidebar - hidden on mobile */}
      <aside className="hidden md:flex md:flex-col md:w-56 bg-surface border-r border-border shrink-0">
        {loadingProjects ? (
          <div className="px-4 py-6 text-sm text-text-muted">Loading...</div>
        ) : (
          <ProjectSidebar {...sidebarProps} />
        )}
      </aside>

      {/* Main content area */}
      <div className="flex-1 min-w-0 px-4 py-8">
        {/* Mobile header row: hamburger on left, Add Task on right */}
        <div className="md:hidden mb-4 flex items-center justify-between">
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
            className="flex items-center justify-center p-3 text-zinc-600 hover:text-text-primary border border-border rounded-md bg-surface cursor-pointer transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1"
          >
            <Menu size={20} aria-hidden="true" />
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-md hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 transition-colors duration-150 cursor-pointer"
            >
              <Plus size={16} aria-hidden="true" />
              Add Task
            </button>
            {habits.length > 0 && (
              <button
                onClick={() => setHabitsDrawerOpen(true)}
                aria-label="Open habits"
                title="Habits"
                className="flex items-center justify-center p-3 text-amber-500 hover:text-amber-600 border border-border rounded-md bg-surface cursor-pointer transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1"
              >
                <Flame size={20} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        {/* Feedback from project operations (create/rename/delete errors). */}
        {feedback && (
          <div
            role="alert"
            className="mb-4 flex items-center gap-2 px-4 py-3 rounded-md text-sm font-medium bg-red-50 text-red-700 border border-red-200"
          >
            {feedback.message}
          </div>
        )}

        {/* Tasks + (desktop) a right-side Habits panel sharing one habit state. */}
        <div className="flex gap-6 items-start">
          <div className="flex-1 min-w-0">
            <TasksClient
              activeView={activeView}
              projects={projects}
              filterState={filterState}
              onFilterChange={setFilterState}
              creating={creating}
              onCreatingChange={setCreating}
              viewMode={viewConfig.mode}
              groupBy={viewConfig.groupBy}
              onViewModeChange={(mode) => setViewConfig({ mode })}
              onGroupByChange={(groupBy) => setViewConfig({ groupBy })}
              habitsByTaskId={habitsByTaskId}
              pendingCheckIns={pendingCheckIns}
              onCheckInToggle={handleCheckInToggle}
              onHabitsChanged={refreshHabits}
            />
          </div>
          {habits.length > 0 && (
            <aside className="hidden lg:block w-72 shrink-0">
              <HabitsPanel
                habits={habits}
                pendingCheckIns={pendingCheckIns}
                onCheckInToggle={handleCheckInToggle}
              />
            </aside>
          )}
        </div>
      </div>

      {/* Mobile drawer backdrop */}
      {drawerOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Mobile drawer panel */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-56 bg-surface border-r border-border flex flex-col md:hidden transition-transform duration-200 ${
          drawerOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-end px-3 py-3 border-b border-border">
          <button
            onClick={() => setDrawerOpen(false)}
            aria-label="Close navigation"
            className="flex items-center justify-center p-2 text-zinc-600 hover:text-text-primary cursor-pointer transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 rounded"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        {loadingProjects ? (
          <div className="px-4 py-6 text-sm text-text-muted">Loading...</div>
        ) : (
          <ProjectSidebar {...sidebarProps} />
        )}
      </div>

      {/* The habits drawer is opened from a flame button in the TasksClient toolbar
          (passed down as onOpenHabits) - cleaner than a floating edge tab. */}

      {/* Habits drawer backdrop */}
      {habitsDrawerOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={() => setHabitsDrawerOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Right habits drawer panel (mobile/tablet). Shares habit state, so checking in
          here updates the inline habit rows too. */}
      <div
        className={`fixed inset-y-0 right-0 z-50 w-80 max-w-[85vw] bg-bg border-l border-border flex flex-col lg:hidden transition-transform duration-200 ${
          habitsDrawerOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-end px-3 py-3 border-b border-border">
          <button
            onClick={() => setHabitsDrawerOpen(false)}
            aria-label="Close habits"
            className="flex items-center justify-center p-2 text-zinc-600 hover:text-text-primary cursor-pointer transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 rounded"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <HabitsPanel habits={habits} pendingCheckIns={pendingCheckIns} onCheckInToggle={handleCheckInToggle} />
        </div>
      </div>
    </div>
  );
}
