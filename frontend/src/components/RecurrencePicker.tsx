"use client";

import { useState } from "react";

// A recurrence picker that builds an RRULE-shaped string for the supported grammar:
//   none / daily(+interval) / weekly(+interval, weekdays) /
//   monthly(+interval; day-of-month | nth-weekday | last-day)
// plus an optional end condition (never | on a date -> UNTIL | after N times -> COUNT).
// It is controlled (value + onChange) but owns its sub-state after mount - the parent
// passes the initial rule and receives the rebuilt rule (or null for "none"). Recurrence
// needs a deadline to anchor from, so when there is none the controls are disabled with a
// hint, matching the backend's validation. The produced string uses the same canonical
// part order as the backend Serialize (FREQ;INTERVAL;BYxxx;UNTIL|COUNT) so editing an
// unchanged rule does not look "changed".

interface Props {
  value: string | null;
  onChange: (rule: string | null) => void;
  deadline?: string; // ISO; seeds weekday / day-of-month defaults and gates the picker
  disabled?: boolean;
  // When true, the picker is a habit's schedule: it needs no deadline anchor (a habit's
  // recurrence is only ever read as a day-pattern and never spawns), so the controls are
  // enabled even with no deadline (#75).
  isHabit?: boolean;
}

type Mode = "none" | "daily" | "weekly" | "monthly";
type MonthlyKind = "day" | "nthWeekday" | "lastDay";
type EndKind = "never" | "onDate" | "afterN";

interface Cfg {
  mode: Mode;
  interval: number;
  weekdays: string[];
  monthlyKind: MonthlyKind;
  monthDay: number;
  nthOrdinal: number; // 1..4, or -1 (last)
  nthWeekday: string; // RFC code
  endKind: EndKind;
  endDate: string; // YYYY-MM-DD
  endCount: number;
}

const WEEKDAYS: { code: string; short: string; full: string }[] = [
  { code: "SU", short: "S", full: "Sunday" },
  { code: "MO", short: "M", full: "Monday" },
  { code: "TU", short: "T", full: "Tuesday" },
  { code: "WE", short: "W", full: "Wednesday" },
  { code: "TH", short: "T", full: "Thursday" },
  { code: "FR", short: "F", full: "Friday" },
  { code: "SA", short: "S", full: "Saturday" },
];
const DOW_CODE = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const ORDINALS = [
  { value: 1, label: "1st" },
  { value: 2, label: "2nd" },
  { value: 3, label: "3rd" },
  { value: 4, label: "4th" },
  { value: -1, label: "Last" },
];

const SELECT_CLASS =
  "w-full px-3 py-2 border border-border rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-shadow duration-150 cursor-pointer bg-surface disabled:opacity-50 disabled:cursor-not-allowed";
const NUM_CLASS =
  "w-16 px-2 py-1 border border-border rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent";

function defaults(deadline?: string): Cfg {
  const d = deadline ? new Date(deadline) : null;
  const dow = d && !isNaN(d.getTime()) ? DOW_CODE[d.getDay()] : "MO";
  const dom = d && !isNaN(d.getTime()) ? d.getDate() : 1;
  const nth = Math.min(4, Math.ceil(dom / 7)); // which occurrence of its weekday the date is
  return {
    mode: "none", interval: 1, weekdays: [], monthlyKind: "day",
    monthDay: dom, nthOrdinal: nth, nthWeekday: dow,
    endKind: "never", endDate: "", endCount: 5,
  };
}

// Read an existing rule into the config (for editing). Unknown -> "none".
function parseRule(value: string | null, deadline?: string): Cfg {
  const cfg = defaults(deadline);
  if (!value) return cfg;
  const parts = new Map<string, string>();
  for (const seg of value.split(";")) {
    const [k, v] = seg.split("=");
    if (k && v) parts.set(k.trim().toUpperCase(), v.trim().toUpperCase());
  }
  const freq = parts.get("FREQ");
  cfg.interval = Number(parts.get("INTERVAL") ?? "1") || 1;

  if (freq === "DAILY") cfg.mode = "daily";
  else if (freq === "WEEKLY") {
    cfg.mode = "weekly";
    cfg.weekdays = (parts.get("BYDAY") ?? "").split(",").map((s) => s.trim()).filter((c) => DOW_CODE.includes(c));
  } else if (freq === "MONTHLY") {
    cfg.mode = "monthly";
    const byday = parts.get("BYDAY");
    const bymonthday = parts.get("BYMONTHDAY");
    if (byday) {
      cfg.monthlyKind = "nthWeekday";
      cfg.nthWeekday = byday.slice(-2);
      cfg.nthOrdinal = Number(byday.slice(0, -2)) || 1;
    } else if (bymonthday !== undefined) {
      const n = Number(bymonthday);
      // The picker models "from the end" as last-day only; finer negatives (API-only)
      // collapse to last-day in the UI but remain correct in describeRecurrence.
      if (n < 0) cfg.monthlyKind = "lastDay";
      else { cfg.monthlyKind = "day"; cfg.monthDay = n; }
    }
  }

  const until = parts.get("UNTIL");
  const count = parts.get("COUNT");
  if (until) {
    cfg.endKind = "onDate";
    cfg.endDate = /^\d{8}$/.test(until) ? `${until.slice(0, 4)}-${until.slice(4, 6)}-${until.slice(6, 8)}` : until;
  } else if (count) {
    cfg.endKind = "afterN";
    cfg.endCount = Number(count) || 1;
  }
  return cfg;
}

// Build the canonical RRULE string from the config, or null for "none" / incomplete.
function buildRule(c: Cfg): string | null {
  if (c.mode === "none") return null;
  const iv = c.interval > 1 ? `;INTERVAL=${c.interval}` : "";
  let rule: string;
  if (c.mode === "daily") {
    rule = `FREQ=DAILY${iv}`;
  } else if (c.mode === "weekly") {
    if (c.weekdays.length === 0) return null;
    const ordered = DOW_CODE.filter((code) => c.weekdays.includes(code));
    rule = `FREQ=WEEKLY${iv};BYDAY=${ordered.join(",")}`;
  } else {
    if (c.monthlyKind === "nthWeekday") rule = `FREQ=MONTHLY${iv};BYDAY=${c.nthOrdinal}${c.nthWeekday}`;
    else if (c.monthlyKind === "lastDay") rule = `FREQ=MONTHLY${iv};BYMONTHDAY=-1`;
    else rule = `FREQ=MONTHLY${iv};BYMONTHDAY=${c.monthDay}`;
  }
  if (c.endKind === "onDate" && c.endDate) rule += `;UNTIL=${c.endDate.replace(/-/g, "")}`;
  else if (c.endKind === "afterN" && c.endCount >= 1) rule += `;COUNT=${c.endCount}`;
  return rule;
}

export default function RecurrencePicker({ value, onChange, deadline, disabled, isHabit }: Props) {
  const [cfg, setCfg] = useState<Cfg>(() => parseRule(value, deadline));
  // A habit needs no deadline to schedule; an ordinary recurring task does (the deadline is
  // the anchor it advances from). `scheduleEnabled` gates the controls accordingly.
  const hasDeadline = !!deadline;
  const scheduleEnabled = hasDeadline || !!isHabit;
  const controlsDisabled = disabled || !scheduleEnabled;

  // Merge a patch into the config and emit the rebuilt rule.
  function update(patch: Partial<Cfg>) {
    setCfg((prev) => {
      const next = { ...prev, ...patch };
      onChange(buildRule(next));
      return next;
    });
  }

  function handleModeChange(mode: Mode) {
    // Seed weekly weekdays / monthly defaults from the deadline when switching in fresh.
    const seed = defaults(deadline);
    const patch: Partial<Cfg> = { mode };
    if (mode === "weekly" && cfg.weekdays.length === 0) patch.weekdays = [seed.nthWeekday];
    update(patch);
  }

  function toggleWeekday(code: string) {
    const weekdays = cfg.weekdays.includes(code) ? cfg.weekdays.filter((c) => c !== code) : [...cfg.weekdays, code];
    update({ weekdays });
  }

  return (
    <div>
      <label htmlFor="task-recurrence" className="block text-sm font-medium text-text-primary mb-1">
        Repeat (optional)
      </label>
      <select
        id="task-recurrence"
        value={cfg.mode}
        onChange={(e) => handleModeChange(e.target.value as Mode)}
        disabled={controlsDisabled}
        className={SELECT_CLASS}
      >
        <option value="none">Does not repeat</option>
        <option value="daily">Daily</option>
        <option value="weekly">Weekly</option>
        <option value="monthly">Monthly</option>
      </select>

      {!scheduleEnabled && (
        <p className="mt-1 text-xs text-text-muted">Set a deadline to make this task repeat.</p>
      )}

      {/* Daily: interval. */}
      {scheduleEnabled && cfg.mode === "daily" && (
        <div className="mt-2 flex items-center gap-2 text-sm text-text-primary">
          <span>Every</span>
          <input
            type="number" min={1} max={365} value={cfg.interval} disabled={disabled}
            onChange={(e) => update({ interval: Math.max(1, parseInt(e.target.value, 10) || 1) })}
            aria-label="Repeat every N days" className={NUM_CLASS}
          />
          <span>{cfg.interval > 1 ? "days" : "day"}</span>
        </div>
      )}

      {/* Weekly: interval + weekday chips. */}
      {scheduleEnabled && cfg.mode === "weekly" && (
        <div className="mt-2 space-y-2">
          <div className="flex items-center gap-2 text-sm text-text-primary">
            <span>Every</span>
            <input
              type="number" min={1} max={52} value={cfg.interval} disabled={disabled}
              onChange={(e) => update({ interval: Math.max(1, parseInt(e.target.value, 10) || 1) })}
              aria-label="Repeat every N weeks" className={NUM_CLASS}
            />
            <span>{cfg.interval > 1 ? "weeks" : "week"}</span>
          </div>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Repeat on weekdays">
            {WEEKDAYS.map((d) => {
              const active = cfg.weekdays.includes(d.code);
              return (
                <button
                  key={d.code} type="button" onClick={() => toggleWeekday(d.code)} disabled={disabled}
                  aria-pressed={active} aria-label={d.full}
                  className={`w-9 h-9 rounded-full text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent transition-colors duration-150 cursor-pointer ${
                    active ? "bg-primary text-white" : "bg-surface text-text-muted border border-border hover:bg-surface-raised"
                  }`}
                >
                  {d.short}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Monthly: interval + day-of-month | nth-weekday | last-day. */}
      {scheduleEnabled && cfg.mode === "monthly" && (
        <div className="mt-2 space-y-2">
          <div className="flex items-center gap-2 text-sm text-text-primary">
            <span>Every</span>
            <input
              type="number" min={1} max={24} value={cfg.interval} disabled={disabled}
              onChange={(e) => update({ interval: Math.max(1, parseInt(e.target.value, 10) || 1) })}
              aria-label="Repeat every N months" className={NUM_CLASS}
            />
            <span>{cfg.interval > 1 ? "months" : "month"}</span>
          </div>
          <select
            aria-label="Monthly recurrence type" value={cfg.monthlyKind} disabled={disabled}
            onChange={(e) => update({ monthlyKind: e.target.value as MonthlyKind })}
            className={SELECT_CLASS}
          >
            <option value="day">On a day of the month</option>
            <option value="nthWeekday">On the Nth weekday</option>
            <option value="lastDay">On the last day</option>
          </select>
          {cfg.monthlyKind === "day" && (
            <div className="flex items-center gap-2 text-sm text-text-primary">
              <span>Day</span>
              <input
                type="number" min={1} max={31} value={cfg.monthDay} disabled={disabled}
                onChange={(e) => update({ monthDay: Math.min(31, Math.max(1, parseInt(e.target.value, 10) || 1)) })}
                aria-label="Day of month" className={NUM_CLASS}
              />
            </div>
          )}
          {cfg.monthlyKind === "nthWeekday" && (
            <div className="flex gap-2">
              <select
                aria-label="Which occurrence" value={cfg.nthOrdinal} disabled={disabled}
                onChange={(e) => update({ nthOrdinal: parseInt(e.target.value, 10) })}
                className={SELECT_CLASS}
              >
                {ORDINALS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <select
                aria-label="Weekday" value={cfg.nthWeekday} disabled={disabled}
                onChange={(e) => update({ nthWeekday: e.target.value })}
                className={SELECT_CLASS}
              >
                {WEEKDAYS.map((d) => <option key={d.code} value={d.code}>{d.full}</option>)}
              </select>
            </div>
          )}
        </div>
      )}

      {/* Ends (shared across daily/weekly/monthly). */}
      {scheduleEnabled && cfg.mode !== "none" && (
        <div className="mt-2 space-y-2">
          <select
            aria-label="Ends" value={cfg.endKind} disabled={disabled}
            onChange={(e) => update({ endKind: e.target.value as EndKind })}
            className={SELECT_CLASS}
          >
            <option value="never">Ends: never</option>
            <option value="onDate">Ends: on a date</option>
            <option value="afterN">Ends: after N times</option>
          </select>
          {cfg.endKind === "onDate" && (
            <input
              type="date" aria-label="Ends on" value={cfg.endDate} disabled={disabled}
              onChange={(e) => update({ endDate: e.target.value })}
              className={SELECT_CLASS}
            />
          )}
          {cfg.endKind === "afterN" && (
            <div className="flex items-center gap-2 text-sm text-text-primary">
              <span>After</span>
              <input
                type="number" min={1} max={999} value={cfg.endCount} disabled={disabled}
                onChange={(e) => update({ endCount: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                aria-label="Number of occurrences" className={NUM_CLASS}
              />
              <span>times</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
