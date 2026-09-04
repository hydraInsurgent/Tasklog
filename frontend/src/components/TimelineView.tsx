"use client";

/* Toggl-style time-tracking timeline (#77). A vertical hour grid (00:00-23:00) with day
 * columns - a single day on mobile / day-or-week toggle on desktop. Each tracked interval is
 * an absolutely-positioned, project-colored block (top = start, height = duration; midnight-
 * crossing entries split per day). Click an empty slot to log an entry; click a block to edit
 * or delete it. The running entry grows live (we re-render off the TimeTrackingContext tick).
 * Geometry/grouping math is pure in lib/time.ts. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ArrowLeft, Loader2, Trash2 } from "lucide-react";
import {
  TimeEntry, Task, Project,
  getTimeEntries, getTasks, getProjects, addTimeEntry, updateTimeEntry, deleteTimeEntry,
} from "@/lib/api";
import { formatDuration } from "@/lib/format";
import {
  PX_PER_MIN, DAY_PX, dateKey, startOfDay, addDays, dayColumns,
  daySegment, dayTotalSeconds, perActivityTotals, entryLabel, clockLabel,
} from "@/lib/time";
import { useTimeTracking } from "@/contexts/TimeTrackingContext";
import { usePolling } from "@/hooks/usePolling";
import ColorPickerButton from "@/components/ColorPickerButton";

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// "HH:mm" (24h) for a date, for <input type="time"> prefill.
function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
// A local ISO ("YYYY-MM-DDTHH:mm:00", no zone => parsed local) from a day + "HH:mm".
function isoFromDayTime(day: Date, time: string): string {
  return `${dateKey(day)}T${time}:00`;
}

// Add/edit popover state. `entry` set => editing; else adding a new one on `day`. As of #86
// an entry can be task-free: it carries a free-text description and its own project, and the
// task link is optional (taskId "" = none).
interface PopoverState {
  day: Date;
  topPx: number;
  taskId: number | "";
  description: string;
  projectId: number | "";
  start: string; // HH:mm
  end: string;   // HH:mm
  entry?: TimeEntry;
}

export default function TimelineView() {
  const { active, refreshActive } = useTimeTracking(); // subscribing re-renders on the 1s tick
  const [mode, setMode] = useState<"day" | "week">("day");
  const [isDesktop, setIsDesktop] = useState(true);
  const [anchor, setAnchor] = useState<Date>(() => startOfDay(new Date()));
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [popover, setPopover] = useState<PopoverState | null>(null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [snapMode, setSnapMode] = useState<"5min" | "exact">("5min");
  // Inbox color: no DB entity for Inbox, so persist to localStorage.
  const [inboxColor, setInboxColor] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const v = localStorage.getItem("tasklog:inbox-color");
    return /^#[0-9a-fA-F]{6}$/.test(v ?? "") ? v : null;
  });
  const [, setNowTick] = useState(0); // forces a re-render so the now-line stays current
  const scrollRef = useRef<HTMLDivElement>(null);

  // Mobile forces single-day (week columns can't fit); the toggle only shows on desktop.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 640px)");
    const apply = () => setIsDesktop(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  const effectiveMode = isDesktop ? mode : "day";

  const now = new Date();
  const columns = useMemo(() => dayColumns(anchor, effectiveMode), [anchor, effectiveMode]);
  const rangeFrom = columns[0];
  // Memoized so `load`'s useCallback dep is stable across re-renders (addDays creates a new
  // Date on every render otherwise, causing the effect to fire on every 1s tick).
  const rangeTo = useMemo(() => addDays(columns[columns.length - 1], 1), [columns]);

  const load = useCallback(async () => {
    try {
      // Use local ISO strings (no Z suffix) so the range aligns with the server's local-time
      // storage - toISOString() would shift the window by the UTC offset on non-UTC machines.
      const data = await getTimeEntries(`${dateKey(rangeFrom)}T00:00:00`, `${dateKey(rangeTo)}T00:00:00`);
      setEntries(data);
    } catch {
      /* leave prior entries on error */
    } finally {
      setLoading(false);
    }
  }, [rangeFrom, rangeTo]);

  // Fetch on range change and whenever the running timer changes (a start/stop alters data).
  useEffect(() => {
    load();
  }, [load, active?.id]);

  // Poll the visible range so entries logged/edited on another device appear (pauses when the
  // tab is hidden). The context also polls the active timer, which refires the effect above.
  usePolling(load, 30000);

  // Tasks and projects for the add-entry picker.
  useEffect(() => {
    getTasks().then(setTasks).catch(() => {});
    getProjects().then(setProjects).catch(() => {});
  }, []);

  // Keep the now-line / running block roughly current even when no timer is ticking.
  useEffect(() => {
    const id = setInterval(() => setNowTick((n) => n + 1), 30000);
    return () => clearInterval(id);
  }, []);

  // Open scrolled to ~07:00 rather than midnight.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 7 * 60 * PX_PER_MIN;
  }, []);

  function step(dir: 1 | -1) {
    setAnchor((a) => addDays(a, dir * (effectiveMode === "week" ? 7 : 1)));
    setPopover(null);
  }

  function handleInboxColor(color: string | null) {
    setInboxColor(color);
    if (color) localStorage.setItem("tasklog:inbox-color", color);
    else localStorage.removeItem("tasklog:inbox-color");
  }

  // Click an empty slot -> open the add popover prefilled from the clicked time.
  function handleColumnClick(e: React.MouseEvent<HTMLDivElement>, day: Date) {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const rawMin = Math.max(0, Math.min(DAY_PX, y)) / PX_PER_MIN;
    const snap = snapMode === "5min" ? 5 : 1;
    // Clamp to 23:59 so snapping near midnight doesn't produce a start at 24:00.
    const rounded = Math.min(Math.round(rawMin / snap) * snap, 1439);
    const startD = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, rounded);
    // Cap end at 23:59 on the same day (a 30-min default near midnight would otherwise cross).
    const maxEndMs = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59).getTime();
    const endD = new Date(Math.min(startD.getTime() + 30 * 60000, maxEndMs));
    setFormError("");
    setPopover({
      day,
      topPx: rounded * PX_PER_MIN,
      taskId: "",
      description: "",
      projectId: "",
      start: hhmm(startD),
      end: hhmm(endD),
    });
  }

  function openEdit(entry: TimeEntry) {
    // Running entries are editable too (#86): you can fix the start / description / project
    // while the timer runs; the end stays "running" (stopping is still done from the bar).
    const s = new Date(entry.startedAt);
    setFormError("");
    setPopover({
      day: startOfDay(s),
      topPx: daySegment(entry.startedAt, entry.endedAt, startOfDay(s), now)?.topPx ?? 0,
      taskId: entry.taskId ?? "",
      description: entry.description ?? "",
      projectId: entry.projectId ?? "",
      start: hhmm(s),
      end: entry.endedAt ? hhmm(new Date(entry.endedAt)) : hhmm(now),
      entry,
    });
  }

  async function saveForm() {
    if (!popover) return;
    // #86: an entry needs SOMETHING to identify it - a task or a description.
    if (popover.taskId === "" && !popover.description.trim()) {
      setFormError("Add a description or pick a task.");
      return;
    }
    const taskId = popover.taskId === "" ? null : popover.taskId;
    const projectId = popover.projectId === "" ? null : popover.projectId;
    const description = popover.description.trim() || null;
    const startISO = isoFromDayTime(popover.day, popover.start);

    // Running entry (#86): edit start / description / project in place; the end stays running
    // (stopping is done from the tracking bar), so skip the end validation entirely.
    if (popover.entry && !popover.entry.endedAt) {
      if (new Date(startISO).getTime() > Date.now()) {
        setFormError("Start can't be in the future.");
        return;
      }
      setSaving(true);
      try {
        await updateTimeEntry(popover.entry.id, { startedAt: startISO, taskId, description, projectId });
        await refreshActive(); // sync the bar's live elapsed to the new start
        setPopover(null);
        await load();
      } catch (err) {
        setFormError(err instanceof Error ? err.message : "Save failed.");
      } finally {
        setSaving(false);
      }
      return;
    }

    const endISO = isoFromDayTime(popover.day, popover.end);
    if (new Date(endISO).getTime() <= new Date(startISO).getTime()) {
      setFormError("End must be after start.");
      return;
    }
    // Reject end times more than 5 minutes in the future.
    if (new Date(endISO).getTime() > Date.now() + 5 * 60000) {
      setFormError("End time cannot be in the future.");
      return;
    }
    // Warn on overlap with any existing closed entry (not the one being edited).
    const startMs = new Date(startISO).getTime();
    const endMs = new Date(endISO).getTime();
    const editId = popover.entry?.id;
    const overlaps = entries.some((e) => {
      if (e.id === editId || !e.endedAt) return false;
      return startMs < new Date(e.endedAt).getTime() && endMs > new Date(e.startedAt).getTime();
    });
    if (overlaps) { setFormError("This entry overlaps an existing one."); return; }
    setSaving(true);
    try {
      if (popover.entry) {
        // Present-key: send task/description/project too so edits (incl. clearing) stick.
        await updateTimeEntry(popover.entry.id, { startedAt: startISO, endedAt: endISO, taskId, description, projectId });
      } else {
        await addTimeEntry({ startedAt: startISO, endedAt: endISO, taskId, description, projectId });
      }
      setPopover(null);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function removeEntry() {
    if (!popover?.entry) return;
    setSaving(true);
    try {
      await deleteTimeEntry(popover.entry.id);
      setPopover(null);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setSaving(false);
    }
  }

  const rangeTotal = columns.reduce((sum, d) => sum + dayTotalSeconds(entries, d, now), 0);
  const activityTotals = useMemo(() => perActivityTotals(entries, columns, now), [entries, columns, now]);
  // The most recent stopped timer's end, for the running-entry "set start to last stop" button.
  const lastStopISO = useMemo(() => {
    let latest: string | null = null;
    for (const e of entries) {
      if (!e.endedAt) continue;
      if (!latest || new Date(e.endedAt) > new Date(latest)) latest = e.endedAt;
    }
    return latest;
  }, [entries]);

  return (
    <div className="space-y-4">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary focus:outline-none focus:underline transition-colors duration-150"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Back to tasks
      </Link>

      {/* Header: title + total, day/week toggle (desktop), date nav */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-lg font-semibold text-text-primary">Time</h1>
          <p className="text-sm text-text-muted">
            {formatDuration(rangeTotal)} tracked {effectiveMode === "week" ? "this range" : "this day"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isDesktop && (
            <div className="inline-flex rounded-md border border-border overflow-hidden">
              {(["day", "week"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`px-3 py-1.5 text-sm capitalize cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent ${
                    mode === m ? "bg-primary text-white" : "text-text-muted hover:text-text-primary"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label="Previous"
            className="flex items-center justify-center w-9 h-9 rounded-md border border-border text-text-muted hover:text-text-primary hover:bg-surface-raised focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer"
          >
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => { setAnchor(startOfDay(new Date())); setPopover(null); }}
            className="px-3 py-1.5 text-sm rounded-md border border-border text-text-muted hover:text-text-primary hover:bg-surface-raised focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            aria-label="Next"
            className="flex items-center justify-center w-9 h-9 rounded-md border border-border text-text-muted hover:text-text-primary hover:bg-surface-raised focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer"
          >
            <ChevronRight size={16} aria-hidden="true" />
          </button>
          <input
            type="date"
            aria-label="Jump to date"
            value={dateKey(anchor)}
            onChange={(e) => {
              if (!e.target.value) return;
              const [y, m, d] = e.target.value.split("-").map(Number);
              setAnchor(new Date(y, m - 1, d));
              setPopover(null);
            }}
            className="px-2 py-1.5 text-sm rounded-md border border-border text-text-primary focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer"
          />
        </div>
      </div>

      {/* Settings row: snap granularity + inbox color */}
      <div className="flex flex-wrap items-center gap-4 py-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-text-muted whitespace-nowrap">Snap to</span>
          <div className="inline-flex rounded-md border border-border overflow-hidden">
            {(["5min", "exact"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSnapMode(s)}
                className={`px-2.5 py-1 text-xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent ${
                  snapMode === s ? "bg-primary text-white font-medium" : "bg-surface-raised text-text-primary hover:bg-border"
                }`}
              >
                {s === "5min" ? "5 min" : "Exact"}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-text-muted whitespace-nowrap">Inbox color</span>
          <ColorPickerButton value={inboxColor} onChange={handleInboxColor} size="sm" />
        </div>
      </div>

      {/* Hour grid */}
      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        {/* Column headers (aligned to the gutter) */}
        <div className="flex border-b border-border">
          <div className="w-12 shrink-0" />
          {columns.map((day) => {
            const isToday = dateKey(day) === dateKey(now);
            return (
              <div
                key={dateKey(day)}
                className={`flex-1 min-w-0 px-2 py-2 text-center border-l border-border-muted ${isToday ? "bg-surface-raised" : ""}`}
              >
                <div className="text-xs font-medium text-text-muted">{WEEKDAY[day.getDay()]}</div>
                <div className={`text-sm tabular-nums ${isToday ? "text-accent font-semibold" : "text-text-primary"}`}>
                  {day.getDate()}
                </div>
              </div>
            );
          })}
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-text-muted">
            <Loader2 size={18} className="animate-spin" aria-hidden="true" /> Loading...
          </div>
        ) : (
          <div ref={scrollRef} className="overflow-y-auto" style={{ maxHeight: "65vh" }}>
            <div className="flex" style={{ height: DAY_PX }}>
              {/* Hour-label gutter */}
              <div className="w-12 shrink-0 relative">
                {HOURS.map((h) => (
                  <div
                    key={h}
                    className="absolute right-1 -translate-y-1/2 text-[10px] text-text-muted tabular-nums"
                    style={{ top: h * 60 * PX_PER_MIN }}
                  >
                    {h === 0 ? "" : `${String(h).padStart(2, "0")}:00`}
                  </div>
                ))}
              </div>

              {/* Day columns */}
              {columns.map((day) => {
                const isToday = dateKey(day) === dateKey(now);
                const nowTop = ((now.getHours() * 60 + now.getMinutes()) * PX_PER_MIN);
                return (
                  <div
                    key={dateKey(day)}
                    onClick={(e) => handleColumnClick(e, day)}
                    className={`flex-1 min-w-0 relative border-l border-border-muted cursor-pointer ${isToday ? "bg-surface-raised/50" : ""}`}
                  >
                    {/* Hour gridlines */}
                    {HOURS.map((h) => (
                      <div
                        key={h}
                        className="absolute inset-x-0 border-t border-border-muted"
                        style={{ top: h * 60 * PX_PER_MIN }}
                      />
                    ))}

                    {/* Now line (today only) */}
                    {isToday && (
                      <div className="absolute inset-x-0 z-10 pointer-events-none" style={{ top: nowTop }}>
                        <div className="relative border-t-2 border-danger">
                          <span className="absolute -left-0.5 -top-[5px] w-2 h-2 rounded-full bg-danger" />
                        </div>
                      </div>
                    )}

                    {/* Entry blocks for this day */}
                    {entries.map((en) => {
                      const seg = daySegment(en.startedAt, en.endedAt, day, now);
                      if (!seg) return null;
                      const color = en.projectColor ?? inboxColor;
                      const running = !en.endedAt;
                      const isSelected = popover?.entry?.id === en.id;
                      return (
                        <button
                          key={`${en.id}-${dateKey(day)}`}
                          type="button"
                          onClick={(e) => { e.stopPropagation(); openEdit(en); }}
                          title={`${entryLabel(en)} · ${clockLabel(en.startedAt)}${en.endedAt ? ` - ${clockLabel(en.endedAt)}` : " (running)"}`}
                          className={`absolute left-0.5 right-0.5 overflow-hidden rounded text-left px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer transition-shadow duration-75 ${
                            isSelected ? "ring-2 ring-accent" : ""
                          }`}
                          style={{
                            top: seg.topPx,
                            height: seg.heightPx,
                            backgroundColor: color ? `${color}22` : "var(--color-surface-raised)",
                            borderLeft: `3px solid ${color ?? "var(--color-border)"}`,
                          }}
                        >
                          <span className="block truncate text-[11px] font-medium text-text-primary">
                            {entryLabel(en)}{running ? " ·" : ""}
                          </span>
                          {seg.heightPx >= 32 && (
                            <span className="block truncate text-[10px] text-text-muted">
                              {clockLabel(en.startedAt)}{en.endedAt ? ` - ${clockLabel(en.endedAt)}` : ""}
                            </span>
                          )}
                        </button>
                      );
                    })}

                    {/* Add/edit popover anchored at the slot for this column */}
                    {popover && dateKey(popover.day) === dateKey(day) && (
                      <EntryForm
                        state={popover}
                        tasks={tasks}
                        projects={projects}
                        lastStopISO={lastStopISO}
                        error={formError}
                        saving={saving}
                        onChange={setPopover}
                        onSave={saveForm}
                        onDelete={removeEntry}
                        onCancel={() => setPopover(null)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Per-activity breakdown for the visible range (tasks + task-free entries) */}
      {activityTotals.length > 0 && (
        <div className="bg-surface border border-border rounded-lg p-4">
          <h2 className="font-heading text-sm font-semibold text-text-primary mb-2">By activity</h2>
          <ul className="divide-y divide-border-muted">
            {activityTotals.map((t) => (
              <li key={t.key} className="flex items-center justify-between py-1.5 text-sm">
                <span className="truncate text-text-primary">{t.title}</span>
                <span className="tabular-nums text-text-muted shrink-0 ml-3">{formatDuration(t.seconds)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// The inline add/edit form, anchored near the clicked slot within a day column.
function EntryForm({
  state, tasks, projects, lastStopISO, error, saving, onChange, onSave, onDelete, onCancel,
}: {
  state: PopoverState;
  tasks: Task[];
  projects: Project[];
  lastStopISO: string | null;
  error: string;
  saving: boolean;
  onChange: (s: PopoverState) => void;
  onSave: () => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  // Editing the currently-running entry: end is "running", stopping is done from the bar.
  const isRunning = !!state.entry && !state.entry.endedAt;
  // Keep the popover on-screen: clamp its top within the day.
  const top = Math.min(state.topPx, DAY_PX - 340);

  // Group tasks by project for the optgroup layout.
  const inboxTasks = tasks.filter((t) => !t.projectId);
  const projectGroups = projects
    .map((p) => ({ project: p, tasks: tasks.filter((t) => t.projectId === p.id) }))
    .filter((g) => g.tasks.length > 0);

  // When a task is picked, default the entry's project from it (still overridable below).
  function pickTask(value: string) {
    if (!value) { onChange({ ...state, taskId: "" }); return; }
    const id = Number(value);
    const task = tasks.find((t) => t.id === id);
    onChange({ ...state, taskId: id, projectId: state.projectId === "" ? (task?.projectId ?? "") : state.projectId });
  }

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="absolute z-20 left-1 right-1 sm:left-auto sm:w-64 bg-surface border border-border rounded-lg shadow-xl p-3 space-y-2 tl-pop"
      style={{ top: Math.max(0, top) }}
    >
      <div>
        <label className="block text-xs font-medium text-text-muted mb-1">Description</label>
        <input
          type="text"
          value={state.description}
          onChange={(e) => onChange({ ...state, description: e.target.value })}
          placeholder="e.g. Rise and Shine"
          className="w-full px-2 py-1.5 text-sm border border-border rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-text-muted mb-1">Task (optional)</label>
        <select
          value={state.taskId}
          onChange={(e) => pickTask(e.target.value)}
          className="w-full px-2 py-1.5 text-sm border border-border rounded-md bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer"
        >
          <option value="">No task</option>
          {inboxTasks.length > 0 && (
            <optgroup label="Inbox">
              {inboxTasks.map((t) => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </optgroup>
          )}
          {projectGroups.map(({ project, tasks: pts }) => (
            <optgroup key={project.id} label={project.name}>
              {pts.map((t) => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-text-muted mb-1">Project</label>
        <select
          value={state.projectId}
          onChange={(e) => onChange({ ...state, projectId: e.target.value ? Number(e.target.value) : "" })}
          className="w-full px-2 py-1.5 text-sm border border-border rounded-md bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer"
        >
          <option value="">No project</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.client ? `${p.client.name} / ${p.name}` : p.name}</option>
          ))}
        </select>
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="block text-xs font-medium text-text-muted mb-1">Start</label>
          <input
            type="time"
            value={state.start}
            onChange={(e) => onChange({ ...state, start: e.target.value })}
            className="w-full px-2 py-1.5 text-sm border border-border rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs font-medium text-text-muted mb-1">End</label>
          {isRunning ? (
            <div className="w-full px-2 py-1.5 text-sm border border-border rounded-md text-text-muted bg-surface-raised">
              running…
            </div>
          ) : (
            <input
              type="time"
              value={state.end}
              onChange={(e) => onChange({ ...state, end: e.target.value })}
              className="w-full px-2 py-1.5 text-sm border border-border rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
            />
          )}
        </div>
      </div>
      {isRunning && lastStopISO && (
        <button
          type="button"
          onClick={() => {
            const d = new Date(lastStopISO);
            onChange({ ...state, day: startOfDay(d), start: hhmm(d) });
          }}
          className="text-xs text-accent hover:underline focus:outline-none focus:underline cursor-pointer"
        >
          Set start to last stop ({clockLabel(lastStopISO)})
        </button>
      )}
      {error && <p className="text-xs text-danger" role="alert">{error}</p>}
      <div className="flex items-center justify-between pt-1">
        {state.entry && !isRunning ? (
          <button
            type="button"
            onClick={onDelete}
            disabled={saving}
            aria-label="Delete entry"
            className="flex items-center justify-center w-8 h-8 text-text-muted hover:text-danger focus:outline-none focus:ring-2 focus:ring-danger rounded cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Trash2 size={15} aria-hidden="true" />}
          </button>
        ) : <span />}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="px-3 py-1.5 text-sm text-text-muted hover:text-text-primary focus:outline-none focus:underline cursor-pointer disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-white rounded-md hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving && <Loader2 size={13} className="animate-spin" aria-hidden="true" />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
