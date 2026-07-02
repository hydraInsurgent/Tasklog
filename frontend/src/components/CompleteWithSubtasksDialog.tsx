"use client";

/* Shown when completing a parent task that still has OPEN subtasks (#78). Offers the
 * two resolution modes the backend understands: complete all remaining subtasks, or
 * pull them out as their own standalone tasks. Mirrors the DeleteProjectDialog overlay
 * pattern (fixed backdrop, small centred card, Cancel + two actions). */

import { Loader2 } from "lucide-react";

interface Props {
  taskTitle: string;
  // How many subtasks are still open (drives the copy).
  openCount: number;
  busy: boolean;
  onCompleteAll: () => void;
  onPullOut: () => void;
  onCancel: () => void;
}

export default function CompleteWithSubtasksDialog({
  taskTitle,
  openCount,
  busy,
  onCompleteAll,
  onPullOut,
  onCancel,
}: Props) {
  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={busy ? undefined : onCancel}
    >
      <div
        className="bg-surface rounded-lg p-6 w-full max-w-sm shadow-lg"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Complete task with open subtasks"
      >
        <h2 className="font-heading text-base font-semibold text-text-primary mb-2">
          Complete &ldquo;{taskTitle}&rdquo;?
        </h2>
        <p className="text-sm text-text-muted mb-6">
          This task has {openCount} open subtask{openCount === 1 ? "" : "s"}. What should happen to {openCount === 1 ? "it" : "them"}?
        </p>
        <div className="flex flex-col gap-2">
          <button
            onClick={onCompleteAll}
            disabled={busy}
            className="flex items-center justify-center gap-2 px-4 py-2 text-sm bg-primary text-white rounded-md hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1"
          >
            {busy && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
            Complete all {openCount} subtask{openCount === 1 ? "" : "s"}
          </button>
          <button
            onClick={onPullOut}
            disabled={busy}
            className="px-4 py-2 text-sm text-text-primary border border-border rounded-md hover:bg-surface-raised disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1"
          >
            Move {openCount === 1 ? "it" : "them"} out as {openCount === 1 ? "a task" : "tasks"}
          </button>
          <button
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 text-sm text-text-muted hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors duration-150 focus:outline-none focus:underline"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
