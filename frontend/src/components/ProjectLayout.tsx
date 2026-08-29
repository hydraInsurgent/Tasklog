"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { usePolling } from "@/hooks/usePolling";
import { Menu, Plus, X } from "lucide-react";
import {
  getProjects,
  createProject,
  updateProject,
  deleteProject,
  reorderProjects,
  getClients,
  createClient,
  renameClient,
  deleteClient,
  getHabits,
  addCheckIn,
  removeCheckIn,
  Project,
  Client,
  Habit,
} from "@/lib/api";
import { applyOptimisticCheckIn } from "@/lib/habits";
import ProjectSidebar from "./ProjectSidebar";
import TasksClient from "./TasksClient";
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
  // Clients (#86) - the grouping level above projects. Loaded + polled alongside projects.
  const [clients, setClients] = useState<Client[]>([]);
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
  const [feedback, setFeedback] = useState<Feedback>(null);

  function showFeedback(type: "success" | "error", message: string) {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 4000);
  }

  // Load projects + clients + habits on mount.
  const loadProjects = useCallback(async () => {
    try {
      const [p, c] = await Promise.all([getProjects(), getClients()]);
      setProjects(p);
      setClients(c);
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

  // Background polling: projects + clients + habits every 30s. Pause habit refresh while a
  // check-in toggle is in flight so the optimistic state isn't clobbered.
  usePolling(
    useCallback(async () => {
      const [p, c] = await Promise.all([getProjects(), getClients()]);
      setProjects(p);
      setClients(c);
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

  async function handleCreateProject(name: string, color?: string | null, clientId?: number | null) {
    try {
      const created = await createProject(name, color, clientId);
      setProjects((prev) => [...prev, created]);
    } catch (err) {
      showFeedback("error", "Failed to create project. Please try again.");
      throw err;
    }
  }

  // Present-key edit: name/color/clientId. clientId of null clears (Ungrouped); undefined keeps.
  async function handleEditProject(
    id: number,
    fields: { name?: string; color?: string | null; clientId?: number | null },
  ) {
    try {
      const updated = await updateProject(id, fields);
      setProjects((prev) => prev.map((p) => (p.id === id ? updated : p)));
    } catch (err) {
      showFeedback("error", "Failed to update project. Please try again.");
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

  // Persist a drag-reorder of the project sidebar. Optimistic: apply the new order locally,
  // POST it, and reconcile from the server response (or revert on failure).
  async function handleReorderProjects(orderedIds: number[]) {
    const snapshot = projects;
    const byId = new Map(projects.map((p) => [p.id, p]));
    setProjects(orderedIds.map((id) => byId.get(id)!).filter(Boolean));
    try {
      setProjects(await reorderProjects(orderedIds));
    } catch {
      setProjects(snapshot);
      showFeedback("error", "Failed to reorder projects.");
    }
  }

  // --- Client (life-area) CRUD ---
  async function handleCreateClient(name: string, color?: string | null) {
    try {
      const created = await createClient(name, color);
      setClients((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
    } catch (err) {
      showFeedback("error", "Failed to create client. Please try again.");
      throw err;
    }
  }

  async function handleEditClient(id: number, name: string, color?: string | null) {
    try {
      const updated = await renameClient(id, name, color);
      setClients((prev) =>
        prev.map((c) => (c.id === id ? updated : c)).sort((a, b) => a.name.localeCompare(b.name)),
      );
      // Projects embed the client object; refresh so their chip reflects the new name/color.
      setProjects((prev) => prev.map((p) => (p.clientId === id ? { ...p, client: updated } : p)));
    } catch (err) {
      showFeedback("error", "Failed to update client. Please try again.");
      throw err;
    }
  }

  async function handleDeleteClient(id: number) {
    try {
      await deleteClient(id);
      setClients((prev) => prev.filter((c) => c.id !== id));
      // The client's projects survive, now Ungrouped - reflect that locally.
      setProjects((prev) =>
        prev.map((p) => (p.clientId === id ? { ...p, clientId: null, client: null } : p)),
      );
    } catch (err) {
      showFeedback("error", "Failed to delete client. Please try again.");
      throw err;
    }
  }

  function handleSelectView(view: "all" | "inbox" | number) {
    setActiveView(view);
    setDrawerOpen(false);
  }

  const sidebarProps = {
    projects,
    clients,
    activeView,
    onSelectView: handleSelectView,
    onCreateProject: handleCreateProject,
    onEditProject: handleEditProject,
    onDeleteProject: handleDeleteProject,
    onReorderProjects: handleReorderProjects,
    onCreateClient: handleCreateClient,
    onEditClient: handleEditClient,
    onDeleteClient: handleDeleteClient,
    // Habits render as a compact check-in section below "Add project" (#76).
    habits,
    pendingCheckIns,
    onCheckInToggle: handleCheckInToggle,
  };

  // Habit lookup by task id, for the list's inline badge + check-in on habit rows.
  const habitsByTaskId = useMemo(() => {
    const m = new Map<number, Habit>();
    for (const h of habits) m.set(h.task.id, h);
    return m;
  }, [habits]);

  return (
    <div className="flex min-h-screen -my-8">
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
            className="flex items-center justify-center p-3 text-text-muted hover:text-text-primary border border-border rounded-md bg-surface cursor-pointer transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1"
          >
            <Menu size={20} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-md hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 transition-colors duration-150 cursor-pointer"
          >
            <Plus size={16} aria-hidden="true" />
            Add Task
          </button>
        </div>

        {/* Feedback from project operations (create/rename/delete errors). */}
        {feedback && (
          <div
            role="alert"
            className="mb-4 flex items-center gap-2 px-4 py-3 rounded-md text-sm font-medium bg-danger-bg text-danger border border-danger/30"
          >
            {feedback.message}
          </div>
        )}

        {/* Tasks. Habits live in the left sidebar now (a compact check-in section below
            "Add project"), so the task list gets the full width here (#76). */}
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
            className="flex items-center justify-center p-2 text-text-muted hover:text-text-primary cursor-pointer transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 rounded"
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
    </div>
  );
}
