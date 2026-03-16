"use client";

import { useState, useEffect, useRef, FormEvent } from "react";
import { Plus } from "lucide-react";
import { Project, Label, createLabel } from "@/lib/api";
import { labelColor } from "@/lib/format";
import LabelChip from "./LabelChip";

interface Props {
  // Called by the parent when the form submits. Parent handles the API call
  // and any feedback display, so this component stays focused on form state.
  onAdd: (title: string, deadline?: string, projectId?: number | null, labelIds?: number[]) => Promise<void>;
  // Projects list for the optional project dropdown. Omit to hide the dropdown.
  projects?: Project[];
  // Which project to pre-select (e.g. the current sidebar view). Null = Inbox.
  defaultProjectId?: number | null;
  // All labels available for autocomplete. Omit (or empty) to hide the labels field.
  allLabels?: Label[];
}

export default function AddTaskForm({ onAdd, projects, defaultProjectId, allLabels }: Props) {
  const [title, setTitle] = useState("");
  const [deadline, setDeadline] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // "inbox" sentinel string represents null projectId (no project).
  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    defaultProjectId != null ? String(defaultProjectId) : "inbox"
  );

  // Label autocomplete state
  const [labelInput, setLabelInput] = useState("");
  const [selectedLabels, setSelectedLabels] = useState<Label[]>([]);
  const [labelSuggestions, setLabelSuggestions] = useState<Label[]>([]);
  // Controls suggestion dropdown visibility. Closed on blur, open while typing.
  const [showSuggestions, setShowSuggestions] = useState(false);
  const labelInputRef = useRef<HTMLInputElement>(null);
  // Ref to the suggestions list so we can avoid closing it when clicking inside.
  const suggestionsRef = useRef<HTMLUListElement>(null);

  // Whether to render the labels field at all.
  const showLabelsField = allLabels && allLabels.length > 0;

  // Sync the project dropdown when the parent switches to a different project view.
  useEffect(() => {
    setSelectedProjectId(defaultProjectId != null ? String(defaultProjectId) : "inbox");
  }, [defaultProjectId]);

  // Recompute suggestions whenever the input text or selected labels change.
  useEffect(() => {
    if (!allLabels || labelInput.trim() === "") {
      setLabelSuggestions([]);
      return;
    }
    const lower = labelInput.toLowerCase();
    const alreadySelectedIds = new Set(selectedLabels.map((l) => l.id));
    setLabelSuggestions(
      allLabels.filter(
        (l) => l.name.toLowerCase().includes(lower) && !alreadySelectedIds.has(l.id)
      )
    );
  }, [labelInput, selectedLabels, allLabels]);

  // Close the suggestion dropdown when clicking outside the input or list.
  useEffect(() => {
    if (!showSuggestions) return;
    function handleClickOutside(e: MouseEvent | TouchEvent) {
      const target = e.target as Node;
      const outsideInput = labelInputRef.current && !labelInputRef.current.contains(target);
      const outsideSuggestions = suggestionsRef.current && !suggestionsRef.current.contains(target);
      if (outsideInput && outsideSuggestions) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [showSuggestions]);

  // Add a label to the selected set and clear the input.
  function selectLabel(label: Label) {
    setSelectedLabels((prev) => [...prev, label]);
    setLabelInput("");
    setShowSuggestions(false);
    labelInputRef.current?.focus();
  }

  // Remove a label from the selected set.
  function removeLabel(labelId: number) {
    setSelectedLabels((prev) => prev.filter((l) => l.id !== labelId));
  }

  // Handle Enter key in the label input: select first suggestion or create a new label.
  async function handleLabelKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault(); // Prevent form submission

    if (!allLabels) return;

    const trimmed = labelInput.trim();
    if (!trimmed) return;

    if (labelSuggestions.length > 0) {
      // First suggestion - select it directly.
      selectLabel(labelSuggestions[0]);
    } else {
      // No match - create a new label. Color cycles through the 10-color palette.
      const nextColorIndex = allLabels.length % 10;
      try {
        const created = await createLabel(trimmed, nextColorIndex);
        selectLabel(created);
      } catch {
        // Silently ignore creation errors - don't interrupt the main form flow.
      }
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (!title.trim()) {
      setError("Title is required.");
      return;
    }

    const projectId = selectedProjectId === "inbox" ? null : parseInt(selectedProjectId, 10);
    const labelIds = selectedLabels.length > 0 ? selectedLabels.map((l) => l.id) : undefined;

    setLoading(true);
    try {
      await onAdd(title.trim(), deadline || undefined, projectId, labelIds);
      // Clear the form on success.
      setTitle("");
      setDeadline("");
      setSelectedLabels([]);
      setLabelInput("");
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

      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        {/* Title input */}
        <div className="flex-1 min-w-[200px]">
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

        {/* Labels autocomplete - only shown when allLabels is provided and non-empty */}
        {showLabelsField && (
          <div className="sm:w-56">
            <label
              htmlFor="task-labels"
              className="block text-sm font-medium text-zinc-700 mb-1"
            >
              Labels (optional)
            </label>

            {/* Selected label chips */}
            {selectedLabels.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-1.5">
                {selectedLabels.map((label) => (
                  <LabelChip
                    key={label.id}
                    label={label}
                    onRemove={() => removeLabel(label.id)}
                  />
                ))}
              </div>
            )}

            {/* Relative wrapper so the suggestion list can be absolutely positioned */}
            <div className="relative">
              <input
                id="task-labels"
                ref={labelInputRef}
                type="text"
                value={labelInput}
                onChange={(e) => {
                  setLabelInput(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => {
                  if (labelInput) setShowSuggestions(true);
                }}
                onKeyDown={handleLabelKeyDown}
                placeholder="Type to search..."
                disabled={loading}
                autoComplete="off"
                className="w-full px-3 py-2 border border-zinc-200 rounded-md text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-shadow duration-150"
              />

              {/* Suggestion dropdown */}
              {showSuggestions && labelSuggestions.length > 0 && (
                <ul
                  ref={suggestionsRef}
                  role="listbox"
                  aria-label="Label suggestions"
                  className="absolute z-20 top-full mt-1 w-full bg-white border border-zinc-200 rounded-md shadow-md max-h-40 overflow-y-auto"
                >
                  {labelSuggestions.map((label) => (
                    <li key={label.id} role="option" aria-selected="false">
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          // Prevent the input's blur from firing before the click registers.
                          e.preventDefault();
                          selectLabel(label);
                        }}
                        className="flex items-center gap-2 w-full px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 focus:outline-none focus:bg-zinc-50 cursor-pointer transition-colors duration-150"
                      >
                        {/* Small color swatch */}
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: labelColor(label.colorIndex) }}
                          aria-hidden="true"
                        />
                        {label.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
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
