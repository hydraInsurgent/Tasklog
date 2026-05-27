// Natural-language quick-add parser (Todoist-style). Turns a free-text title like
//   "Send email to Mark friday #Work @urgent p1 every week"
// into structured fields + the recognized token spans (for inline highlighting).
//
// Pure + deterministic (inject refDate in tests). Frontend-only: it resolves against
// the project/label lists the add form already loads and feeds the existing create
// flow. chrono-node handles free-form one-off dates; recurrence and the #/@/pN tokens
// are hand-rolled. The recurrence half is the inverse of describeRecurrence in
// format.ts and emits the same canonical RRULE the backend (RecurrenceRule) accepts.
//
// See docs/research/todoist-quick-add-2026-05-27.md for the Todoist syntax mirrored.

import * as chrono from "chrono-node";

export interface QuickAddProject {
  id: number;
  name: string;
}

export type QuickAddTokenType = "date" | "recurrence" | "project" | "label" | "priority";

export interface QuickAddToken {
  type: QuickAddTokenType;
  text: string; // the matched substring, including any symbol
  start: number;
  end: number; // exclusive
}

export interface QuickAddResult {
  cleanedTitle: string;
  deadline?: string; // "YYYY-MM-DD" (date-only) or "YYYY-MM-DDTHH:mm" (timed)
  recurrence?: string; // RRULE-shaped
  projectName?: string; // only set when it matches a known project
  labelNames?: string[];
  priority?: number; // 1-4
  tokens: QuickAddToken[];
}

// First two letters of any weekday spelling uniquely identify it.
const WEEKDAY_CODE: Record<string, string> = {
  su: "SU", mo: "MO", tu: "TU", we: "WE", th: "TH", fr: "FR", sa: "SA",
};
const DOW_ORDER = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
// A regex fragment matching any weekday word (full or common abbreviation).
const WD = "(?:sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?)";
const WD_LIST = `${WD}(?:\\s*(?:,|and|,\\s*and)\\s*|\\s+)${WD}|${WD}`;

const ORDINAL_WORD: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, last: -1,
};

// --- date helpers ---

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// Local "YYYY-MM-DD", matching the <input type="date"> value the form already uses.
function toDateString(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Local "YYYY-MM-DDTHH:mm" for a timed deadline.
function toDateTimeString(d: Date): string {
  return `${toDateString(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Compact RRULE UNTIL form "YYYYMMDD".
function toUntil(d: Date): string {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

// Parse a run of weekday words into canonical-ordered RFC codes.
function parseWeekdayList(s: string): string[] {
  const codes: string[] = [];
  for (const m of s.toLowerCase().matchAll(new RegExp(WD, "gi"))) {
    const code = WEEKDAY_CODE[m[0].slice(0, 2)];
    if (code && !codes.includes(code)) codes.push(code);
  }
  return DOW_ORDER.filter((c) => codes.includes(c));
}

// --- recurrence ---

interface RecurrenceMatch {
  rule: string;
  start: number;
  end: number;
}

// Each base matcher: a regex (case-insensitive, with index) and a builder that turns
// the match into the RRULE body (FREQ + INTERVAL + BY...). Ordered most-specific first
// so e.g. "every 3rd thursday" matches the nth-weekday rule before the day-of-month one.
function matchBaseRecurrence(text: string, ref: Date): RecurrenceMatch | null {
  const dow = DOW_ORDER[ref.getDay()];
  const dom = ref.getDate();

  const matchers: { re: RegExp; build: (m: RegExpMatchArray) => string | null }[] = [
    // every N days
    { re: /\bevery\s+(\d+)\s+days?\b/i, build: (m) => `FREQ=DAILY;INTERVAL=${m[1]}` },
    // daily / every day / everyday
    { re: /\b(?:every\s*day|everyday|daily)\b/i, build: () => "FREQ=DAILY" },
    // every weekday(s)
    { re: /\bevery\s+weekdays?\b/i, build: () => "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR" },
    // every other <weekday-list>  (interval 2)
    { re: new RegExp(`\\bevery\\s+other\\s+(${WD_LIST})\\b`, "i"), build: (m) => {
        const days = parseWeekdayList(m[1]);
        return days.length ? `FREQ=WEEKLY;INTERVAL=2;BYDAY=${days.join(",")}` : null;
      } },
    // every N weeks  (anchor weekday from the reference date)
    { re: /\bevery\s+(\d+)\s+weeks?\b/i, build: (m) => `FREQ=WEEKLY;INTERVAL=${m[1]};BYDAY=${dow}` },
    // every <weekday-list>
    { re: new RegExp(`\\bevery\\s+(${WD_LIST})\\b`, "i"), build: (m) => {
        const days = parseWeekdayList(m[1]);
        return days.length ? `FREQ=WEEKLY;BYDAY=${days.join(",")}` : null;
      } },
    // every week / weekly  (anchor weekday from the reference date)
    { re: /\b(?:every\s+week|weekly)\b/i, build: () => `FREQ=WEEKLY;BYDAY=${dow}` },
    // every N months
    { re: /\bevery\s+(\d+)\s+months?\b/i, build: (m) => `FREQ=MONTHLY;INTERVAL=${m[1]};BYMONTHDAY=${dom}` },
    // (every|on the|monthly on the) <ord> <weekday>   e.g. "every 3rd thursday", "the last friday"
    { re: new RegExp(`\\b(?:every|on the|monthly on the|the)\\s+(\\d+(?:st|nd|rd|th)|first|second|third|fourth|last)\\s+(${WD})\\b`, "i"),
      build: (m) => {
        const ord = ORDINAL_WORD[m[1].toLowerCase()] ?? parseInt(m[1], 10);
        if (!(ord === -1 || (ord >= 1 && ord <= 4))) return null;
        const code = WEEKDAY_CODE[m[2].slice(0, 2).toLowerCase()];
        return code ? `FREQ=MONTHLY;BYDAY=${ord}${code}` : null;
      } },
    // last day (of the month)
    { re: /\b(?:every|monthly on the|on the)\s+last\s+day(?:\s+of\s+(?:the\s+)?month)?\b/i, build: () => "FREQ=MONTHLY;BYMONTHDAY=-1" },
    // (every|on the|monthly on the) <N>th   e.g. "every 27th", "monthly on the 1st"
    { re: /\b(?:every|on the|monthly on the)\s+(\d+)(?:st|nd|rd|th)\b/i, build: (m) => {
        const day = parseInt(m[1], 10);
        return day >= 1 && day <= 31 ? `FREQ=MONTHLY;BYMONTHDAY=${day}` : null;
      } },
    // every month / monthly  (anchor day-of-month from the reference date)
    { re: /\b(?:every\s+month|monthly)\b/i, build: () => `FREQ=MONTHLY;BYMONTHDAY=${dom}` },
  ];

  for (const { re, build } of matchers) {
    const m = text.match(re);
    if (m && m.index !== undefined) {
      const rule = build(m);
      if (rule) return { rule, start: m.index, end: m.index + m[0].length };
    }
  }
  return null;
}

// Find a recurrence phrase + optional end condition. Returns the rule and the span to
// strip from the title. End conditions: "until <date>" -> UNTIL; "[for] N times" -> COUNT.
function matchRecurrence(text: string, ref: Date): RecurrenceMatch | null {
  const base = matchBaseRecurrence(text, ref);
  if (!base) return null;

  let { rule, start, end } = base;

  // "until <date>" (parse the date with chrono)
  const until = text.match(/\b(?:until|til|till)\s+(.+?)(?:[,.]|$)/i);
  if (until && until.index !== undefined) {
    const d = chrono.parseDate(until[1], ref);
    if (d) {
      rule += `;UNTIL=${toUntil(d)}`;
      start = Math.min(start, until.index);
      end = Math.max(end, until.index + until[0].length);
    }
  } else {
    // "[for] N times"
    const count = text.match(/\b(?:for\s+)?(\d+)\s+times\b/i);
    if (count && count.index !== undefined) {
      rule += `;COUNT=${count[1]}`;
      start = Math.min(start, count.index);
      end = Math.max(end, count.index + count[0].length);
    }
  }

  return { rule, start, end };
}

// Blank out a [start,end) span (preserving length/indices) so a later pass won't re-match it.
function mask(text: string, start: number, end: number): string {
  return text.slice(0, start) + " ".repeat(end - start) + text.slice(end);
}

// Remove a set of spans from the text and collapse whitespace.
function stripSpans(text: string, spans: { start: number; end: number }[]): string {
  let masked = text;
  for (const s of spans) masked = mask(masked, s.start, s.end);
  return masked.replace(/\s+/g, " ").trim();
}

// Parse a quick-add title into structured fields + recognized token spans.
// `projects` is used to recognize #project (unknown # is left in the title).
export function parseQuickAdd(
  text: string,
  projects: QuickAddProject[] = [],
  refDate: Date = new Date(),
): QuickAddResult {
  const tokens: QuickAddToken[] = [];
  // Work against a masked copy so each pass ignores already-claimed spans.
  let work = text;

  // 1. Recurrence first, so "every friday" isn't grabbed as a one-off date.
  const rec = matchRecurrence(work, refDate);
  let recurrence: string | undefined;
  if (rec) {
    recurrence = rec.rule;
    tokens.push({ type: "recurrence", text: text.slice(rec.start, rec.end), start: rec.start, end: rec.end });
    work = mask(work, rec.start, rec.end);
  }

  // 2. One-off date via chrono (on the recurrence-masked text).
  let deadline: string | undefined;
  const parsed = chrono.parse(work, refDate);
  if (parsed.length > 0) {
    const r = parsed[0];
    const d = r.start.date();
    // Explicit time -> timed deadline; otherwise date-only (backend midnight convention).
    deadline = r.start.isCertain("hour") ? toDateTimeString(d) : toDateString(d);
    tokens.push({ type: "date", text: text.slice(r.index, r.index + r.text.length), start: r.index, end: r.index + r.text.length });
    work = mask(work, r.index, r.index + r.text.length);
  }

  // 3. Priority pN (last one wins).
  let priority: number | undefined;
  for (const m of [...work.matchAll(/\bp([1-4])\b/gi)]) {
    if (m.index === undefined) continue;
    priority = parseInt(m[1], 10);
    tokens.push({ type: "priority", text: m[0], start: m.index, end: m.index + m[0].length });
  }
  if (priority !== undefined) {
    for (const t of tokens.filter((t) => t.type === "priority")) work = mask(work, t.start, t.end);
  }

  // 4. #project - only recognized when it matches a known project (case-insensitive);
  //    an unknown #foo is left in the title untouched.
  let projectName: string | undefined;
  for (const m of [...work.matchAll(/#([\w-]+)/g)]) {
    if (m.index === undefined) continue;
    const match = projects.find((p) => p.name.toLowerCase() === m[1].toLowerCase());
    if (!match) continue;
    projectName = match.name;
    tokens.push({ type: "project", text: m[0], start: m.index, end: m.index + m[0].length });
    work = mask(work, m.index, m.index + m[0].length);
    break; // one project
  }

  // 5. @label - all of them; labels auto-create downstream so every @x counts.
  const labelNames: string[] = [];
  for (const m of [...work.matchAll(/@([\w-]+)/g)]) {
    if (m.index === undefined) continue;
    labelNames.push(m[1]);
    tokens.push({ type: "label", text: m[0], start: m.index, end: m.index + m[0].length });
  }

  const cleanedTitle = stripSpans(text, tokens);

  return {
    cleanedTitle,
    deadline,
    recurrence,
    projectName,
    labelNames: labelNames.length ? labelNames : undefined,
    priority,
    tokens: tokens.sort((a, b) => a.start - b.start),
  };
}
