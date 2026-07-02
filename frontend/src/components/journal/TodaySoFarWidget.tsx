"use client";

// Today so far (#79): the day's summary at a glance - plan progress, unplanned wins,
// time logged, habits, check-in count. All derived, nothing to fill in.

import SectionCard from "./SectionCard";

interface Props {
  planDone: number;
  planTotal: number;
  unplannedDone: number;
  timeSeconds: number;
  habitsDone: number;
  habitsTotal: number;
  checkinCount: number;
}

export default function TodaySoFarWidget({
  planDone, planTotal, unplannedDone, timeSeconds, habitsDone, habitsTotal, checkinCount,
}: Props) {
  const pct = planTotal > 0 ? Math.round((planDone / planTotal) * 100) : 0;
  const hours = Math.floor(timeSeconds / 3600);
  const minutes = Math.floor((timeSeconds % 3600) / 60);

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
    </SectionCard>
  );
}
