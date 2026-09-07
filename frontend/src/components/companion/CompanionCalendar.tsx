"use client";

// Month calendar for browsing past conversations (#87). A dot under a day =
// a session exists that day (GET /api/companion/sessions/dates). Adapted from
// the journal's CalendarWidget - deliberately a COPY in the companion's own
// c- identity rather than a shared component, so the v3.x journal stays
// untouched (the additive rule). Local-calendar math throughout.

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { dateKey } from "@/lib/time";

const DOW = ["M", "T", "W", "T", "F", "S", "S"];

interface Props {
  selected: Date;
  sessionDates: Set<string>;
  onSelect: (d: Date) => void;
  onMonthChange: (anchor: Date) => void;
}

export default function CompanionCalendar({ selected, sessionDates, onSelect, onMonthChange }: Props) {
  const [anchor, setAnchor] = useState<Date>(new Date(selected.getFullYear(), selected.getMonth(), 1));
  const todayKey = dateKey(new Date());
  const selectedKey = dateKey(selected);

  // Follow the selection across months (the "Back to today" jump while
  // browsing another month must bring the grid home too).
  useEffect(() => {
    setAnchor((a) =>
      a.getFullYear() === selected.getFullYear() && a.getMonth() === selected.getMonth()
        ? a
        : new Date(selected.getFullYear(), selected.getMonth(), 1),
    );
  }, [selected]);

  const shiftMonth = (n: number) => {
    const next = new Date(anchor.getFullYear(), anchor.getMonth() + n, 1);
    setAnchor(next);
    onMonthChange(next);
  };

  // Monday-first grid: leading blanks for the first week.
  const firstDow = (anchor.getDay() + 6) % 7;
  const daysInMonth = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();

  return (
    <div className="rounded-2xl border border-c-line bg-c-card p-3">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-sm font-medium text-c-ink">
          {anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </p>
        <span className="flex gap-1">
          <button
            onClick={() => shiftMonth(-1)}
            aria-label="Previous month"
            className="p-1.5 text-c-muted hover:text-c-ink cursor-pointer rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-c-accent"
          >
            <ChevronLeft size={15} aria-hidden="true" />
          </button>
          <button
            onClick={() => shiftMonth(1)}
            aria-label="Next month"
            className="p-1.5 text-c-muted hover:text-c-ink cursor-pointer rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-c-accent"
          >
            <ChevronRight size={15} aria-hidden="true" />
          </button>
        </span>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {DOW.map((d, i) => (
          <span key={i} className="font-mono text-[0.6rem] text-c-muted py-1">{d}</span>
        ))}
        {Array.from({ length: firstDow }, (_, i) => (
          <span key={`blank-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = new Date(anchor.getFullYear(), anchor.getMonth(), i + 1);
          const k = dateKey(day);
          const isToday = k === todayKey;
          const isSelected = k === selectedKey;
          return (
            <button
              key={k}
              onClick={() => onSelect(day)}
              aria-label={day.toDateString()}
              aria-current={isSelected ? "date" : undefined}
              className={`relative rounded-lg min-h-11 lg:min-h-0 py-2.5 lg:py-1 text-[0.78rem] cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-c-accent hover:bg-c-accent-soft ${
                isToday ? "bg-c-ink text-c-bg font-bold hover:bg-c-ink" : "text-c-ink"
              } ${isSelected && !isToday ? "ring-[1.6px] ring-c-accent" : ""}`}
            >
              {i + 1}
              {sessionDates.has(k) && (
                <span
                  className={`absolute left-1/2 -translate-x-1/2 bottom-0.5 w-1 h-1 rounded-full ${isToday ? "bg-c-bg" : "bg-c-accent"}`}
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
