"use client";

import { useState, useEffect, useRef } from "react";
import { X, Check } from "lucide-react";
import { Label, Project } from "@/lib/api";
import { labelColor } from "@/lib/format";

// The full set of filter criteria. "none" on dateFilter means no date filter applied.
export interface FilterState {
  labelIds: number[];
  projectIds: number[];
  dateFilter: "none" | "today" | "this-week" | "overdue";
}

export const EMPTY_FILTER: FilterState = {
  labelIds: [],
  projectIds: [],
  dateFilter: "none",
};

// Returns true if any filter is active (i.e. differs from the empty state).
export function hasActiveFilters(fs: FilterState): boolean {
  return fs.labelIds.length > 0 || fs.projectIds.length > 0 || fs.dateFilter !== "none";
}

// Count the number of active filter dimensions (for the badge).
export function activeFilterCount(fs: FilterState): number {
  return (
    (fs.labelIds.length > 0 ? 1 : 0) +
    (fs.projectIds.length > 0 ? 1 : 0) +
    (fs.dateFilter !== "none" ? 1 : 0)
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
      className="absolute right-0 top-full mt-1 w-72 bg-white border border-zinc-200 rounded-lg shadow-lg z-40 overflow-hidden"
    >
        {/* Header */}
        <div className="px-4 py-3 border-b border-zinc-100 flex items-center justify-between">
          <span
            className="text-sm font-semibold text-zinc-900"
            style={{ fontFamily: "var(--font-space-grotesk), sans-serif" }}
          >
            Filter tasks
          </span>
          <button
            onClick={onClose}
            aria-label="Close filter panel"
            className="flex items-center justify-center w-6 h-6 text-zinc-400 hover:text-zinc-700 focus:outline-none focus:ring-2 focus:ring-blue-600 rounded cursor-pointer transition-colors duration-150"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>

        <div className="px-4 py-3 space-y-4 max-h-64 overflow-y-auto">
          {/* Labels section */}
          {allLabels.length > 0 && (
            <section>
              <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">
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
            </section>
          )}

          {/* Projects section */}
          {allProjects.length > 0 && (
            <section>
              <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">
                Project
              </p>
              <div className="space-y-1">
                {allProjects.map((project) => {
                  const active = draft.projectIds.includes(project.id);
                  return (
                    <label
                      key={project.id}
                      className="flex items-center gap-2 px-1 py-1 rounded cursor-pointer hover:bg-zinc-50 transition-colors duration-150"
                    >
                      <input
                        type="checkbox"
                        checked={active}
                        onChange={() => toggleProject(project.id)}
                        className="w-4 h-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-600 cursor-pointer"
                      />
                      <span className="text-sm text-zinc-700">{project.name}</span>
                    </label>
                  );
                })}
              </div>
            </section>
          )}

          {/* Date section */}
          <section>
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">
              Date
            </p>
            <div className="space-y-1">
              {DATE_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className="flex items-center gap-2 px-1 py-1 rounded cursor-pointer hover:bg-zinc-50 transition-colors duration-150"
                >
                  <input
                    type="radio"
                    name="date-filter"
                    value={opt.value}
                    checked={draft.dateFilter === opt.value}
                    onChange={() => setDraft((prev) => ({ ...prev, dateFilter: opt.value }))}
                    className="w-4 h-4 border-zinc-300 text-blue-600 focus:ring-blue-600 cursor-pointer"
                  />
                  <span className="text-sm text-zinc-700">{opt.label}</span>
                </label>
              ))}
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-zinc-100 flex items-center justify-between gap-2">
          <button
            onClick={handleClear}
            className="text-sm text-zinc-500 hover:text-zinc-900 focus:outline-none focus:underline transition-colors duration-150 cursor-pointer"
          >
            Clear filters
          </button>
          <button
            onClick={handleApply}
            className="px-4 py-2 min-h-[36px] bg-zinc-900 text-white text-sm font-medium rounded-md hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:ring-offset-2 transition-colors duration-150 cursor-pointer"
          >
            Apply
          </button>
        </div>
      </div>
  );
}
