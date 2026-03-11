"use client";

import { useState, FormEvent } from "react";
import { Plus } from "lucide-react";

interface Props {
  // Called by the parent when the form submits. Parent handles the API call
  // and any feedback display, so this component stays focused on form state.
  onAdd: (title: string, deadline?: string) => Promise<void>;
}

export default function AddTaskForm({ onAdd }: Props) {
  const [title, setTitle] = useState("");
  const [deadline, setDeadline] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (!title.trim()) {
      setError("Title is required.");
      return;
    }

    setLoading(true);
    try {
      await onAdd(title.trim(), deadline || undefined);
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
