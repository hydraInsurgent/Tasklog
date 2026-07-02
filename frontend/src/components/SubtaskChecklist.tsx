"use client";

/* Read-only-ish inline checklist shown on a task card (mobile card + board card).
 * Renders each subtask as a small tickable circle + title, capped at `max` rows with
 * a "+N more" affordance that opens the task detail (where the full list + editing +
 * drag-reorder live). Full editing is intentionally NOT here - the card stays compact.
 *
 * The circles mirror the task completion checkbox styling at a smaller size so the
 * "tick each step" gesture reads the same as completing a task. */

import { Check } from "lucide-react";
import { Subtask } from "@/lib/api";
import { formatDeadline, deadlineColorClass } from "@/lib/format";

interface Props {
  subtasks: Subtask[];
  // Toggle a single subtask's done state. The card owns the API call + state update.
  onToggle: (subtaskId: number, isCompleted: boolean) => void;
  // Opens the parent task detail (used by the "+N more" row and after the cap).
  onOpenParent: () => void;
  // How many rows to show inline before collapsing the rest behind "+N more".
  max?: number;
}

export default function SubtaskChecklist({ subtasks, onToggle, onOpenParent, max = 6 }: Props) {
  if (subtasks.length === 0) return null;

  // Show incomplete first (they're what needs doing), then completed, preserving
  // each group's manual order. This keeps the visible slice useful when capped.
  const ordered = [...subtasks].sort((a, b) => {
    if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1;
    return a.position - b.position;
  });
  const visible = ordered.slice(0, max);
  const hidden = ordered.length - visible.length;

  return (
    <ul className="mt-1.5 flex flex-col gap-1">
      {visible.map((s) => (
        <li key={s.id} className="flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggle(s.id, !s.isCompleted);
            }}
            aria-pressed={s.isCompleted}
            aria-label={`Mark subtask "${s.title}" as ${s.isCompleted ? "incomplete" : "complete"}`}
            className={`flex items-center justify-center w-4 h-4 rounded-full border-2 shrink-0 cursor-pointer transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 ${
              s.isCompleted ? "bg-primary border-primary text-white" : "border-border text-transparent hover:border-primary"
            }`}
          >
            {s.isCompleted && <Check size={10} aria-hidden="true" />}
          </button>
          <span className={`text-xs break-words ${s.isCompleted ? "line-through text-text-muted" : "text-text-primary"}`}>
            {s.title}
          </span>
          {s.deadline && (
            <span className={`text-[10px] shrink-0 ${deadlineColorClass(s.deadline)}`}>
              {formatDeadline(s.deadline)}
            </span>
          )}
        </li>
      ))}
      {hidden > 0 && (
        <li>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenParent();
            }}
            className="text-xs text-text-muted hover:text-accent focus:outline-none focus:underline cursor-pointer transition-colors duration-150"
          >
            +{hidden} more
          </button>
        </li>
      )}
    </ul>
  );
}
