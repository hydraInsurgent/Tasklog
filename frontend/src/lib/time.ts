// Pure timeline geometry + grouping math for the time-tracking dashboard (#77). No clock
// reads - callers pass `now` - so it is unit-testable. The timeline is an hour grid: a block's
// vertical position/height come from its minutes-from-midnight, scaled by PX_PER_MIN. An entry
// that crosses midnight is clamped per day, so a single interval renders as a segment in each
// day column it touches.

import { TimeEntry, Project } from "./api";

// The human label for an entry (#86): a linked task's title, else its free-text
// description, else a placeholder. Task-free entries carry only a description.
export function entryLabel(en: Pick<TimeEntry, "taskTitle" | "description">): string {
  return en.taskTitle || en.description || "Untitled";
}

// 1 hour = 72px. Chosen so any entry >= 15 min renders at its true height (15 * 1.2 = 18px =
// MIN_BLOCK_PX), meaning only sub-15-min blocks ever get inflated - which keeps the push-down
// layout's drift small and blocks aligned to the real time axis (#86).
export const PX_PER_MIN = 1.2;
export const DAY_MINUTES = 24 * 60;
export const DAY_PX = DAY_MINUTES * PX_PER_MIN; // 1728
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

export interface LaidOutBlock {
  entry: TimeEntry;
  topPx: number;
  heightPx: number;
}

// Lay out a day's entries so short blocks that would visually collide - because each is forced
// to a minimum readable height (MIN_BLOCK_PX) even when its real time-slot is tiny - are pushed
// down to sit one under the other instead of overlapping. Timer entries never overlap in TIME
// (single-timer invariant), so this is purely a render fix: walking in start order, each block
// starts no higher than the previous one's bottom. Real gaps between entries are preserved.
// Trade-off: a dense cluster of short entries drifts slightly later on screen, in exchange for
// every block staying readable and separate.
export function layoutDay(entries: TimeEntry[], day: Date, now: Date): LaidOutBlock[] {
  const segs = entries
    .map((e) => ({ e, seg: daySegment(e.startedAt, e.endedAt, day, now) }))
    .filter((x): x is { e: TimeEntry; seg: DaySegment } => x.seg !== null)
    .sort((a, b) => a.seg.startMin - b.seg.startMin);

  const out: LaidOutBlock[] = [];
  let prevBottom = -Infinity;
  for (const { e, seg } of segs) {
    const topPx = Math.max(seg.topPx, prevBottom);
    out.push({ entry: e, topPx, heightPx: seg.heightPx });
    prevBottom = topPx + seg.heightPx;
  }
  return out;
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

// Per-activity totals across the given days (#77, #86). Groups by task when the entry is
// linked, otherwise by its description, so task-free entries ("Sleep") get their own row.
// Used by the timeline's "By activity" breakdown.
export function perActivityTotals(
  entries: TimeEntry[],
  days: Date[],
  now: Date,
): { key: string; title: string; seconds: number }[] {
  const totals = new Map<string, { title: string; seconds: number }>();
  for (const en of entries) {
    const secs = days.reduce((sum, d) => sum + secondsOnDay(en.startedAt, en.endedAt, d, now), 0);
    if (secs <= 0) continue;
    // Task-linked entries collapse by task id; task-free entries collapse by description.
    const key = en.taskId != null ? `t${en.taskId}` : `d${(en.description ?? "").toLowerCase()}`;
    const prev = totals.get(key);
    totals.set(key, { title: entryLabel(en), seconds: (prev?.seconds ?? 0) + secs });
  }
  return [...totals.entries()]
    .map(([key, v]) => ({ key, title: v.title, seconds: v.seconds }))
    .sort((a, b) => b.seconds - a.seconds);
}

// A grouped total for the client/project actuals breakdown (#86).
export interface GroupTotal {
  key: string;         // stable React key
  label: string;       // "Client / Project", "Project", or "No project"
  color: string | null;
  seconds: number;
}

// Per-project totals across the given days, each labelled with its client (#86). Entries
// with no project fall under "No project". `projects` supplies names/colors + the client,
// which the entry itself doesn't carry (it only has projectId + clientName).
export function perProjectTotals(
  entries: TimeEntry[],
  days: Date[],
  now: Date,
  projects: Project[],
): GroupTotal[] {
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const totals = new Map<string, GroupTotal>();
  for (const en of entries) {
    const secs = days.reduce((sum, d) => sum + secondsOnDay(en.startedAt, en.endedAt, d, now), 0);
    if (secs <= 0) continue;
    const key = en.projectId != null ? `p${en.projectId}` : "none";
    const project = en.projectId != null ? projectById.get(en.projectId) : undefined;
    const clientName = project?.client?.name ?? en.clientName ?? null;
    const label = project
      ? clientName ? `${clientName} / ${project.name}` : project.name
      : "No project";
    const color = project?.color ?? en.projectColor ?? null;
    const prev = totals.get(key);
    totals.set(key, { key, label, color, seconds: (prev?.seconds ?? 0) + secs });
  }
  return [...totals.values()].sort((a, b) => b.seconds - a.seconds);
}

// 12-hour clock label for a block, e.g. "4:40 AM".
export function clockLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
