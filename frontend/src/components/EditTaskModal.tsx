"use client";

import { useState, useEffect, useRef, FormEvent } from "react";
import { X, Check, Loader2 } from "lucide-react";
import {
  Task,
  Project,
  Label,
  updateTask,
  assignTaskProject,
  setTaskLabels,
  getTask,
} from "@/lib/api";
import { labelColor, PRIORITY_OPTIONS } from "@/lib/format";
import RecurrencePicker from "./RecurrencePicker";

interface Props {
  // The task being edited. The modal is rendered only when this is non-null.
  task: Task;
  projects: Project[];
  allLabels: Label[];
  // Called after a successful save with the canonical updated task.
  onSaved: (task: Task) => void;
  // Called to dismiss without saving.
  onClose: () => void;
}

// A task's deadline is stored as an ISO datetime ("2026-12-31T00:00:00") or null.
// The <input type="date"> wants "YYYY-MM-DD". Slice to the date part.
function toDateInput(deadline: string | null): string {
  return deadline ? deadline.slice(0, 10) : "";
}

// The "HH:mm" time portion for a <input type="time">, or "" for a date-only
// (midnight) deadline. Mirrors the backend's midnight = date-only convention.
function toTimeInput(deadline: string | null): string {
  if (!deadline || deadline.slice(11, 16) === "00:00" || deadline.length <= 10) return "";
  return deadline.slice(11, 16);
}

export default function EditTaskModal({ task, projects, allLabels, onSaved, onClose }: Props) {
  const [title, setTitle] = useState(task.title);
  const [deadline, setDeadline] = useState(toDateInput(task.deadline));
  // Optional time-of-day ("HH:mm"); blank = date-only. Disabled when no date.
  const [deadlineTime, setDeadlineTime] = useState(toTimeInput(task.deadline));
  // "inbox" sentinel = null projectId (no project), mirroring AddTaskForm.
  const [projectId, setProjectId] = useState<string>(
    task.projectId != null ? String(task.projectId) : "inbox",
  );
  const [labelIds, setLabelIds] = useState<number[]>(task.labels.map((l) => l.id));
  const [priority, setPriority] = useState(task.priority);
  const [description, setDescription] = useState(task.description ?? "");
  // Recurrence rule (RRULE-shaped) or null. Cleared if the deadline is removed.
  const [recurrence, setRecurrence] = useState<string | null>(task.recurrence);
  // Whether the task is tracked as a daily habit. Toggling off keeps past check-ins.
  const [isHabit, setIsHabit] = useState(task.isHabit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Focus the title field when the modal opens.
  useEffect(() => {
    titleInputRef.current?.focus();
  }, []);

  // Close on Escape.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function toggleLabel(id: number) {
    setLabelIds((prev) =>
      prev.includes(id) ? prev.filter((l) => l !== id) : [...prev, id],
    );
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setError("");

    const trimmed = title.trim();
    if (!trimmed) {
      setError("Title is required.");
      return;
    }

    // Diff against the original task and fire only what changed. Each concern
    // has its own endpoint (title+deadline together via the new PATCH, project
    // and labels via their existing sub-resource PATCHes).
    const origProjectId = task.projectId != null ? String(task.projectId) : "inbox";
    const origLabelIds = task.labels.map((l) => l.id).sort();
    const newLabelIds = [...labelIds].sort();

    const titleChanged = trimmed !== task.title;
    // Build the canonical "YYYY-MM-DDTHH:mm:ss" (or null) form so a date OR time
    // change is detected, and compare against the task's deadline trimmed to seconds.
    // No date -> null (cleared). Date + blank time -> midnight (date-only).
    const newDeadline = deadline ? `${deadline}T${deadlineTime || "00:00"}:00` : null;
    const oldDeadline = task.deadline ? task.deadline.slice(0, 19) : null;
    const deadlineChanged = newDeadline !== oldDeadline;
    const priorityChanged = priority !== task.priority;
    // Normalise blank -> null on both sides so "still no description" isn't a change.
    const newDescription = description.trim() || null;
    const descriptionChanged = newDescription !== (task.description ?? null);
    // Recurrence needs a deadline to anchor from; clearing the deadline also clears it.
    const newRecurrence = newDeadline ? recurrence : null;
    const recurrenceChanged = newRecurrence !== (task.recurrence ?? null);
    const isHabitChanged = isHabit !== task.isHabit;
    const projectChanged = projectId !== origProjectId;
    const labelsChanged =
      origLabelIds.length !== newLabelIds.length ||
      origLabelIds.some((id, i) => id !== newLabelIds[i]);

    if (!titleChanged && !deadlineChanged && !priorityChanged && !descriptionChanged && !recurrenceChanged && !isHabitChanged && !projectChanged && !labelsChanged) {
      onClose(); // nothing to do
      return;
    }

    setSaving(true);
    try {
      if (titleChanged || deadlineChanged || priorityChanged || descriptionChanged || recurrenceChanged || isHabitChanged) {
        const body: { title?: string; deadline?: string | null; priority?: number; description?: string | null; recurrence?: string | null; isHabit?: boolean } = {};
        if (titleChanged) body.title = trimmed;
        // Send the deadline whenever the recurrence is being set, so the backend
        // sees the anchor in the same PATCH (it processes deadline before recurrence).
        if (deadlineChanged || (recurrenceChanged && newRecurrence)) body.deadline = newDeadline;
        if (priorityChanged) body.priority = priority;
        if (descriptionChanged) body.description = newDescription;
        if (recurrenceChanged) body.recurrence = newRecurrence;
        if (isHabitChanged) body.isHabit = isHabit;
        await updateTask(task.id, body);
      }
      if (projectChanged) {
        await assignTaskProject(task.id, projectId === "inbox" ? null : parseInt(projectId, 10));
      }
      if (labelsChanged) {
        await setTaskLabels(task.id, labelIds);
      }
      // Fetch the canonical post-update task so local state is fully consistent
      // (the sub-resource PATCHes don't all eager-load labels uniformly).
      const updated = await getTask(task.id);
      onSaved(updated);
    } catch (err) {
      // Saves fan out across up to three endpoints in sequence, so an early one
      // can succeed while a later one fails. Be honest that some changes may have
      // landed and tell the user to refresh rather than blindly redo everything.
      const reason = err instanceof Error ? err.message : "Failed to save changes.";
      setError(`${reason} Some changes may have been saved - refresh to check.`);
      setSaving(false);
    }
  }

  return (
    // Full-screen backdrop; click outside the dialog closes it.
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        // Don't let an outside click dismiss the modal mid-save - the user would
        // never see the success or error result of the in-flight request.
        if (saving) return;
        if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Edit task"
        className="w-full max-w-md bg-white rounded-lg shadow-xl overflow-hidden max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="px-5 py-3 border-b border-zinc-100 flex items-center justify-between">
          <h2
            className="text-base font-semibold text-zinc-900"
            style={{ fontFamily: "var(--font-space-grotesk), sans-serif" }}
          >
            Edit task
          </h2>
          <button
            onClick={onClose}
            aria-label="Close edit dialog"
            className="flex items-center justify-center w-8 h-8 text-zinc-400 hover:text-zinc-700 focus:outline-none focus:ring-2 focus:ring-blue-600 rounded cursor-pointer transition-colors duration-150"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSave} className="flex flex-col overflow-hidden">
          <div className="px-5 py-4 space-y-4 overflow-y-auto">
            {/* Title */}
            <div>
              <label htmlFor="edit-title" className="block text-sm font-medium text-zinc-700 mb-1">
                Title
              </label>
              <input
                id="edit-title"
                ref={titleInputRef}
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={saving}
                className="w-full px-3 py-2 border border-zinc-200 rounded-md text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-shadow duration-150"
              />
            </div>

            {/* Deadline (clearable - empty input = no deadline) */}
            <div>
              <label htmlFor="edit-deadline" className="block text-sm font-medium text-zinc-700 mb-1">
                Deadline
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="edit-deadline"
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  disabled={saving}
                  className="flex-1 px-3 py-2 border border-zinc-200 rounded-md text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-shadow duration-150 cursor-pointer"
                />
                {/* Optional time; blank = date-only. Disabled without a date. */}
                <input
                  type="time"
                  value={deadlineTime}
                  onChange={(e) => setDeadlineTime(e.target.value)}
                  aria-label="Deadline time (optional)"
                  disabled={saving || !deadline}
                  className="w-28 px-2 py-2 border border-zinc-200 rounded-md text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-shadow duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                />
                {deadline && (
                  <button
                    type="button"
                    onClick={() => {
                      setDeadline("");
                      setDeadlineTime("");
                    }}
                    disabled={saving}
                    className="text-sm text-zinc-500 hover:text-zinc-900 focus:outline-none focus:underline cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Recurrence - anchored on the deadline above (disabled without one). */}
            <RecurrencePicker
              value={recurrence}
              onChange={setRecurrence}
              deadline={deadline || undefined}
              disabled={saving}
            />

            {/* Project */}
            {projects.length > 0 && (
              <div>
                <label htmlFor="edit-project" className="block text-sm font-medium text-zinc-700 mb-1">
                  Project
                </label>
                <select
                  id="edit-project"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  disabled={saving}
                  className="w-full px-3 py-2 border border-zinc-200 rounded-md text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-shadow duration-150 cursor-pointer bg-white"
                >
                  <option value="inbox">Inbox</option>
                  {projects.map((p) => (
                    <option key={p.id} value={String(p.id)}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Priority */}
            <div>
              <label htmlFor="edit-priority" className="block text-sm font-medium text-zinc-700 mb-1">
                Priority
              </label>
              <select
                id="edit-priority"
                value={String(priority)}
                onChange={(e) => setPriority(parseInt(e.target.value, 10))}
                disabled={saving}
                className="w-full px-3 py-2 border border-zinc-200 rounded-md text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-shadow duration-150 cursor-pointer bg-white"
              >
                {PRIORITY_OPTIONS.map(({ value, meta }) => (
                  <option key={value} value={String(value)}>
                    {meta.label} - {meta.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Description */}
            <div>
              <label htmlFor="edit-description" className="block text-sm font-medium text-zinc-700 mb-1">
                Description
              </label>
              <textarea
                id="edit-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={saving}
                rows={3}
                maxLength={2000}
                placeholder="Notes, context, a link..."
                className="w-full px-3 py-2 border border-zinc-200 rounded-md text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-shadow duration-150 resize-y"
              />
            </div>

            {/* Habit toggle: track this task on the Habits view with a streak. */}
            <div>
              <label htmlFor="edit-is-habit" className="inline-flex items-center gap-2 text-sm text-zinc-700 cursor-pointer">
                <input
                  id="edit-is-habit"
                  type="checkbox"
                  checked={isHabit}
                  onChange={(e) => setIsHabit(e.target.checked)}
                  disabled={saving}
                  className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:ring-offset-1 cursor-pointer"
                />
                Track as a daily habit
              </label>
            </div>

            {/* Labels - toggle chips for the existing labels */}
            {allLabels.length > 0 && (
              <div>
                <p className="block text-sm font-medium text-zinc-700 mb-1.5">Labels</p>
                <div className="flex flex-wrap gap-1.5">
                  {allLabels.map((label) => {
                    const active = labelIds.includes(label.id);
                    const color = labelColor(label.colorIndex);
                    return (
                      <button
                        key={label.id}
                        type="button"
                        onClick={() => toggleLabel(label.id)}
                        aria-pressed={active}
                        disabled={saving}
                        className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-blue-600 cursor-pointer min-h-[32px]"
                        style={
                          active
                            ? { backgroundColor: color, borderColor: color, color: "#fff" }
                            : { backgroundColor: "#fff", borderColor: "#e4e4e7", color: "#3f3f46" }
                        }
                      >
                        {active && <Check size={10} aria-hidden="true" />}
                        #{label.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {error && (
              <p className="text-sm text-red-500" role="alert">
                {error}
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-zinc-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 min-h-[40px] text-sm text-zinc-600 hover:text-zinc-900 focus:outline-none focus:underline disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors duration-150"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center justify-center gap-2 px-4 py-2 min-h-[40px] bg-zinc-900 text-white text-sm font-medium rounded-md hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150 cursor-pointer"
            >
              {saving && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
