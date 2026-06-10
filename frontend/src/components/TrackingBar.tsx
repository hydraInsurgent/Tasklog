"use client";

/* The persistent tracking bar (#77). Always present (Toggl-style):
 *  - idle:    a "What are you working on?" input + a Start button -> quick-creates an Inbox
 *             task with that title and starts tracking it immediately.
 *  - running: the task title + live H:MM:SS + a Stop button.
 * Bottom-left pill on desktop (clear of the bottom-right Doppel widget), full-width on mobile.
 * Driven by the shared TimeTrackingContext. */

import { useState } from "react";
import { Clock, Play, Square, Loader2 } from "lucide-react";
import { formatClock } from "@/lib/format";
import { useTimeTracking } from "@/contexts/TimeTrackingContext";

export default function TrackingBar() {
  const { active, elapsedSeconds, pending, quickStart, stop } = useTimeTracking();
  const [draft, setDraft] = useState("");

  const shellClass =
    "fixed z-40 inset-x-0 bottom-0 sm:inset-x-auto sm:bottom-6 sm:left-6 tl-fade pb-[env(safe-area-inset-bottom,0)] sm:pb-0";

  if (active) {
    return (
      <div role="status" aria-live="polite" className={shellClass}>
        <div className="flex items-center gap-3 bg-primary text-white px-4 py-3 shadow-xl sm:rounded-full sm:py-2.5">
          <Clock size={16} aria-hidden="true" className="shrink-0 text-white/70" />
          <span className="min-w-0 flex-1 sm:flex-none sm:max-w-[200px] truncate text-sm font-medium">{active.taskTitle}</span>
          <span className="tabular-nums text-sm font-semibold" aria-label="Elapsed time">{formatClock(elapsedSeconds)}</span>
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

  // Idle: quick-start composer.
  function submit() {
    quickStart(draft);
    setDraft("");
  }

  return (
    <div className={shellClass}>
      <form
        onSubmit={(e) => { e.preventDefault(); submit(); }}
        className="flex items-center gap-2 bg-surface border border-border px-3 py-2 shadow-lg sm:rounded-full sm:w-80"
      >
        <Clock size={16} aria-hidden="true" className="shrink-0 text-text-muted" />
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="What are you working on?"
          aria-label="What are you working on?"
          disabled={pending}
          className="min-w-0 flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted focus:outline-none disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={pending}
          aria-label="Start tracking"
          title="Start tracking"
          className="flex items-center justify-center w-9 h-9 shrink-0 rounded-full bg-primary text-white hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors duration-150"
        >
          {pending ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
        </button>
      </form>
    </div>
  );
}
