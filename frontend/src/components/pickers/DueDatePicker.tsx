"use client";

/* Due-date picker rendered inside a PickerSheet (#73, adapted from Tasklog Business).
 *
 * Three parts: quick chips (Today / Tomorrow / Next week / No date), a hand-rolled
 * month calendar grid, and an optional time-of-day field. Unlike Business's version
 * this does NOT handle recurrence - Tasklog keeps recurrence in its own RRULE picker.
 *
 * Value model matches the rest of the app: an ISO string that is either date-only
 * ("YYYY-MM-DD", treated as end-of-day) or date+time ("YYYY-MM-DDTHH:mm"), or null.
 * All date math is local-calendar (never toISOString, which would shift the day). */

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import PickerSheet from "@/components/PickerSheet";
import { resolvePreset } from "@/lib/deadlinePresets";

type Props = {
  open: boolean;
  triggerRef: React.RefObject<HTMLElement | null>;
  value: string | null; // ISO date or date+time, or null
  onChange: (value: string | null) => void;
  onClose: () => void;
};

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function fmtLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}
function firstDayOfWeek(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

export default function DueDatePicker({ open, triggerRef, value, onChange, onClose }: Props) {
  // Split the value into a date part ("YYYY-MM-DD") and a time part ("HH:mm" or "").
  const datePart = value ? value.slice(0, 10) : null;
  const timePart = value && value.length > 10 && value.slice(11, 16) !== "00:00" ? value.slice(11, 16) : "";

  const today = fmtLocal(new Date());

  // Calendar anchor (the displayed month). Re-anchors to the active date on open.
  const [anchor, setAnchor] = useState<{ year: number; month: number }>(() => {
    const base = datePart ?? today;
    const [y, m] = base.split("-").map(Number);
    return { year: y, month: m - 1 };
  });
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      const base = datePart ?? today;
      const [y, m] = base.split("-").map(Number);
      setAnchor({ year: y, month: m - 1 });
    }
    wasOpen.current = open;
  }, [open, datePart, today]);

  // Emit a new value, preserving the current time part unless cleared.
  function emitDate(date: string | null) {
    if (date === null) {
      onChange(null);
      return;
    }
    onChange(timePart ? `${date}T${timePart}` : date);
  }
  function emitTime(time: string) {
    if (!datePart) return; // a time needs a date
    onChange(time ? `${datePart}T${time}` : datePart);
  }

  const tomorrow = resolvePreset("tomorrow");
  const nextWeek = resolvePreset("next-week");
  const activeChip: "today" | "tomorrow" | "next-week" | "none" | null =
    datePart === null ? "none"
    : datePart === today ? "today"
    : datePart === tomorrow ? "tomorrow"
    : datePart === nextWeek ? "next-week"
    : null;

  const gridCells = useMemo(() => {
    const { year, month } = anchor;
    const firstDow = firstDayOfWeek(year, month);
    const inMonth = daysInMonth(year, month);
    const prevMonthDays = daysInMonth(year, month === 0 ? 11 : month - 1);
    const cells: { y: number; m: number; d: number; inMonth: boolean }[] = [];
    for (let i = firstDow - 1; i >= 0; i--) {
      const d = prevMonthDays - i;
      cells.push({ y: month === 0 ? year - 1 : year, m: month === 0 ? 11 : month - 1, d, inMonth: false });
    }
    for (let d = 1; d <= inMonth; d++) cells.push({ y: year, m: month, d, inMonth: true });
    let nd = 1;
    while (cells.length < 42) {
      cells.push({ y: month === 11 ? year + 1 : year, m: month === 11 ? 0 : month + 1, d: nd++, inMonth: false });
    }
    return cells;
  }, [anchor]);

  function gotoPrevMonth() {
    setAnchor((p) => (p.month === 0 ? { year: p.year - 1, month: 11 } : { year: p.year, month: p.month - 1 }));
  }
  function gotoNextMonth() {
    setAnchor((p) => (p.month === 11 ? { year: p.year + 1, month: 0 } : { year: p.year, month: p.month + 1 }));
  }

  const quickChipBase =
    "inline-flex items-center justify-center px-2.5 py-1 rounded-full text-xs border " +
    "transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 cursor-pointer";
  const quickChipClass = (active: boolean) =>
    active
      ? `${quickChipBase} bg-accent text-white border-accent`
      : `${quickChipBase} bg-surface-raised text-text-primary border-border hover:bg-surface`;

  return (
    <PickerSheet open={open} triggerRef={triggerRef} title="Due date" onClose={onClose}>
      <div className="flex flex-col gap-3">
        {/* Quick chips */}
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => emitDate(today)} className={quickChipClass(activeChip === "today")}>
            Today
          </button>
          <button type="button" onClick={() => emitDate(tomorrow)} className={quickChipClass(activeChip === "tomorrow")}>
            Tomorrow
          </button>
          <button type="button" onClick={() => emitDate(nextWeek)} className={quickChipClass(activeChip === "next-week")}>
            Next week
          </button>
          <button type="button" onClick={() => emitDate(null)} className={quickChipClass(activeChip === "none")}>
            No date
          </button>
        </div>

        {/* Month calendar */}
        <div className="border border-border rounded-md p-2 bg-surface">
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={gotoPrevMonth}
              aria-label="Previous month"
              className="h-7 w-7 inline-flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-surface-raised focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 cursor-pointer"
            >
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
            <span className="text-sm font-medium text-text-primary">
              {MONTH_LABELS[anchor.month]} {anchor.year}
            </span>
            <button
              type="button"
              onClick={gotoNextMonth}
              aria-label="Next month"
              className="h-7 w-7 inline-flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-surface-raised focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 cursor-pointer"
            >
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {DAY_LABELS.map((d) => (
              <div key={d} className="text-center text-[10px] font-medium uppercase tracking-wide text-text-muted py-0.5">
                {d}
              </div>
            ))}
            {gridCells.map((cell, idx) => {
              const cellIso = fmtLocal(new Date(cell.y, cell.m, cell.d));
              const isSelected = datePart === cellIso;
              const isToday = cellIso === today;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => emitDate(cellIso)}
                  aria-label={cellIso}
                  aria-pressed={isSelected}
                  className={
                    "h-8 inline-flex items-center justify-center text-[13px] rounded-full " +
                    "transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 cursor-pointer " +
                    (isSelected
                      ? "bg-accent text-white "
                      : isToday
                        ? "bg-accent/10 text-text-primary hover:bg-surface-raised "
                        : "hover:bg-surface-raised ") +
                    (cell.inMonth ? "text-text-primary" : "text-text-muted")
                  }
                >
                  {cell.d}
                </button>
              );
            })}
          </div>
        </div>

        {/* Optional time-of-day. Only meaningful with a date; preserves the app's
            midnight = date-only convention (blank time = date-only). */}
        <div className="flex items-center gap-2 text-xs">
          <label htmlFor="due-time" className="text-text-muted">
            Time (optional)
          </label>
          <input
            id="due-time"
            type="time"
            value={timePart}
            onChange={(e) => emitTime(e.target.value)}
            disabled={!datePart}
            className="px-2 py-1 border border-border rounded-md text-text-primary bg-surface focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          />
        </div>
      </div>
    </PickerSheet>
  );
}
