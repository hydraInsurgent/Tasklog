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

// Map RFC 5545 weekday codes to short and full day names, in week order.
const WEEKDAY_NAMES: Record<string, string> = {
  SU: "Sun", MO: "Mon", TU: "Tue", WE: "Wed", TH: "Thu", FR: "Fri", SA: "Sat",
};
const WEEKDAY_FULL: Record<string, string> = {
  SU: "Sunday", MO: "Monday", TU: "Tuesday", WE: "Wednesday", TH: "Thursday", FR: "Friday", SA: "Saturday",
};
const WEEKDAY_ORDER = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const ORDINAL_WORDS: Record<number, string> = { 1: "1st", 2: "2nd", 3: "3rd", 4: "4th" };

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

// Format an RRULE UNTIL value (YYYYMMDD or ISO) as a readable date, for labels.
function formatUntil(raw: string): string {
  const iso = /^\d{8}$/.test(raw)
    ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
    : raw;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? raw : formatDate(iso);
}

// Turn an RRULE-shaped recurrence string into a short human label for the
// recurring badge ("Every day", "Weekly on Mon, Wed", "Monthly on the 3rd
// Thursday", "Every 2 weeks on Mon", appending "until 31 Dec 2026" / "for 5
// times"). Mirrors the supported grammar (see the backend RecurrenceRule
// helper); falls back to "Repeats" for anything unrecognised so the badge
// never shows a raw rule string.
export function describeRecurrence(rule: string | null): string {
  if (!rule) return "";
  const parts = new Map<string, string>();
  for (const seg of rule.split(";")) {
    const [k, v] = seg.split("=");
    if (k && v) parts.set(k.trim().toUpperCase(), v.trim());
  }
  const freq = parts.get("FREQ")?.toUpperCase();
  const interval = Number(parts.get("INTERVAL") ?? "1");

  let base: string;
  if (freq === "DAILY") {
    base = interval > 1 ? `Every ${interval} days` : "Every day";
  } else if (freq === "WEEKLY") {
    const days = (parts.get("BYDAY") ?? "")
      .split(",")
      .map((d) => d.trim().toUpperCase())
      .filter((d) => WEEKDAY_NAMES[d])
      .sort((a, b) => WEEKDAY_ORDER.indexOf(a) - WEEKDAY_ORDER.indexOf(b))
      .map((d) => WEEKDAY_NAMES[d]);
    const lead = interval > 1 ? `Every ${interval} weeks` : "Weekly";
    base = days.length > 0 ? `${lead} on ${days.join(", ")}` : lead;
  } else if (freq === "MONTHLY") {
    const lead = interval > 1 ? `Every ${interval} months` : "Monthly";
    const byday = parts.get("BYDAY")?.toUpperCase();
    if (byday) {
      // Nth-weekday: e.g. "3TH" -> "3rd Thursday", "-1FR" -> "last Friday".
      const code = byday.slice(-2);
      const ord = Number(byday.slice(0, -2));
      const dayName = WEEKDAY_FULL[code] ?? "day";
      const which = ord === -1 ? "last" : ORDINAL_WORDS[ord] ?? `${ord}th`;
      base = `${lead} on the ${which} ${dayName}`;
    } else {
      const day = Number(parts.get("BYMONTHDAY"));
      if (day === -1) base = `${lead} on the last day`;
      else if (day < 0) base = `${lead} on the ${ordinal(-day)}-to-last day`;
      else if (day >= 1) base = `${lead} on the ${ordinal(day)}`;
      else base = lead;
    }
  } else {
    return "Repeats";
  }

  // End condition suffix.
  const until = parts.get("UNTIL");
  const count = parts.get("COUNT");
  if (until) base += `, until ${formatUntil(until)}`;
  else if (count) base += `, for ${count} ${Number(count) === 1 ? "time" : "times"}`;
  return base;
}
