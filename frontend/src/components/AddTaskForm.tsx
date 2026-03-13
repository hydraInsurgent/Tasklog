"use client";

import { useState, useEffect, FormEvent } from "react";
import { Plus } from "lucide-react";
import { Project } from "@/lib/api";

interface Props {
  // Called by the parent when the form submits. Parent handles the API call
  // and any feedback display, so this component stays focused on form state.
  onAdd: (title: string, deadline?: string, projectId?: number | null) => Promise<void>;
  // Projects list for the optional project dropdown. Omit to hide the dropdown.
  projects?: Project[];
  // Which project to pre-select (e.g. the current sidebar view). Null = Inbox.
  defaultProjectId?: number | null;
}

export default function AddTaskForm({ onAdd, projects, defaultProjectId }: Props) {
  const [title, setTitle] = useState("");
  const [deadline, setDeadline] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // "inbox" sentinel string represents null projectId (no project).
  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    defaultProjectId != null ? String(defaultProjectId) : "inbox"
  );

  // Sync the dropdown when the parent switches to a different project view.
  // Without this, the form retains the previous project after the sidebar selection changes.
  useEffect(() => {
    setSelectedProjectId(defaultProjectId != null ? String(defaultProjectId) : "inbox");
  }, [defaultProjectId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (!title.trim()) {
      setError("Title is required.");
      return;
    }

    const projectId = selectedProjectId === "inbox" ? null : parseInt(selectedProjectId, 10);

    setLoading(true);
    try {
      await onAdd(title.trim(), deadline || undefined, projectId);
      // Clear the form on success.
      setTitle("");
      setDeadline("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add task.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white border border-zinc-200 rounded-lg p-6"
    >
      <h2
        className="text-base font-semibold text-zinc-900 mb-4"
        style={{ fontFamily: "var(--font-space-grotesk), sans-serif" }}
      >
        Add a task
      </h2>

      <div className="flex flex-col sm:flex-row gap-3">
        {/* Title input */}
        <div className="flex-1">
          {/* Visible label required by UX rules (form-labels). */}
          <label
            htmlFor="task-title"
            className="block text-sm font-medium text-zinc-700 mb-1"
          >
            Title
          </label>
          <input
            id="task-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What needs to be done?"
            className="w-full px-3 py-2 border border-zinc-200 rounded-md text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-shadow duration-150"
            disabled={loading}
          />
          {/* Inline error placed directly below the field (error-placement rule). */}
          {error && (
            <p className="mt-1 text-sm text-red-500" role="alert">
              {error}
            </p>
          )}
        </div>

        {/* Deadline input */}
        <div className="sm:w-44">
          <label
            htmlFor="task-deadline"
            className="block text-sm font-medium text-zinc-700 mb-1"
          >
            Deadline (optional)
          </label>
          <input
            id="task-deadline"
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className="w-full px-3 py-2 border border-zinc-200 rounded-md text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-shadow duration-150 cursor-pointer"
            disabled={loading}
          />
        </div>

        {/* Project dropdown - only shown when projects are available */}
        {projects && projects.length > 0 && (
          <div className="sm:w-44">
            <label
              htmlFor="task-project"
              className="block text-sm font-medium text-zinc-700 mb-1"
            >
              Project (optional)
            </label>
            <select
              id="task-project"
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              disabled={loading}
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

        {/* Submit button: disabled while the request is in flight (disable-during-async rule). */}
        <div className="sm:self-end">
          <label className="block text-sm font-medium text-zinc-700 mb-1 invisible">
            &nbsp;
          </label>
          <button
            type="submit"
            disabled={loading}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] bg-zinc-900 text-white text-sm font-medium rounded-md hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150 cursor-pointer"
          >
            <Plus size={16} aria-hidden="true" />
            {loading ? "Adding..." : "Add Task"}
          </button>
        </div>
      </div>
    </form>
  );
}
