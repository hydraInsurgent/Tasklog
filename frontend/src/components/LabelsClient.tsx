"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { usePolling } from "@/hooks/usePolling";
import { Trash2, CheckCircle, XCircle, Loader2 } from "lucide-react";
import {
  getLabels,
  createLabel,
  updateLabel,
  deleteLabel,
  Label,
} from "@/lib/api";
import { labelColor } from "@/lib/format";
import LabelColorButton from "./LabelColorButton";

// Feedback shown briefly after an action (same pattern as TasksClient).
type Feedback = { type: "success" | "error"; message: string } | null;

export default function LabelsClient() {
  const [labels, setLabels] = useState<Label[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<Feedback>(null);

  // Create form state.
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  // Inline editing: which label is being renamed.
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");

  // Track which labels have async requests in-flight for disabling.
  // Using a Set allows color-change and rename to be tracked independently.
  const [pendingIds, setPendingIds] = useState<Set<number>>(new Set());

  // Ref to the edit input so we can auto-focus it.
  const editInputRef = useRef<HTMLInputElement>(null);

  // Fetch labels on mount.
  useEffect(() => {
    async function load() {
      try {
        const data = await getLabels();
        setLabels(data);
      } catch {
        showFeedback("error", "Failed to load labels. Is the API running?");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Background polling: refresh labels every 30 seconds.
  // Pauses when the user is creating, editing, or has pending async operations
  // to avoid overwriting in-flight state.
  const pollEnabled = !creating && editingId === null && pendingIds.size === 0;

  usePolling(
    useCallback(async () => {
      const freshLabels = await getLabels();
      setLabels(freshLabels);
    }, []),
    30000,
    pollEnabled,
  );

  // Auto-focus the rename input whenever a label enters edit mode.
  useEffect(() => {
    if (editingId !== null && editInputRef.current) {
      editInputRef.current.focus();
    }
  }, [editingId]);

  // Display a feedback message that disappears after 4 seconds.
  function showFeedback(type: "success" | "error", message: string) {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 4000);
  }

  // Create a new label with the next cycling color index.
  async function handleCreate() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const colorIndex = labels.length % 10;
    setCreating(true);
    try {
      const created = await createLabel(trimmed, colorIndex);
      setLabels((prev) => [...prev, created]);
      setNewName("");
      showFeedback("success", `Label "${created.name}" created.`);
    } catch {
      showFeedback("error", "Failed to create label. Please try again.");
    } finally {
      setCreating(false);
    }
  }

  // Begin inline editing for a label.
  function startEdit(label: Label) {
    setEditingId(label.id);
    setEditingName(label.name);
  }

  // Save an inline rename. Ignores blank input; Escape cancels.
  async function handleRename(label: Label) {
    const trimmed = editingName.trim();
    // Cancel edit if name is empty or unchanged.
    if (!trimmed || trimmed === label.name) {
      setEditingId(null);
      return;
    }
    setPendingIds((prev) => new Set(prev).add(label.id));
    try {
      const updated = await updateLabel(label.id, trimmed, label.colorIndex);
      setLabels((prev) => prev.map((l) => (l.id === label.id ? updated : l)));
      showFeedback("success", `Label renamed to "${updated.name}".`);
    } catch {
      showFeedback("error", "Failed to rename label. Please try again.");
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(label.id);
        return next;
      });
      setEditingId(null);
    }
  }

  // Update a label's color index via the color picker.
  async function handleColorChange(label: Label, colorIndex: number) {
    if (colorIndex === label.colorIndex) return;
    setPendingIds((prev) => new Set(prev).add(label.id));
    try {
      const updated = await updateLabel(label.id, label.name, colorIndex);
      setLabels((prev) => prev.map((l) => (l.id === label.id ? updated : l)));
      showFeedback("success", "Label color updated.");
    } catch {
      showFeedback("error", "Failed to update color. Please try again.");
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(label.id);
        return next;
      });
    }
  }

  // Delete a label after confirmation.
  async function handleDelete(label: Label) {
    const confirmed = window.confirm(
      `Delete label "${label.name}"?\n\nThis label will be removed from all tasks. The tasks themselves will not be deleted.`
    );
    if (!confirmed) return;
    setPendingIds((prev) => new Set(prev).add(label.id));
    try {
      await deleteLabel(label.id);
      setLabels((prev) => prev.filter((l) => l.id !== label.id));
      showFeedback("success", `Label "${label.name}" deleted.`);
    } catch {
      showFeedback("error", "Failed to delete label. Please try again.");
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(label.id);
        return next;
      });
    }
  }

  return (
    <div className="space-y-6">
      {/* Inline feedback message */}
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

      {/* Labels panel */}
      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h1
            className="text-lg font-semibold text-text-primary"
            style={{ fontFamily: "var(--font-space-grotesk), sans-serif" }}
          >
            Labels
          </h1>
        </div>

        {loading ? (
          // Loading state spinner.
          <div className="flex items-center justify-center gap-2 py-16 text-text-muted">
            <Loader2 size={20} className="animate-spin" aria-hidden="true" />
            <span>Loading labels...</span>
          </div>
        ) : labels.length === 0 ? (
          <p className="py-16 text-center text-text-muted text-sm">
            No labels yet. Add one below.
          </p>
        ) : (
          <>
            {/* Desktop table - hidden on mobile */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-muted text-left">
                    <th className="pl-6 pr-2 py-3 w-12">
                      <span className="sr-only">Color</span>
                    </th>
                    <th className="px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wide">
                      Label
                    </th>
                    <th className="px-6 py-3 w-24">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-muted">
                  {labels.map((label) => (
                    <tr
                      key={label.id}
                      className="hover:bg-surface-raised transition-colors duration-150"
                    >
                      {/* Color swatch - clicking opens the color picker */}
                      <td className="pl-6 pr-2 py-4">
                        <LabelColorButton
                          colorIndex={label.colorIndex}
                          onChange={(index) => handleColorChange(label, index)}
                          disabled={pendingIds.has(label.id)}
                        />
                      </td>

                      {/* Label name - clicking enters inline edit mode */}
                      <td className="px-4 py-4">
                        {editingId === label.id ? (
                          <input
                            ref={editInputRef}
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onBlur={() => handleRename(label)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleRename(label);
                              if (e.key === "Escape") setEditingId(null);
                            }}
                            disabled={pendingIds.has(label.id)}
                            className="w-full px-2 py-1 border border-border rounded text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                          />
                        ) : (
                          <button
                            onClick={() => startEdit(label)}
                            className="text-left text-text-primary font-medium hover:text-accent cursor-pointer focus:outline-none focus:underline transition-colors duration-150"
                          >
                            {label.name}
                          </button>
                        )}
                      </td>

                      {/* Actions: delete */}
                      <td className="px-6 py-4">
                        <button
                          onClick={() => handleDelete(label)}
                          disabled={pendingIds.has(label.id)}
                          aria-label={`Delete label: ${label.name}`}
                          className="flex items-center justify-center min-w-[44px] min-h-[44px] text-text-muted hover:text-danger focus:outline-none focus:ring-2 focus:ring-danger focus:ring-offset-1 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors duration-150 cursor-pointer"
                        >
                          {pendingIds.has(label.id) ? (
                            <Loader2
                              size={16}
                              className="animate-spin"
                              aria-hidden="true"
                            />
                          ) : (
                            <Trash2 size={16} aria-hidden="true" />
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile card list - shown below md: breakpoint */}
            <div className="md:hidden divide-y divide-border-muted">
              {labels.map((label) => (
                <div
                  key={label.id}
                  className="flex items-center gap-3 px-4 py-4 bg-surface"
                >
                  {/* Color swatch */}
                  <LabelColorButton
                    colorIndex={label.colorIndex}
                    onChange={(index) => handleColorChange(label, index)}
                    disabled={pendingIds.has(label.id)}
                  />

                  {/* Label name (inline edit on mobile too) */}
                  <div className="flex-1 min-w-0">
                    {editingId === label.id ? (
                      <input
                        ref={editingId === label.id ? editInputRef : undefined}
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onBlur={() => handleRename(label)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRename(label);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        disabled={pendingIds.has(label.id)}
                        className="w-full px-2 py-1 border border-border rounded text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                    ) : (
                      <button
                        onClick={() => startEdit(label)}
                        className="text-left text-text-primary font-medium hover:text-accent cursor-pointer focus:outline-none focus:underline transition-colors duration-150 truncate w-full"
                      >
                        {label.name}
                      </button>
                    )}
                  </div>

                  {/* Delete button */}
                  <button
                    onClick={() => handleDelete(label)}
                    disabled={pendingIds.has(label.id)}
                    aria-label={`Delete label: ${label.name}`}
                    className="shrink-0 flex items-center justify-center min-w-[44px] min-h-[44px] text-text-muted hover:text-danger focus:outline-none focus:ring-2 focus:ring-danger focus:ring-offset-1 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors duration-150 cursor-pointer"
                  >
                    {pendingIds.has(label.id) ? (
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
              ))}
            </div>
          </>
        )}
      </div>

      {/* Create label form */}
      <div className="bg-surface border border-border rounded-lg px-6 py-4">
        <p
          className="text-sm font-medium text-text-primary mb-3"
          style={{ fontFamily: "var(--font-space-grotesk), sans-serif" }}
        >
          Add label
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
            }}
            placeholder="Label name"
            disabled={creating}
            className="flex-1 px-3 py-2 border border-border rounded-md text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <button
            onClick={handleCreate}
            disabled={!newName.trim() || creating}
            className="px-4 py-2 min-h-[44px] text-sm bg-primary text-white rounded-md hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 flex items-center gap-2"
          >
            {creating && (
              <Loader2 size={14} className="animate-spin" aria-hidden="true" />
            )}
            Add label
          </button>
        </div>
      </div>
    </div>
  );
}
