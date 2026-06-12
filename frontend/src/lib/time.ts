// Pure timeline geometry + grouping math for the time-tracking dashboard (#77). No clock
// reads - callers pass `now` - so it is unit-testable. The timeline is an hour grid: a block's
// vertical position/height come from its minutes-from-midnight, scaled by PX_PER_MIN. An entry
// that crosses midnight is clamped per day, so a single interval renders as a segment in each
// day column it touches.

import { TimeEntry } from "./api";

export const PX_PER_MIN = 0.8; // 1 hour = 48px
export const DAY_MINUTES = 24 * 60;
export const DAY_PX = DAY_MINUTES * PX_PER_MIN; // 1152
export const MIN_BLOCK_PX = 18; // tiny entries still get a readable, clickable height

// Local "YYYY-MM-DD" for a date.
export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Local midnight of the given date.
export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

// The Monday of the week containing `d` (weeks start Monday, matching the app's conventions).
export function mondayOf(d: Date): Date {
  const offset = (d.getDay() + 6) % 7; // Sun(0)->6, Mon(1)->0, ... Sat(6)->5
  return addDays(startOfDay(d), -offset);
}

// The day columns to render: one for "day", Mon-Sun for "week".
export function dayColumns(anchor: Date, mode: "day" | "week"): Date[] {
  if (mode === "day") return [startOfDay(anchor)];
  const monday = mondayOf(anchor);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export interface DaySegment {
  topPx: number;
  heightPx: number;
  startMin: number; // minutes from this day's midnight (clamped)
  endMin: number;
}

// Geometry for the portion of [start, end] that falls on `day`. `end` null = running (uses
// `now`). Returns null when the interval doesn't overlap the day at all.
export function daySegment(
  startISO: string,
  endISO: string | null,
  day: Date,
  now: Date,
): DaySegment | null {
  const dayStart = startOfDay(day).getTime();
  const dayEnd = addDays(day, 1).getTime();
  const s = new Date(startISO).getTime();
  const e = (endISO ? new Date(endISO) : now).getTime();

  const segStart = Math.max(s, dayStart);
  const segEnd = Math.min(e, dayEnd);
  if (segEnd <= segStart) return null;

  const startMin = (segStart - dayStart) / 60000;
  const endMin = (segEnd - dayStart) / 60000;
  return {
    topPx: startMin * PX_PER_MIN,
    heightPx: Math.max(MIN_BLOCK_PX, (endMin - startMin) * PX_PER_MIN),
    startMin,
    endMin,
  };
}

// Seconds of [start, end] that fall on `day` (for per-day totals; respects midnight split).
export function secondsOnDay(startISO: string, endISO: string | null, day: Date, now: Date): number {
  const dayStart = startOfDay(day).getTime();
  const dayEnd = addDays(day, 1).getTime();
  const s = new Date(startISO).getTime();
  const e = (endISO ? new Date(endISO) : now).getTime();
  const overlap = Math.min(e, dayEnd) - Math.max(s, dayStart);
  return overlap > 0 ? Math.floor(overlap / 1000) : 0;
}

// Total tracked seconds on a given day across all entries.
export function dayTotalSeconds(entries: TimeEntry[], day: Date, now: Date): number {
  return entries.reduce((sum, en) => sum + secondsOnDay(en.startedAt, en.endedAt, day, now), 0);
}

// Per-task totals (taskId -> { title, seconds }) across the given days. Used by the breakdown.
export function perTaskTotals(
  entries: TimeEntry[],
  days: Date[],
  now: Date,
): { taskId: number; title: string; seconds: number }[] {
  const totals = new Map<number, { title: string; seconds: number }>();
  for (const en of entries) {
    const secs = days.reduce((sum, d) => sum + secondsOnDay(en.startedAt, en.endedAt, d, now), 0);
    if (secs <= 0) continue;
    const prev = totals.get(en.taskId);
    totals.set(en.taskId, { title: en.taskTitle, seconds: (prev?.seconds ?? 0) + secs });
  }
  return [...totals.entries()]
    .map(([taskId, v]) => ({ taskId, title: v.title, seconds: v.seconds }))
    .sort((a, b) => b.seconds - a.seconds);
}

// 12-hour clock label for a block, e.g. "4:40 AM".
export function clockLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
