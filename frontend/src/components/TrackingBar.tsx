"use client";

/* The floating "now tracking" bar (#77). Renders nothing when idle. While a timer runs it
 * shows the task title + live H:MM:SS + a Stop button: full-width fixed bar on mobile,
 * a floating pill bottom-right on desktop. Driven by the shared TimeTrackingContext. */

import { Clock, Square, Loader2 } from "lucide-react";
import { formatClock } from "@/lib/format";
import { useTimeTracking } from "@/contexts/TimeTrackingContext";

export default function TrackingBar() {
  const { active, elapsedSeconds, pending, stop } = useTimeTracking();
  if (!active) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      /* Desktop pill sits bottom-LEFT to avoid the Doppel widget (bottom-right). */
      className="fixed z-40 inset-x-0 bottom-0 sm:inset-x-auto sm:bottom-6 sm:left-6 tl-fade pb-[env(safe-area-inset-bottom,0)] sm:pb-0"
    >
      <div className="flex items-center gap-3 bg-primary text-white px-4 py-3 shadow-xl sm:rounded-full sm:py-2.5">
        <Clock size={16} aria-hidden="true" className="shrink-0 text-white/70" />
        <span className="min-w-0 flex-1 sm:flex-none truncate text-sm font-medium">{active.taskTitle}</span>
        <span className="tabular-nums text-sm font-semibold" aria-label="Elapsed time">
          {formatClock(elapsedSeconds)}
        </span>
        <button
          type="button"
          onClick={stop}
          disabled={pending}
          aria-label="Stop timer"
          title="Stop timer"
          className="flex items-center justify-center w-9 h-9 shrink-0 rounded-full bg-danger text-white hover:bg-danger/90 focus:outline-none focus:ring-2 focus:ring-white/70 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors duration-150"
        >
          {pending ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Square size={16} aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}
