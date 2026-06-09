"use client";

/* Per-task start/stop control (#77). Idle: a Play button that hover-reveals on a row (so the
 * dense list stays clean); when THIS task is the running one it shows a green Stop button with
 * live elapsed, always visible. Pass `alwaysVisible` where there's no hover affordance (the
 * task detail page). Reads/writes the shared TimeTrackingContext. */

import { Play, Square, Loader2 } from "lucide-react";
import { Task } from "@/lib/api";
import { formatClock } from "@/lib/format";
import { useTimeTracking } from "@/contexts/TimeTrackingContext";

interface Props {
  task: Task;
  // When true, the idle Play button is always shown (not gated behind row hover).
  alwaysVisible?: boolean;
}

export default function TimerControl({ task, alwaysVisible }: Props) {
  const { isRunning, elapsedSeconds, pending, start, stop } = useTimeTracking();
  const running = isRunning(task.id);

  if (running) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          stop();
        }}
        disabled={pending}
        aria-label={`Stop timer for ${task.title}`}
        title="Stop timer"
        className="inline-flex items-center gap-1.5 px-2 py-1 min-h-[32px] rounded-md text-success border border-success/40 bg-success/10 hover:bg-success/20 focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors duration-150"
      >
        {pending ? (
          <Loader2 size={14} className="animate-spin" aria-hidden="true" />
        ) : (
          <Square size={14} aria-hidden="true" />
        )}
        <span className="text-xs font-medium tabular-nums">{formatClock(elapsedSeconds)}</span>
      </button>
    );
  }

  // Idle: hover-reveal Play (unless alwaysVisible). focus:opacity-100 keeps it keyboard-reachable.
  const reveal = alwaysVisible ? "" : "opacity-0 group-hover:opacity-100 focus:opacity-100";
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        start(task.id);
      }}
      disabled={pending}
      aria-label={`Start timer for ${task.title}`}
      title="Start timer"
      className={`inline-flex items-center justify-center w-8 h-8 rounded-md text-text-muted hover:text-accent hover:bg-surface-raised focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors duration-150 ${reveal}`}
    >
      <Play size={16} aria-hidden="true" />
    </button>
  );
}
