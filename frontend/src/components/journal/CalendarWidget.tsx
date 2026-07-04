"use client";

// Month calendar for date selection (default today). A dot under a day = at least one
// journal entry exists (from GET /api/journal/entries/dates). Month navigation refetches
// the dots for the shown month. Local-calendar math throughout (never toISOString).

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { dateKey } from "@/lib/time";
import SectionCard from "./SectionCard";

const DOW = ["M", "T", "W", "T", "F", "S", "S"];

interface Props {
  selected: Date;
  entryDates: Set<string>;
  onSelect: (d: Date) => void;
  onMonthChange: (anchor: Date) => void;
}

export default function CalendarWidget({ selected, entryDates, onSelect, onMonthChange }: Props) {
  const [anchor, setAnchor] = useState<Date>(new Date(selected.getFullYear(), selected.getMonth(), 1));
  const todayKey = dateKey(new Date());
  const selectedKey = dateKey(selected);

  // Follow the selection across months (e.g. the header's "today" shortcut while
  // browsing March) - otherwise the grid shows a month the selection isn't in.
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
    <SectionCard
      title={anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
      action={
        <span className="flex gap-1">
          <button onClick={() => shiftMonth(-1)} aria-label="Previous month" className="p-1 text-j-muted hover:text-j-ink cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-j-accent rounded">
            <ChevronLeft size={15} aria-hidden="true" />
          </button>
          <button onClick={() => shiftMonth(1)} aria-label="Next month" className="p-1 text-j-muted hover:text-j-ink cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-j-accent rounded">
            <ChevronRight size={15} aria-hidden="true" />
          </button>
        </span>
      }
    >
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {DOW.map((d, i) => (
          <span key={i} className="font-mono text-[0.6rem] text-j-muted py-1">{d}</span>
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
              className={`relative rounded-lg py-2.5 lg:py-1 text-[0.78rem] cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-j-accent hover:bg-j-accent-soft ${
                isToday ? "bg-j-ink text-j-paper font-bold hover:bg-j-ink" : "text-j-ink"
              } ${isSelected && !isToday ? "ring-[1.6px] ring-j-accent" : ""}`}
            >
              {i + 1}
              {entryDates.has(k) && (
                <span className={`absolute left-1/2 -translate-x-1/2 bottom-0.5 w-1 h-1 rounded-full ${isToday ? "bg-j-paper" : "bg-j-accent"}`} aria-hidden="true" />
              )}
            </button>
          );
        })}
      </div>
    </SectionCard>
  );
}
