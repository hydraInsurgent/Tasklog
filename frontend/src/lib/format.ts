// Shared date formatting, deadline coloring, and label color utilities.

// 10-color VIBGYOR palette for labels. Index matches Label.colorIndex from the API.
// Used by label chips, the color picker, and the labels dashboard.
export const LABEL_COLORS: string[] = [
  "#EF4444", // 0 - Red
  "#F97316", // 1 - Orange
  "#F59E0B", // 2 - Amber
  "#EAB308", // 3 - Yellow
  "#22C55E", // 4 - Green
  "#14B8A6", // 5 - Teal
  "#3B82F6", // 6 - Blue
  "#6366F1", // 7 - Indigo
  "#8B5CF6", // 8 - Violet
  "#EC4899", // 9 - Pink
];

// Returns the hex color for a label's colorIndex (0-9).
// Falls back to the first color if the index is out of range.
export function labelColor(colorIndex: number): string {
  return LABEL_COLORS[colorIndex] ?? LABEL_COLORS[0];
}

// Shared date formatting and deadline coloring utilities.
// Extracted from TasksClient.tsx so both the desktop table and mobile card
// views share the same logic without duplication.

// Returns a Tailwind class for the deadline based on proximity to today.
// - Past due: red (danger)
// - Within 3 days: yellow (warning)
// - Further out or no deadline: muted zinc
export function deadlineColorClass(deadline: string | null): string {
  if (!deadline) return "text-zinc-400";
  const diff =
    (new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  if (diff < 0) return "text-red-500 font-medium";
  if (diff <= 3) return "text-yellow-500 font-medium";
  return "text-zinc-500";
}

// Resolve a project name from a list by ID. Returns "Inbox" for null (uncategorized tasks).
// Shared between the desktop table and mobile card views.
export function projectName(projectId: number | null, projects: { id: number; name: string }[]): string {
  if (projectId === null) return "Inbox";
  return projects.find((p) => p.id === projectId)?.name ?? "Unknown";
}

// Format an ISO date string to a readable local date (e.g. "12 Mar 2026").
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// True when a deadline carries a meaningful time-of-day (not midnight = date-only).
// Checks the "HH:mm" substring directly so it is timezone-safe (avoids new Date()
// re-interpreting a bare date as UTC and shifting the hour in the local zone).
export function hasTimeComponent(iso: string): boolean {
  return iso.length > 10 && iso.slice(11, 16) !== "00:00";
}

// Format a deadline for display: date, plus the time when the deadline is timed
// (e.g. "12 Mar 2026, 3:00 pm"). Date-only deadlines show just the date.
export function formatDeadline(iso: string): string {
  const date = formatDate(iso);
  if (!hasTimeComponent(iso)) return date;
  const time = new Date(iso).toLocaleTimeString("en-GB", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${date}, ${time}`;
}

// Priority metadata for the Todoist P1-P4 scale. P1 is the most urgent.
// P4 (none) has no dot so the default view stays uncluttered. Colors follow the
// agreed scheme: P1 red, P2 orange, P3 blue.
export interface PriorityMeta {
  label: string; // short label, e.g. "P1"
  name: string; // human name, e.g. "Urgent"
  dotColor: string | null; // hex for the dot, or null for P4 (no dot)
}

const PRIORITY_META: Record<number, PriorityMeta> = {
  1: { label: "P1", name: "Urgent", dotColor: "#EF4444" }, // red
  2: { label: "P2", name: "High", dotColor: "#F97316" }, // orange
  3: { label: "P3", name: "Medium", dotColor: "#3B82F6" }, // blue
  4: { label: "P4", name: "None", dotColor: null }, // no dot
};

// Display metadata for a priority value (1-4). Falls back to P4 (none) for any
// out-of-range value so the UI never breaks on unexpected data.
export function priorityMeta(priority: number): PriorityMeta {
  return PRIORITY_META[priority] ?? PRIORITY_META[4];
}

// All four priorities in display order (P1 first), for pickers and filters.
export const PRIORITY_OPTIONS: { value: number; meta: PriorityMeta }[] = [
  { value: 1, meta: PRIORITY_META[1] },
  { value: 2, meta: PRIORITY_META[2] },
  { value: 3, meta: PRIORITY_META[3] },
  { value: 4, meta: PRIORITY_META[4] },
];

// Map RFC 5545 weekday codes to short day names, in week order (the recurrence
// core only emits the codes below). Used by describeRecurrence.
const WEEKDAY_NAMES: Record<string, string> = {
  SU: "Sun", MO: "Mon", TU: "Tue", WE: "Wed", TH: "Thu", FR: "Fri", SA: "Sat",
};
const WEEKDAY_ORDER = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

// Ordinal suffix for a day-of-month (1st, 2nd, 3rd, 4th, ... 21st ...).
function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

// Turn an RRULE-shaped recurrence string into a short human label for the
// recurring badge ("Every day", "Every 3 days", "Weekly on Mon, Wed",
// "Monthly on the 15th"). Mirrors the supported subset (see the backend
// RecurrenceRule helper); falls back to "Repeats" for anything unrecognised
// so the badge never shows a raw rule string.
export function describeRecurrence(rule: string | null): string {
  if (!rule) return "";
  const parts = new Map<string, string>();
  for (const seg of rule.split(";")) {
    const [k, v] = seg.split("=");
    if (k && v) parts.set(k.trim().toUpperCase(), v.trim());
  }
  const freq = parts.get("FREQ")?.toUpperCase();
  const interval = Number(parts.get("INTERVAL") ?? "1");

  if (freq === "DAILY") {
    return interval > 1 ? `Every ${interval} days` : "Every day";
  }
  if (freq === "WEEKLY") {
    const days = (parts.get("BYDAY") ?? "")
      .split(",")
      .map((d) => d.trim().toUpperCase())
      .filter((d) => WEEKDAY_NAMES[d])
      .sort((a, b) => WEEKDAY_ORDER.indexOf(a) - WEEKDAY_ORDER.indexOf(b))
      .map((d) => WEEKDAY_NAMES[d]);
    return days.length > 0 ? `Weekly on ${days.join(", ")}` : "Weekly";
  }
  if (freq === "MONTHLY") {
    const day = Number(parts.get("BYMONTHDAY"));
    return day >= 1 ? `Monthly on the ${ordinal(day)}` : "Monthly";
  }
  return "Repeats";
}
