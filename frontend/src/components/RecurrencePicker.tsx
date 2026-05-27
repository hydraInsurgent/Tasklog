"use client";

import { useState } from "react";

// A small recurrence picker that builds an RRULE-shaped string for the recurrence
// core's supported subset: none / daily / every-N-days / weekly-on-weekday(s) /
// monthly-on-day. It is controlled (value + onChange) but owns its sub-state after
// mount - the parent passes the initial rule and receives the rebuilt rule (or null
// for "none"). Recurrence needs a deadline to anchor from, so when there is none the
// controls are disabled with a hint, matching the backend's validation.

interface Props {
  // Current rule (RRULE-shaped) or null for non-recurring. Read once on mount.
  value: string | null;
  // Emits the rebuilt rule, or null when set to "Does not repeat" / incomplete.
  onChange: (rule: string | null) => void;
  // The task's current deadline (ISO) - used to default the weekday / day-of-month
  // when switching to weekly/monthly, and to gate the picker (recurrence needs one).
  deadline?: string;
  disabled?: boolean;
}

type Mode = "none" | "daily" | "weekly" | "monthly";

// RFC 5545 weekday codes in week order, with single-letter button labels.
const WEEKDAYS: { code: string; short: string }[] = [
  { code: "SU", short: "S" },
  { code: "MO", short: "M" },
  { code: "TU", short: "T" },
  { code: "WE", short: "W" },
  { code: "TH", short: "T" },
  { code: "FR", short: "F" },
  { code: "SA", short: "S" },
];
const DOW_CODE = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

// Parse an incoming rule into the picker's sub-state. Unknown/empty -> "none".
function parseRule(rule: string | null): {
  mode: Mode;
  interval: number;
  weekdays: string[];
  monthDay: number;
} {
  const fallback = { mode: "none" as Mode, interval: 1, weekdays: [] as string[], monthDay: 1 };
  if (!rule) return fallback;
  const parts = new Map<string, string>();
  for (const seg of rule.split(";")) {
    const [k, v] = seg.split("=");
    if (k && v) parts.set(k.trim().toUpperCase(), v.trim().toUpperCase());
  }
  const freq = parts.get("FREQ");
  if (freq === "DAILY") {
    return { ...fallback, mode: "daily", interval: Number(parts.get("INTERVAL") ?? "1") || 1 };
  }
  if (freq === "WEEKLY") {
    const weekdays = (parts.get("BYDAY") ?? "").split(",").map((d) => d.trim()).filter((d) => DOW_CODE.includes(d));
    return { ...fallback, mode: "weekly", weekdays };
  }
  if (freq === "MONTHLY") {
    return { ...fallback, mode: "monthly", monthDay: Number(parts.get("BYMONTHDAY")) || 1 };
  }
  return fallback;
}

export default function RecurrencePicker({ value, onChange, deadline, disabled }: Props) {
  const initial = parseRule(value);
  const [mode, setMode] = useState<Mode>(initial.mode);
  const [interval, setInterval] = useState(initial.interval);
  const [weekdays, setWeekdays] = useState<string[]>(initial.weekdays);
  const [monthDay, setMonthDay] = useState(initial.monthDay);

  const hasDeadline = !!deadline;

  // Rebuild the RRULE from the given sub-state and notify the parent. Emits null
  // when the selection is "none" or not yet a valid rule (e.g. weekly with no day).
  function emit(next: { mode: Mode; interval: number; weekdays: string[]; monthDay: number }) {
    let rule: string | null = null;
    if (next.mode === "daily") {
      rule = next.interval > 1 ? `FREQ=DAILY;INTERVAL=${next.interval}` : "FREQ=DAILY";
    } else if (next.mode === "weekly" && next.weekdays.length > 0) {
      const ordered = DOW_CODE.filter((c) => next.weekdays.includes(c));
      rule = `FREQ=WEEKLY;BYDAY=${ordered.join(",")}`;
    } else if (next.mode === "monthly" && next.monthDay >= 1 && next.monthDay <= 31) {
      rule = `FREQ=MONTHLY;BYMONTHDAY=${next.monthDay}`;
    }
    onChange(rule);
  }

  // The deadline's weekday / day-of-month, to seed sensible defaults when switching modes.
  function deadlineWeekday(): string {
    if (!deadline) return "MO";
    return DOW_CODE[new Date(deadline).getDay()] ?? "MO";
  }
  function deadlineMonthDay(): number {
    if (!deadline) return 1;
    return new Date(deadline).getDate() || 1;
  }

  function handleModeChange(nextMode: Mode) {
    // Seed defaults from the deadline so a fresh weekly/monthly rule aligns with it.
    const seededWeekdays = nextMode === "weekly" && weekdays.length === 0 ? [deadlineWeekday()] : weekdays;
    const seededMonthDay = nextMode === "monthly" ? deadlineMonthDay() : monthDay;
    setMode(nextMode);
    setWeekdays(seededWeekdays);
    setMonthDay(seededMonthDay);
    emit({ mode: nextMode, interval, weekdays: seededWeekdays, monthDay: seededMonthDay });
  }

  function toggleWeekday(code: string) {
    const next = weekdays.includes(code) ? weekdays.filter((c) => c !== code) : [...weekdays, code];
    setWeekdays(next);
    emit({ mode, interval, weekdays: next, monthDay });
  }

  const controlsDisabled = disabled || !hasDeadline;

  return (
    <div>
      <label htmlFor="task-recurrence" className="block text-sm font-medium text-zinc-700 mb-1">
        Repeat (optional)
      </label>
      <select
        id="task-recurrence"
        value={mode}
        onChange={(e) => handleModeChange(e.target.value as Mode)}
        disabled={controlsDisabled}
        className="w-full px-3 py-2 border border-zinc-200 rounded-md text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-shadow duration-150 cursor-pointer bg-white disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <option value="none">Does not repeat</option>
        <option value="daily">Daily</option>
        <option value="weekly">Weekly</option>
        <option value="monthly">Monthly</option>
      </select>

      {/* Hint when recurrence can't be set yet (no anchor date). */}
      {!hasDeadline && (
        <p className="mt-1 text-xs text-zinc-500">Set a deadline to make this task repeat.</p>
      )}

      {/* Daily: an interval ("every N days"). */}
      {hasDeadline && mode === "daily" && (
        <div className="mt-2 flex items-center gap-2 text-sm text-zinc-700">
          <span>Every</span>
          <input
            type="number"
            min={1}
            max={365}
            value={interval}
            onChange={(e) => {
              const n = Math.max(1, parseInt(e.target.value, 10) || 1);
              setInterval(n);
              emit({ mode, interval: n, weekdays, monthDay });
            }}
            disabled={disabled}
            aria-label="Repeat every N days"
            className="w-16 px-2 py-1 border border-zinc-200 rounded-md text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
          />
          <span>{interval > 1 ? "days" : "day"}</span>
        </div>
      )}

      {/* Weekly: weekday toggle chips. */}
      {hasDeadline && mode === "weekly" && (
        <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label="Repeat on weekdays">
          {WEEKDAYS.map((d, i) => {
            const active = weekdays.includes(d.code);
            return (
              <button
                key={d.code}
                type="button"
                onClick={() => toggleWeekday(d.code)}
                disabled={disabled}
                aria-pressed={active}
                aria-label={["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][i]}
                className={`w-9 h-9 rounded-full text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-600 transition-colors duration-150 cursor-pointer ${
                  active
                    ? "bg-zinc-900 text-white"
                    : "bg-white text-zinc-600 border border-zinc-200 hover:bg-zinc-50"
                }`}
              >
                {d.short}
              </button>
            );
          })}
        </div>
      )}

      {/* Monthly: day-of-month. */}
      {hasDeadline && mode === "monthly" && (
        <div className="mt-2 flex items-center gap-2 text-sm text-zinc-700">
          <span>On day</span>
          <input
            type="number"
            min={1}
            max={31}
            value={monthDay}
            onChange={(e) => {
              const n = Math.min(31, Math.max(1, parseInt(e.target.value, 10) || 1));
              setMonthDay(n);
              emit({ mode, interval, weekdays, monthDay: n });
            }}
            disabled={disabled}
            aria-label="Repeat on day of month"
            className="w-16 px-2 py-1 border border-zinc-200 rounded-md text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
          />
          <span>of the month</span>
        </div>
      )}
    </div>
  );
}
