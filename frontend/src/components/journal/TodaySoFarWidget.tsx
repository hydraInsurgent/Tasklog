"use client";

// Today so far (#79): the day's summary at a glance - plan progress, unplanned wins,
// time logged, habits, check-in count. All derived, nothing to fill in.

import SectionCard from "./SectionCard";
import type { GroupTotal } from "@/lib/time";

interface Props {
  planDone: number;
  planTotal: number;
  unplannedDone: number;
  timeSeconds: number;
  // The day's time split by client/project (#86); [] when nothing tracked.
  timeBreakdown?: GroupTotal[];
  habitsDone: number;
  habitsTotal: number;
  checkinCount: number;
}

// Compact "Hh MMm" from seconds.
function hm(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

export default function TodaySoFarWidget({
  planDone, planTotal, unplannedDone, timeSeconds, timeBreakdown = [], habitsDone, habitsTotal, checkinCount,
}: Props) {
  const pct = planTotal > 0 ? Math.round((planDone / planTotal) * 100) : 0;
  const hours = Math.floor(timeSeconds / 3600);
  const minutes = Math.floor((timeSeconds % 3600) / 60);
  // Cap the breakdown to the top rows; roll the rest into one "other" line.
  const TOP = 5;
  const top = timeBreakdown.slice(0, TOP);
  const restSeconds = timeBreakdown.slice(TOP).reduce((s, g) => s + g.seconds, 0);
  const maxSeconds = timeBreakdown.length > 0 ? timeBreakdown[0].seconds : 0;

  return (
    <SectionCard title="Today so far">
      <div className="h-2 rounded-full border border-j-line bg-j-paper overflow-hidden" role="progressbar" aria-valuenow={planDone} aria-valuemin={0} aria-valuemax={planTotal} aria-label="Plan progress">
        <div className="h-full rounded-full bg-j-accent transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>
      <p className="font-mono text-[0.62rem] text-j-muted mt-1">
        {planTotal > 0 ? `plan ${planDone}/${planTotal} done` : "no plan yet"}
      </p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[0.8rem] text-j-muted mt-2 [font-variant-numeric:tabular-nums]">
        <div className="flex justify-between gap-2"><dt>time logged</dt><dd className="font-semibold text-j-ink">{hours}h {String(minutes).padStart(2, "0")}m</dd></div>
        <div className="flex justify-between gap-2"><dt>habits</dt><dd className="font-semibold text-j-ink">{habitsDone}/{habitsTotal}</dd></div>
        <div className="flex justify-between gap-2"><dt>unplanned done</dt><dd className="font-semibold text-j-ink">{unplannedDone}</dd></div>
        <div className="flex justify-between gap-2"><dt>check-ins</dt><dd className="font-semibold text-j-ink">{checkinCount}</dd></div>
      </dl>

      {/* Client/project time breakdown (#86) - the day's actuals, task and non-task alike. */}
      {top.length > 0 && (
        <div className="mt-3 pt-3 border-t border-j-line space-y-1.5">
          {top.map((g) => (
            <div key={g.key} className="text-[0.72rem]">
              <div className="flex items-center justify-between gap-2 text-j-muted [font-variant-numeric:tabular-nums]">
                <span className="truncate">{g.label}</span>
                <span className="shrink-0 font-medium text-j-ink">{hm(g.seconds)}</span>
              </div>
              <div className="mt-0.5 h-1 rounded-full bg-j-paper overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${maxSeconds > 0 ? Math.max(4, Math.round((g.seconds / maxSeconds) * 100)) : 0}%`,
                    backgroundColor: g.color ?? "var(--color-j-accent)",
                  }}
                />
              </div>
            </div>
          ))}
          {restSeconds > 0 && (
            <div className="flex items-center justify-between gap-2 text-[0.72rem] text-j-muted [font-variant-numeric:tabular-nums]">
              <span>other</span>
              <span className="shrink-0">{hm(restSeconds)}</span>
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}
