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
import { labelColor } from "@/lib/format";

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

export default function EditTaskModal({ task, projects, allLabels, onSaved, onClose }: Props) {
  const [title, setTitle] = useState(task.title);
  const [deadline, setDeadline] = useState(toDateInput(task.deadline));
  // "inbox" sentinel = null projectId (no project), mirroring AddTaskForm.
  const [projectId, setProjectId] = useState<string>(
    task.projectId != null ? String(task.projectId) : "inbox",
  );
  const [labelIds, setLabelIds] = useState<number[]>(task.labels.map((l) => l.id));
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
    // Compare on the date-string form so "no deadline" vs a date is detected.
    const newDeadline = deadline || null; // "" -> null (cleared)
    // Normalise null -> "" on both sides so the comparison is string-vs-string.
    // Without the `?? ""`, "still no deadline" (null vs "") would read as a change
    // and fire a pointless clear PATCH; with it, only a real add/change/clear counts.
    const deadlineChanged = (newDeadline ?? "") !== toDateInput(task.deadline);
    const projectChanged = projectId !== origProjectId;
    const labelsChanged =
      origLabelIds.length !== newLabelIds.length ||
      origLabelIds.some((id, i) => id !== newLabelIds[i]);

    if (!titleChanged && !deadlineChanged && !projectChanged && !labelsChanged) {
      onClose(); // nothing to do
      return;
    }

    setSaving(true);
    try {
      if (titleChanged || deadlineChanged) {
        const body: { title?: string; deadline?: string | null } = {};
        if (titleChanged) body.title = trimmed;
        if (deadlineChanged) body.deadline = newDeadline;
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
                {deadline && (
                  <button
                    type="button"
                    onClick={() => setDeadline("")}
                    disabled={saving}
                    className="text-sm text-zinc-500 hover:text-zinc-900 focus:outline-none focus:underline cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

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
