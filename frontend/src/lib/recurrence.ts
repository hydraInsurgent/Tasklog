// Frontend mirror of the backend RecurrenceRule.OccursOn (#73 Habits v2, Option B):
// "is this date a scheduled day of the rule's pattern?" Used so a habit's dot row only
// shows its scheduled weekdays and its check-in is offered only on a due day. Ignores
// INTERVAL and UNTIL/COUNT (same simplification as the backend streak) - it answers the
// day-PATTERN question, not "which specific occurrence". No rule => daily (every day).

const WD_CODE = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

function ruleParts(rule: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const seg of rule.split(";")) {
    const [k, v] = seg.split("=");
    if (k && v) m.set(k.trim().toUpperCase(), v.trim().toUpperCase());
  }
  return m;
}

export function occursOn(rule: string | null | undefined, date: Date): boolean {
  if (!rule) return true; // no schedule = daily
  const p = ruleParts(rule);
  const freq = p.get("FREQ");

  if (freq === "DAILY") return true;

  if (freq === "WEEKLY") {
    const byday = (p.get("BYDAY") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    if (byday.length === 0) return true;
    return byday.includes(WD_CODE[date.getDay()]);
  }

  if (freq === "MONTHLY") {
    const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    const byday = p.get("BYDAY");
    const bymonthday = p.get("BYMONTHDAY");
    if (byday) {
      // nth-weekday, e.g. "3TH" (3rd Thu) or "-1FR" (last Fri).
      const code = byday.slice(-2);
      const ord = parseInt(byday.slice(0, -2), 10);
      const wd = WD_CODE.indexOf(code);
      if (wd < 0 || Number.isNaN(ord)) return true;
      let day: number;
      if (ord > 0) {
        const first = new Date(date.getFullYear(), date.getMonth(), 1).getDay();
        const firstMatch = 1 + ((wd - first + 7) % 7);
        day = firstMatch + 7 * (ord - 1);
        if (day > daysInMonth) day -= 7;
      } else {
        const lastDow = new Date(date.getFullYear(), date.getMonth(), daysInMonth).getDay();
        day = daysInMonth - ((lastDow - wd + 7) % 7);
      }
      return date.getDate() === day;
    }
    if (bymonthday) {
      let n = parseInt(bymonthday, 10);
      if (Number.isNaN(n)) return true;
      if (n < 0) n = daysInMonth + 1 + n; // -1 => last day
      return date.getDate() === n;
    }
    return true;
  }

  return true;
}

// The next scheduled date on or after `from` (cap the scan at a year). For the
// "not due today - next <day>" hint.
export function nextDueOnOrAfter(rule: string | null | undefined, from: Date): Date | null {
  for (let i = 0; i <= 366; i++) {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
    if (occursOn(rule, d)) return d;
  }
  return null;
}
