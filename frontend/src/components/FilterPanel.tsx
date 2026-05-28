"use client";

import { useState, useEffect, useRef } from "react";
import { X, Check } from "lucide-react";
import { Label, Project } from "@/lib/api";
import { labelColor, PRIORITY_OPTIONS } from "@/lib/format";

// The full set of filter criteria. "none" on dateFilter means no date filter applied.
// `text` is a case-insensitive substring filter on the task title; empty string means
// no text filter.
export interface FilterState {
  labelIds: number[];
  projectIds: number[];
  dateFilter: "none" | "today" | "this-week" | "overdue";
  text: string;
  priorities: number[];
}

export const EMPTY_FILTER: FilterState = {
  labelIds: [],
  projectIds: [],
  dateFilter: "none",
  text: "",
  priorities: [],
};

// Returns true if any filter is active (i.e. differs from the empty state).
// Whitespace-only text is treated as "no filter" - consistent with how the
// backend's text filter treats it.
export function hasActiveFilters(fs: FilterState): boolean {
  return (
    fs.labelIds.length > 0 ||
    fs.projectIds.length > 0 ||
    fs.dateFilter !== "none" ||
    fs.text.trim() !== "" ||
    fs.priorities.length > 0
  );
}

// Count the number of active filter dimensions (for the badge).
export function activeFilterCount(fs: FilterState): number {
  return (
    (fs.labelIds.length > 0 ? 1 : 0) +
    (fs.projectIds.length > 0 ? 1 : 0) +
    (fs.dateFilter !== "none" ? 1 : 0) +
    (fs.text.trim() !== "" ? 1 : 0) +
    (fs.priorities.length > 0 ? 1 : 0)
  );
}

interface Props {
  // The currently applied filter state (from the parent).
  filterState: FilterState;
  allLabels: Label[];
  allProjects: Project[];
  // Called when the user clicks "Apply". Receives the new filter state.
  onApply: (fs: FilterState) => void;
  // Called when the panel should be closed without applying.
  onClose: () => void;
}

const DATE_OPTIONS: { value: FilterState["dateFilter"]; label: string }[] = [
  { value: "none", label: "No date filter" },
  { value: "today", label: "Due today" },
  { value: "this-week", label: "Due this week" },
  { value: "overdue", label: "Overdue" },
];

export default function FilterPanel({
  filterState,
  allLabels,
  allProjects,
  onApply,
  onClose,
}: Props) {
  // Local draft state - not committed until Apply is clicked.
  const [draft, setDraft] = useState<FilterState>(filterState);
  const panelRef = useRef<HTMLDivElement>(null);

  // Reset the draft to the currently applied state when the panel opens.
  useEffect(() => {
    setDraft(filterState);
  }, [filterState]);

  // Close on Escape.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Toggle a label ID in the draft.
  function toggleLabel(id: number) {
    setDraft((prev) => ({
      ...prev,
      labelIds: prev.labelIds.includes(id)
        ? prev.labelIds.filter((l) => l !== id)
        : [...prev.labelIds, id],
    }));
  }

  // Toggle a project ID in the draft.
  function toggleProject(id: number) {
    setDraft((prev) => ({
      ...prev,
      projectIds: prev.projectIds.includes(id)
        ? prev.projectIds.filter((p) => p !== id)
        : [...prev.projectIds, id],
    }));
  }

  // Toggle a priority value in the draft.
  function togglePriority(value: number) {
    setDraft((prev) => ({
      ...prev,
      priorities: prev.priorities.includes(value)
        ? prev.priorities.filter((p) => p !== value)
        : [...prev.priorities, value],
    }));
  }

  function handleApply() {
    onApply(draft);
    onClose();
  }

  function handleClear() {
    setDraft(EMPTY_FILTER);
    onApply(EMPTY_FILTER);
    onClose();
  }

  // Close when the user clicks outside the panel (same pattern as ColorPicker).
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  return (
    // Panel is absolutely positioned by the trigger's relative container in TasksClient.
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Filter tasks"
      className="absolute right-0 top-full mt-1 w-72 bg-surface border border-border rounded-lg shadow-lg z-40 overflow-hidden"
    >
        {/* Header */}
        <div className="px-4 py-3 border-b border-border-muted flex items-center justify-between">
          <span
            className="text-sm font-semibold text-text-primary"
            style={{ fontFamily: "var(--font-space-grotesk), sans-serif" }}
          >
            Filter tasks
          </span>
          <button
            onClick={onClose}
            aria-label="Close filter panel"
            className="flex items-center justify-center w-6 h-6 text-text-muted hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-accent rounded cursor-pointer transition-colors duration-150"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>

        <div className="px-4 py-3 space-y-4 max-h-64 overflow-y-auto">
          {/* Text search section */}
          <section>
            <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">
              Search
            </p>
            <input
              type="text"
              value={draft.text}
              onChange={(e) => setDraft((prev) => ({ ...prev, text: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleApply();
              }}
              placeholder="Search by title..."
              aria-label="Search tasks by title"
              className="w-full px-2.5 py-1.5 text-sm border border-border rounded-md text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent transition-colors duration-150"
            />
          </section>

          {/* Labels section */}
          {allLabels.length > 0 && (
            <section>
              <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">
                Labels
              </p>
              <div className="flex flex-wrap gap-1.5">
                {allLabels.map((label) => {
                  const active = draft.labelIds.includes(label.id);
                  const color = labelColor(label.colorIndex);
                  return (
                    <button
                      key={label.id}
                      onClick={() => toggleLabel(label.id)}
                      aria-pressed={active}
                      className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer min-h-[32px]"
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
            </section>
          )}

          {/* Projects section */}
          {allProjects.length > 0 && (
            <section>
              <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">
                Project
              </p>
              <div className="space-y-1">
                {allProjects.map((project) => {
                  const active = draft.projectIds.includes(project.id);
                  return (
                    <label
                      key={project.id}
                      className="flex items-center gap-2 px-1 py-1 rounded cursor-pointer hover:bg-surface-raised transition-colors duration-150"
                    >
                      <input
                        type="checkbox"
                        checked={active}
                        onChange={() => toggleProject(project.id)}
                        className="w-4 h-4 rounded border-border text-accent focus:ring-accent cursor-pointer"
                      />
                      <span className="text-sm text-text-primary">{project.name}</span>
                    </label>
                  );
                })}
              </div>
            </section>
          )}

          {/* Date section */}
          <section>
            <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">
              Date
            </p>
            <div className="space-y-1">
              {DATE_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className="flex items-center gap-2 px-1 py-1 rounded cursor-pointer hover:bg-surface-raised transition-colors duration-150"
                >
                  <input
                    type="radio"
                    name="date-filter"
                    value={opt.value}
                    checked={draft.dateFilter === opt.value}
                    onChange={() => setDraft((prev) => ({ ...prev, dateFilter: opt.value }))}
                    className="w-4 h-4 border-border text-accent focus:ring-accent cursor-pointer"
                  />
                  <span className="text-sm text-text-primary">{opt.label}</span>
                </label>
              ))}
            </div>
          </section>

          {/* Priority section - toggle chips, OR semantics (matches labels) */}
          <section>
            <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">
              Priority
            </p>
            <div className="flex flex-wrap gap-1.5">
              {PRIORITY_OPTIONS.map(({ value, meta }) => {
                const active = draft.priorities.includes(value);
                // P4 has no color; use a neutral zinc dot in the chip so it still reads.
                const color = meta.dotColor ?? "#a1a1aa";
                return (
                  <button
                    key={value}
                    onClick={() => togglePriority(value)}
                    aria-pressed={active}
                    className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer min-h-[32px]"
                    style={
                      active
                        ? { backgroundColor: color, borderColor: color, color: "#fff" }
                        : { backgroundColor: "#fff", borderColor: "#e4e4e7", color: "#3f3f46" }
                    }
                  >
                    {active && <Check size={10} aria-hidden="true" />}
                    {meta.label}
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border-muted flex items-center justify-between gap-2">
          <button
            onClick={handleClear}
            className="text-sm text-text-muted hover:text-text-primary focus:outline-none focus:underline transition-colors duration-150 cursor-pointer"
          >
            Clear filters
          </button>
          <button
            onClick={handleApply}
            className="px-4 py-2 min-h-[36px] bg-primary text-white text-sm font-medium rounded-md hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 transition-colors duration-150 cursor-pointer"
          >
            Apply
          </button>
        </div>
      </div>
  );
}
