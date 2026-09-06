"use client";

/* The persistent tracking bar (#77; redesigned for #86).
 *  - idle:    a launcher that opens a composer (bottom sheet on mobile, floating card on
 *             desktop): a free-text description, a merged autocomplete (past entries +
 *             open tasks), and a project picker. Start tracks it - NO phantom Inbox task.
 *  - running: the entry label + live H:MM:SS + a project chip + Stop; tapping the label
 *             re-opens the composer to edit the running entry's description/project.
 * Bottom full-width on mobile, bottom-left card on desktop. Driven by TimeTrackingContext. */

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Clock, Play, Square, Loader2, Pencil, ListChecks, X } from "lucide-react";
import { formatClock } from "@/lib/format";
import { entryLabel } from "@/lib/time";
import { useTimeTracking } from "@/contexts/TimeTrackingContext";
import {
  Project, EntrySuggestion, Task, getProjects, getEntrySuggestions, searchOpenTasks,
} from "@/lib/api";

// A row in the merged suggestion list: a past entry description, or an open task.
type Suggestion =
  | { kind: "entry"; description: string; projectId: number | null }
  | { kind: "task"; taskId: number; title: string; projectId: number | null };

export default function TrackingBar() {
  const { active, elapsedSeconds, pending, quickStart, startEntry, updateActive, stop } = useTimeTracking();

  const [projects, setProjects] = useState<Project[]>([]);
  useEffect(() => {
    getProjects().then(setProjects).catch(() => {});
  }, []);
  const projectById = new Map(projects.map((p) => [p.id, p]));

  // Composer state. mode: "new" starts a fresh entry; "edit" edits the running one.
  const [composer, setComposer] = useState<null | "new" | "edit">(null);
  const [draft, setDraft] = useState("");
  const [projectId, setProjectId] = useState<number | null>(null);
  const [error, setError] = useState("");

  const openNew = useCallback(() => {
    setComposer("new");
    setDraft("");
    setProjectId(null);
    setError("");
  }, []);

  const openEdit = useCallback(() => {
    if (!active) return;
    setComposer("edit");
    setDraft(active.description ?? active.taskTitle ?? "");
    setProjectId(active.projectId);
    setError("");
  }, [active]);

  const close = useCallback(() => setComposer(null), []);

  async function submitNew() {
    setError("");
    const desc = draft.trim();
    try {
      // A bare timer (no description, no project) is allowed; Toggl-style categorize-later.
      await quickStart(desc, projectId);
      close();
    } catch {
      setError("Failed to start. Try again.");
    }
  }

  async function submitEdit() {
    setError("");
    try {
      await updateActive({ description: draft.trim() || null, projectId });
      close();
    } catch {
      setError("Failed to save. Try again.");
    }
  }

  // Desktop: a bottom-RIGHT pill on every page (#87 - moved from bottom-left,
  // one consistent home instead of per-page exceptions). Mobile: the usual
  // full-width dock - except on /companion, where Sage's composer owns the
  // bottom edge and there is no room for both, so the bar hides below lg.
  const onCompanion = usePathname().startsWith("/companion");
  const shellClass = onCompanion
    ? "hidden lg:block fixed z-40 lg:bottom-6 lg:right-6 tl-fade"
    : "fixed z-40 inset-x-0 bottom-0 sm:inset-x-auto sm:bottom-6 sm:right-6 tl-fade pb-[env(safe-area-inset-bottom,0)] sm:pb-0";

  return (
    <>
      {/* The docked bar: running status or the idle launcher. */}
      <div className={shellClass}>
        {active ? (
          <div role="status" aria-live="polite">
            <div className="flex items-center gap-3 bg-primary text-white px-4 py-3 shadow-xl sm:rounded-full sm:py-2.5">
              <Clock size={16} aria-hidden="true" className="shrink-0 text-white/70" />
              <button
                type="button"
                onClick={openEdit}
                className="min-w-0 flex-1 sm:flex-none sm:max-w-[220px] flex items-center gap-2 text-left cursor-pointer group"
                aria-label="Edit the running entry"
              >
                <span className="truncate text-sm font-medium">{entryLabel(active)}</span>
                {active.projectId != null && (
                  <span
                    className="hidden sm:inline-block w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: active.projectColor ?? "rgba(255,255,255,0.5)" }}
                    aria-hidden="true"
                  />
                )}
                <Pencil size={12} aria-hidden="true" className="shrink-0 opacity-0 group-hover:opacity-70 group-focus:opacity-70" />
              </button>
              <span className="tabular-nums text-sm font-semibold" aria-label="Elapsed time">{formatClock(elapsedSeconds)}</span>
              <button
                type="button"
                onClick={stop}
                disabled={pending}
                aria-label="Stop timer"
                title="Stop timer"
                className="flex items-center justify-center w-11 h-11 sm:w-9 sm:h-9 shrink-0 rounded-full bg-danger text-white hover:bg-danger/90 focus:outline-none focus:ring-2 focus:ring-white/70 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors duration-150"
              >
                {pending ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Square size={16} aria-hidden="true" />}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={openNew}
            className="w-full sm:w-80 flex items-center gap-2 bg-surface border border-border shadow-lg px-4 py-3 sm:rounded-2xl text-left cursor-pointer hover:border-accent/50 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <Clock size={16} aria-hidden="true" className="shrink-0 text-text-muted" />
            <span className="flex-1 text-sm text-text-muted">What are you working on?</span>
            <span className="flex items-center justify-center w-9 h-9 shrink-0 rounded-full bg-primary text-white" aria-hidden="true">
              <Play size={16} />
            </span>
          </button>
        )}
      </div>

      {/* Composer: bottom sheet on mobile, floating card on desktop. */}
      {composer && (
        <Composer
          mode={composer}
          draft={draft}
          projectId={projectId}
          projects={projects}
          projectById={projectById}
          pending={pending}
          error={error}
          onDraft={setDraft}
          onProject={setProjectId}
          onPickTask={(t) => { setComposer(null); startEntry({ taskId: t.taskId }).catch(() => {}); }}
          onSubmit={composer === "new" ? submitNew : submitEdit}
          onClose={close}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Composer (description + autocomplete + project picker)
// ---------------------------------------------------------------------------

function Composer({
  mode, draft, projectId, projects, projectById, pending, error,
  onDraft, onProject, onPickTask, onSubmit, onClose,
}: {
  mode: "new" | "edit";
  draft: string;
  projectId: number | null;
  projects: Project[];
  projectById: Map<number, Project>;
  pending: boolean;
  error: string;
  onDraft: (v: string) => void;
  onProject: (v: number | null) => void;
  onPickTask: (t: { kind: "task"; taskId: number; title: string; projectId: number | null }) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Debounced merged autocomplete: past entry descriptions + open tasks (#86). In edit mode
  // we skip task suggestions (you're refining an existing entry, not swapping to a task).
  useEffect(() => {
    const text = draft.trim();
    let cancelled = false;
    const id = setTimeout(async () => {
      try {
        const [entries, tasks] = await Promise.all([
          getEntrySuggestions(text, 6),
          mode === "new" && text ? searchOpenTasks(text) : Promise.resolve<Task[]>([]),
        ]);
        if (cancelled) return;
        const merged: Suggestion[] = [
          ...entries.map((e: EntrySuggestion) => ({ kind: "entry" as const, description: e.description, projectId: e.projectId })),
          ...tasks.map((t) => ({ kind: "task" as const, taskId: t.id, title: t.title, projectId: t.projectId })),
        ];
        setSuggestions(merged);
      } catch {
        if (!cancelled) setSuggestions([]);
      }
    }, 180);
    return () => { cancelled = true; clearTimeout(id); };
  }, [draft, mode]);

  const projectChip = (pid: number | null) => {
    if (pid == null) return null;
    const p = projectById.get(pid);
    if (!p) return null;
    return (
      <span className="flex items-center gap-1 text-[11px] text-text-muted shrink-0">
        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color ?? "var(--color-text-muted)" }} aria-hidden="true" />
        <span className="truncate max-w-[90px]">{p.name}</span>
      </span>
    );
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} aria-hidden="true" />

      {/* Panel: bottom sheet on mobile, floating card on desktop. */}
      <div
        role="dialog"
        aria-label={mode === "new" ? "Start a timer" : "Edit the running entry"}
        className="fixed z-50 inset-x-0 bottom-0 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-96 bg-surface border border-border shadow-2xl rounded-t-2xl sm:rounded-2xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-4 space-y-3"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-sm font-semibold text-text-primary">
            {mode === "new" ? "What are you working on?" : "Edit entry"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex items-center justify-center w-8 h-8 text-text-muted hover:text-text-primary rounded focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <label htmlFor="tb-desc" className="sr-only">Description</label>
        <input
          id="tb-desc"
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => onDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") onSubmit(); if (e.key === "Escape") onClose(); }}
          placeholder="Description (e.g. Rise and Shine)"
          className="w-full px-3 py-2.5 border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
        />

        {/* Merged suggestions */}
        {suggestions.length > 0 && (
          <ul className="max-h-52 overflow-y-auto -mx-1 divide-y divide-border-muted">
            {suggestions.map((s, i) => (
              <li key={`${s.kind}-${i}`}>
                <button
                  type="button"
                  onClick={() => {
                    if (s.kind === "entry") { onDraft(s.description); onProject(s.projectId); }
                    else onPickTask(s);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-surface-raised rounded-md focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer"
                >
                  {s.kind === "entry"
                    ? <Clock size={14} aria-hidden="true" className="shrink-0 text-text-muted" />
                    : <ListChecks size={14} aria-hidden="true" className="shrink-0 text-accent" />}
                  <span className="flex-1 min-w-0 truncate text-text-primary">
                    {s.kind === "entry" ? s.description : s.title}
                  </span>
                  {projectChip(s.projectId)}
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Project picker */}
        <div className="flex items-center gap-2">
          <label htmlFor="tb-project" className="text-xs font-medium text-text-muted shrink-0">Project</label>
          <select
            id="tb-project"
            value={projectId ?? ""}
            onChange={(e) => onProject(e.target.value === "" ? null : Number(e.target.value))}
            className="flex-1 min-w-0 px-3 py-2 border border-border rounded-lg text-sm text-text-primary bg-surface focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer"
          >
            <option value="">No project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.client ? `${p.client.name} / ${p.name}` : p.name}
              </option>
            ))}
          </select>
        </div>

        {error && <p role="alert" className="text-xs text-danger">{error}</p>}

        <button
          type="button"
          onClick={onSubmit}
          disabled={pending}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors duration-150"
        >
          {pending ? <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            : mode === "new" ? <Play size={16} aria-hidden="true" /> : null}
          {mode === "new" ? "Start" : "Save"}
        </button>
      </div>
    </>
  );
}
