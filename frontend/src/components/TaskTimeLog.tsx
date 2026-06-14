"use client";

import { useState, useEffect } from "react";
import { Clock } from "lucide-react";
import { TimeEntry, getTaskTimeEntries } from "@/lib/api";

interface Props {
  taskId: number;
  // Re-fetch when a timer stops so the list stays current while the sheet is open.
  refreshKey?: number;
}

function fmtDuration(seconds: number): string {
  if (seconds < 60) return "< 1m";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function fmtClock(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default function TaskTimeLog({ taskId, refreshKey }: Props) {
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    getTaskTimeEntries(taskId)
      .then((data) => { if (!cancelled) setEntries(data); })
      .catch(() => { if (!cancelled) setError("Could not load time log."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [taskId, refreshKey]);

  const totalSeconds = entries
    .filter((e) => e.endedAt !== null)
    .reduce((sum, e) => sum + e.durationSeconds, 0);

  return (
    <div className="pt-2 border-t border-border">
      <div className="flex items-center gap-1.5 mb-2">
        <Clock size={14} className="text-text-muted" aria-hidden="true" />
        <span className="text-sm font-medium text-text-muted">Time logged</span>
        {!loading && totalSeconds > 0 && (
          <span className="ml-auto text-sm font-semibold text-text-primary">
            {fmtDuration(totalSeconds)}
          </span>
        )}
      </div>

      {loading && (
        <p className="text-xs text-text-muted">Loading...</p>
      )}

      {!loading && error && (
        <p className="text-xs text-danger">{error}</p>
      )}

      {!loading && !error && entries.length === 0 && (
        <p className="text-xs text-text-muted">No time logged yet.</p>
      )}

      {!loading && !error && entries.length > 0 && (
        <ul className="space-y-1">
          {entries.map((e) => (
            <li
              key={e.id}
              className="flex items-center justify-between gap-2 text-xs rounded-md bg-surface-raised px-2.5 py-1.5"
            >
              <span className="text-text-muted shrink-0">{fmtDate(e.startedAt)}</span>
              <span className="text-text-primary">
                {fmtClock(e.startedAt)}
                {e.endedAt ? ` - ${fmtClock(e.endedAt)}` : " - running"}
              </span>
              <span className="ml-auto font-medium text-text-primary shrink-0">
                {e.endedAt ? fmtDuration(e.durationSeconds) : "running"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
