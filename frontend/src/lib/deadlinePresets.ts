// Quick-deadline presets for the DeadlinePopover. Pure date math, isolated here
// so it can be unit-tested with an injected "now" (no reliance on the real clock).
//
// Conventions (decided in P59 /explore):
//   today      -> today's date
//   tomorrow   -> +1 day
//   weekend    -> the upcoming Saturday (today if today is Saturday)
//   next-week  -> the upcoming Monday (always in the future; +7 if today is Monday)
//   none       -> null (clears the deadline)
//
// All values are local-calendar date strings ("YYYY-MM-DD") to match the
// <input type="date"> format and the date-only deadlines the app stores.

export type DeadlinePreset = "today" | "tomorrow" | "weekend" | "next-week" | "none";

export const DEADLINE_PRESETS: { value: DeadlinePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "weekend", label: "This weekend" },
  { value: "next-week", label: "Next week" },
  { value: "none", label: "No deadline" },
];

// Format a Date as a local-calendar "YYYY-MM-DD" string. Deliberately NOT
// toISOString() - that converts to UTC and can shift the calendar day.
function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, days: number): Date {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  copy.setDate(copy.getDate() + days);
  return copy;
}

// Resolve a preset to a deadline value: a "YYYY-MM-DD" string, or null for "none".
// `now` is injectable for deterministic tests; defaults to the current date.
export function resolvePreset(preset: DeadlinePreset, now: Date = new Date()): string | null {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dow = today.getDay(); // 0 = Sunday ... 6 = Saturday

  switch (preset) {
    case "today":
      return toDateString(today);
    case "tomorrow":
      return toDateString(addDays(today, 1));
    case "weekend": {
      // Upcoming Saturday (day 6). If today IS Saturday, that's today.
      const daysUntilSat = (6 - dow + 7) % 7;
      return toDateString(addDays(today, daysUntilSat));
    }
    case "next-week": {
      // Upcoming Monday (day 1), always in the future. If today is Monday, +7.
      const raw = (1 - dow + 7) % 7;
      const daysUntilMon = raw === 0 ? 7 : raw;
      return toDateString(addDays(today, daysUntilMon));
    }
    case "none":
      return null;
  }
}
