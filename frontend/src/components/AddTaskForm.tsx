"use client";

import { useState, useEffect, useRef, FormEvent } from "react";
import { Plus } from "lucide-react";
import { Project, Label, createLabel } from "@/lib/api";
import { labelColor, PRIORITY_OPTIONS } from "@/lib/format";
import { parseQuickAdd } from "@/lib/quickAdd";
import LabelChip from "./LabelChip";
import RecurrencePicker from "./RecurrencePicker";
import QuickAddInput from "./QuickAddInput";

interface Props {
  // Called by the parent when the form submits. Parent handles the API call
  // and any feedback display, so this component stays focused on form state.
  onAdd: (title: string, deadline?: string, projectId?: number | null, labelIds?: number[], priority?: number, description?: string, recurrence?: string, isHabit?: boolean) => Promise<void>;
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
  // Optional time-of-day ("HH:mm"). Blank = date-only deadline.
  const [deadlineTime, setDeadlineTime] = useState("");
  // Priority on the P1-P4 scale; default 4 (none).
  const [priority, setPriority] = useState(4);
  // Optional free-text description.
  const [description, setDescription] = useState("");
  // Optional recurrence rule (RRULE-shaped) or null for a one-off task.
  const [recurrence, setRecurrence] = useState<string | null>(null);
  // Whether the new task is tracked as a daily habit (gets a streak + check-ins).
  const [isHabit, setIsHabit] = useState(false);
  // Bumped on a successful add to remount RecurrencePicker (which owns its
  // sub-state after mount) so the picker resets along with the other fields.
  const [pickerKey, setPickerKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Separate error state for label creation so it doesn't interfere with
  // the title validation error shown above the submit button.
  const [labelError, setLabelError] = useState("");
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
  // Last recurrence rule applied from the title, so we only remount the picker when the
  // parsed recurrence actually changes (not on every keystroke).
  const lastParsedRecurrence = useRef<string | undefined>(undefined);

  // Whether to render the labels field at all.
  const showLabelsField = allLabels && allLabels.length > 0;

  // Sync the project dropdown when the parent switches to a different project view.
  useEffect(() => {
    setSelectedProjectId(defaultProjectId != null ? String(defaultProjectId) : "inbox");
  }, [defaultProjectId]);

  // Live-reflect quick-add tokens into the structured controls as you type, so the
  // Deadline / Project / Priority boxes show what the title captured (the in-field
  // highlight + chips show it too - both, per request). Only a control whose token is
  // present in the title is set, so manual edits to dimensions the title doesn't mention
  // are preserved. Recurrence is shown via the chip, not pushed into the picker (which
  // owns its own state after mount).
  useEffect(() => {
    if (!title.trim()) return;
    const parsed = parseQuickAdd(title, projects ?? []);

    // Deadline: an explicit parsed date fills the box; a recurrence with no date anchors
    // to today (only if the box is empty) so the box shows it and the rule has an anchor.
    if (parsed.deadline) {
      const [d, t] = parsed.deadline.split("T");
      setDeadline(d);
      setDeadlineTime(t ? t.slice(0, 5) : "");
    } else if (parsed.recurrence) {
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      setDeadline((prev) => prev || today);
    }

    if (parsed.priority) setPriority(parsed.priority);
    if (parsed.projectName && projects) {
      const match = projects.find((p) => p.name.toLowerCase() === parsed.projectName!.toLowerCase());
      if (match) setSelectedProjectId(String(match.id));
    }

    // Recurrence: reflect it into the picker by remounting it with the parsed rule (the
    // picker owns its sub-state after mount). Only when the parsed rule actually changes,
    // so manual picker edits survive subsequent typing that doesn't touch the recurrence.
    if (parsed.recurrence && parsed.recurrence !== lastParsedRecurrence.current) {
      lastParsedRecurrence.current = parsed.recurrence;
      setRecurrence(parsed.recurrence);
      setPickerKey((k) => k + 1);
    }
  }, [title, projects]);

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

  // Resolve a label name to an existing Label (case-insensitive) or create it.
  // Shared by the label field and quick-add @tokens. Returns null on failure.
  async function resolveOrCreateLabel(name: string): Promise<Label | null> {
    if (!allLabels) return null;
    const existing = allLabels.find((l) => l.name.toLowerCase() === name.toLowerCase());
    if (existing) return existing;
    try {
      return await createLabel(name, allLabels.length % 10);
    } catch {
      return null;
    }
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
      // Check if a label with this name already exists (case-insensitive match).
      // This prevents duplicate labels when the user types a name that exists
      // but wasn't shown in suggestions (e.g. different casing).
      const existing = allLabels.find(
        (l) => l.name.toLowerCase() === trimmed.toLowerCase()
      );
      if (existing) {
        selectLabel(existing);
      } else {
        // No match - create a new label. Color cycles through the 10-color palette.
        const nextColorIndex = allLabels.length % 10;
        try {
          const created = await createLabel(trimmed, nextColorIndex);
          selectLabel(created);
        } catch {
          setLabelError("Couldn't create label. Try again.");
          setTimeout(() => setLabelError(""), 3000);
        }
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

    setLoading(true);
    try {
      // Parse the title as a Todoist-style quick-add line. A plain title yields no
      // tokens and everything falls through to the structured controls below, so
      // this is transparent for users who don't use the syntax.
      const parsed = parseQuickAdd(title, projects ?? []);
      const finalTitle = parsed.cleanedTitle || title.trim();

      // The structured controls' deadline (date + optional time). A parsed date wins.
      const controlDeadline = deadline
        ? deadlineTime
          ? `${deadline}T${deadlineTime}`
          : deadline
        : undefined;
      let finalDeadline = parsed.deadline ?? controlDeadline;

      // Recurrence: a parsed "every ..." wins, else the picker (which only allows a
      // rule when a deadline is set). A recurrence needs a deadline anchor - if none
      // was given, default to today (date-only) so the series can start.
      const finalRecurrence = parsed.recurrence ?? (controlDeadline ? recurrence ?? undefined : undefined);
      if (finalRecurrence && !finalDeadline) {
        const now = new Date();
        finalDeadline = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      }

      // Priority: a parsed pN wins, else the control (default P4).
      const finalPriority = parsed.priority ?? priority;

      // Project: a recognized #project wins, else the dropdown selection.
      let finalProjectId: number | null = selectedProjectId === "inbox" ? null : parseInt(selectedProjectId, 10);
      if (parsed.projectName && projects) {
        const match = projects.find((p) => p.name.toLowerCase() === parsed.projectName!.toLowerCase());
        if (match) finalProjectId = match.id;
      }

      // Labels: those picked in the field plus any @tokens (resolved/created), deduped.
      const labelObjs: Label[] = [...selectedLabels];
      for (const name of parsed.labelNames ?? []) {
        const label = await resolveOrCreateLabel(name);
        if (label && !labelObjs.some((l) => l.id === label.id)) labelObjs.push(label);
      }
      const labelIds = labelObjs.length > 0 ? labelObjs.map((l) => l.id) : undefined;

      await onAdd(finalTitle, finalDeadline, finalProjectId, labelIds, finalPriority, description.trim() || undefined, finalRecurrence, isHabit);
      // Clear the form on success.
      setTitle("");
      setDeadline("");
      setDeadlineTime("");
      setPriority(4);
      setDescription("");
      setRecurrence(null);
      setIsHabit(false);
      lastParsedRecurrence.current = undefined;
      setPickerKey((k) => k + 1);
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
      className="bg-white border border-border rounded-lg p-6"
    >
      <h2
        className="text-base font-semibold text-text-primary mb-4"
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
            className="block text-sm font-medium text-text-primary mb-1"
          >
            Title
          </label>
          {/* Quick-add field: recognizes a date, "every ..." recurrence, #project,
              @label and pN inline and highlights them as you type (parsed on submit). */}
          <QuickAddInput
            id="task-title"
            value={title}
            onChange={setTitle}
            projects={projects ?? []}
            labels={allLabels ?? []}
            disabled={loading}
            placeholder={'e.g. "Email Mark friday #Work @urgent p1"'}
          />
          {/* Inline error placed directly below the field (error-placement rule). */}
          {error && (
            <p className="mt-1 text-sm text-danger" role="alert">
              {error}
            </p>
          )}
        </div>

        {/* Deadline input */}
        <div className="sm:w-44">
          <label
            htmlFor="task-deadline"
            className="block text-sm font-medium text-text-primary mb-1"
          >
            Deadline (optional)
          </label>
          <div className="flex gap-2">
            <input
              id="task-deadline"
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="flex-1 min-w-0 px-3 py-2 border border-border rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-shadow duration-150 cursor-pointer"
              disabled={loading}
            />
            {/* Optional time. Only meaningful with a date; blank = date-only. */}
            <input
              type="time"
              value={deadlineTime}
              onChange={(e) => setDeadlineTime(e.target.value)}
              aria-label="Deadline time (optional)"
              disabled={loading || !deadline}
              className="w-28 px-2 py-2 border border-border rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-shadow duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>
        </div>

        {/* Project dropdown - only shown when projects are available */}
        {projects && projects.length > 0 && (
          <div className="sm:w-44">
            <label
              htmlFor="task-project"
              className="block text-sm font-medium text-text-primary mb-1"
            >
              Project (optional)
            </label>
            <select
              id="task-project"
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              disabled={loading}
              className="w-full px-3 py-2 border border-border rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-shadow duration-150 cursor-pointer bg-white"
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

        {/* Priority picker */}
        <div className="sm:w-32">
          <label
            htmlFor="task-priority"
            className="block text-sm font-medium text-text-primary mb-1"
          >
            Priority
          </label>
          <select
            id="task-priority"
            value={String(priority)}
            onChange={(e) => setPriority(parseInt(e.target.value, 10))}
            disabled={loading}
            className="w-full px-3 py-2 border border-border rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-shadow duration-150 cursor-pointer bg-white"
          >
            {PRIORITY_OPTIONS.map(({ value, meta }) => (
              <option key={value} value={String(value)}>
                {meta.label} - {meta.name}
              </option>
            ))}
          </select>
        </div>

        {/* Recurrence picker. Needs a deadline to anchor from (it disables itself
            and hints otherwise). Date alone is enough; the time is carried by the
            deadline value when the occurrence is spawned. */}
        <div className="sm:w-48">
          <RecurrencePicker
            key={pickerKey}
            value={recurrence}
            onChange={setRecurrence}
            deadline={deadline || undefined}
            disabled={loading}
          />
        </div>

        {/* Labels autocomplete - only shown when allLabels is provided and non-empty */}
        {showLabelsField && (
          <div className="sm:w-56">
            <label
              htmlFor="task-labels"
              className="block text-sm font-medium text-text-primary mb-1"
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
                className="w-full px-3 py-2 border border-border rounded-md text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-shadow duration-150"
              />

              {/* Suggestion dropdown */}
              {showSuggestions && labelSuggestions.length > 0 && (
                <ul
                  ref={suggestionsRef}
                  role="listbox"
                  aria-label="Label suggestions"
                  className="absolute z-20 top-full mt-1 w-full bg-white border border-border rounded-md shadow-md max-h-40 overflow-y-auto"
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
                        className="flex items-center gap-2 w-full px-3 py-2 text-sm text-text-primary hover:bg-surface-raised focus:outline-none focus:bg-surface-raised cursor-pointer transition-colors duration-150"
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

            {/* Inline error for label creation failures. Separate from the title
                error so the two don't overwrite each other. Auto-clears after 3s. */}
            {labelError && (
              <p className="mt-1 text-xs text-danger" role="alert">
                {labelError}
              </p>
            )}
          </div>
        )}

        {/* Submit button: disabled while the request is in flight (disable-during-async rule). */}
        <div className="sm:self-end">
          <label className="block text-sm font-medium text-text-primary mb-1 invisible">
            &nbsp;
          </label>
          <button
            type="submit"
            disabled={loading}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] bg-primary text-white text-sm font-medium rounded-md hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150 cursor-pointer"
          >
            <Plus size={16} aria-hidden="true" />
            {loading ? "Adding..." : "Add Task"}
          </button>
        </div>
      </div>

      {/* Description: optional multiline notes, full width below the inline fields. */}
      <div className="mt-3">
        <label htmlFor="task-description" className="block text-sm font-medium text-text-primary mb-1">
          Description (optional)
        </label>
        <textarea
          id="task-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={loading}
          rows={2}
          maxLength={2000}
          placeholder="Notes, context, a link..."
          className="w-full px-3 py-2 border border-border rounded-md text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-shadow duration-150 resize-y"
        />
      </div>

      {/* Habit toggle: marks the task as a daily habit so it shows on the Habits
          view with a streak. A plain checkbox keeps it out of the inline field row. */}
      <div className="mt-3">
        <label htmlFor="task-is-habit" className="inline-flex items-center gap-2 text-sm text-text-primary cursor-pointer">
          <input
            id="task-is-habit"
            type="checkbox"
            checked={isHabit}
            onChange={(e) => setIsHabit(e.target.checked)}
            disabled={loading}
            className="h-4 w-4 rounded border-border text-text-primary focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 cursor-pointer"
          />
          Track as a daily habit
        </label>
      </div>
    </form>
  );
}
