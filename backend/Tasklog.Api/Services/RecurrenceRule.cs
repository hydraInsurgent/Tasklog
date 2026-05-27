namespace Tasklog.Api.Services
{
    // The frequencies the recurrence core supports. SECONDLY/MINUTELY/HOURLY/YEARLY
    // from RFC 5545 are intentionally unsupported (Tasklog has no use for them).
    public enum RecurrenceFreq { Daily, Weekly, Monthly }

    // A parsed, validated recurrence rule plus the logic to advance a deadline.
    //
    // This is a PURE helper, not a DI service - it mirrors the TaskModel.ComputeDueStatus
    // precedent (a static, clock-free, parameterized function that is trivially unit-testable).
    // NextDeadline takes the current deadline as its only input and never reads DateTime.Now,
    // which both matches Todoist's "advance from the scheduled date" semantics and sidesteps
    // the DateTime.Now/UtcNow inconsistency (#18).
    //
    // Storage is an RRULE-shaped string (RFC 5545), so the grammar can grow in later
    // versions (advanced parts in v2.15.0, natural-language entry in v2.16.0) without a
    // new migration. See docs/research/rrule-rfc5545-2026-05-27.md for the grammar and the
    // per-version subset. The core deliberately REJECTS grammar it cannot expand (returns
    // an error -> the controller turns that into a 400) rather than storing a rule that
    // would silently fail to advance.
    public sealed class RecurrenceRule
    {
        public RecurrenceFreq Freq { get; }
        // Repeat every N units of Freq. Default 1. For the core, only Daily honors >1
        // ("every N days"); Weekly/Monthly are validated to Interval==1.
        public int Interval { get; }
        // For Weekly: the weekday(s) the task recurs on (non-empty). Empty otherwise.
        public IReadOnlyList<DayOfWeek> Weekdays { get; }
        // For Monthly: the day of month 1..31. 0 otherwise.
        public int MonthDay { get; }

        private RecurrenceRule(RecurrenceFreq freq, int interval, IReadOnlyList<DayOfWeek> weekdays, int monthDay)
        {
            Freq = freq;
            Interval = interval;
            Weekdays = weekdays;
            MonthDay = monthDay;
        }

        // Map between RFC 5545 two-letter weekday codes and DayOfWeek.
        private static readonly Dictionary<string, DayOfWeek> CodeToDay = new()
        {
            ["SU"] = DayOfWeek.Sunday,
            ["MO"] = DayOfWeek.Monday,
            ["TU"] = DayOfWeek.Tuesday,
            ["WE"] = DayOfWeek.Wednesday,
            ["TH"] = DayOfWeek.Thursday,
            ["FR"] = DayOfWeek.Friday,
            ["SA"] = DayOfWeek.Saturday,
        };
        private static readonly Dictionary<DayOfWeek, string> DayToCode =
            CodeToDay.ToDictionary(kv => kv.Value, kv => kv.Key);

        // Parse and validate an RRULE-shaped string into a rule. Returns false with a
        // human-readable error (and a null rule) for anything the core does not support,
        // so the controller can surface a 400. Case-insensitive on keys/values.
        public static bool TryParse(string? raw, out RecurrenceRule? rule, out string? error)
        {
            rule = null;
            error = null;

            if (string.IsNullOrWhiteSpace(raw))
            {
                error = "Recurrence rule is empty.";
                return false;
            }

            // Collect the rule parts into a case-insensitive key->value map, rejecting
            // malformed "KEY=VALUE" segments and duplicate keys.
            var parts = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (var segment in raw.Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            {
                var eq = segment.IndexOf('=');
                if (eq <= 0 || eq == segment.Length - 1)
                {
                    error = $"Malformed recurrence part '{segment}'. Expected KEY=VALUE.";
                    return false;
                }
                var key = segment[..eq].Trim();
                var value = segment[(eq + 1)..].Trim();
                if (!parts.TryAdd(key, value))
                {
                    error = $"Duplicate recurrence part '{key}'.";
                    return false;
                }
            }

            // Reject parts the core cannot expand up front, with a hint at the version
            // that will support them, so a recurrence that "looked accepted" never fails
            // silently at spawn time.
            foreach (var key in parts.Keys)
            {
                var upper = key.ToUpperInvariant();
                if (upper is "FREQ" or "INTERVAL" or "BYDAY" or "BYMONTHDAY") continue;
                error = upper is "COUNT" or "UNTIL"
                    ? $"End conditions ({upper}) are not supported yet."
                    : $"Unsupported recurrence part '{key}'.";
                return false;
            }

            if (!parts.TryGetValue("FREQ", out var freqRaw))
            {
                error = "Recurrence rule must include FREQ.";
                return false;
            }

            // INTERVAL: optional, default 1, positive integer.
            var interval = 1;
            if (parts.TryGetValue("INTERVAL", out var intervalRaw))
            {
                if (!int.TryParse(intervalRaw, out interval) || interval < 1)
                {
                    error = "INTERVAL must be a positive integer.";
                    return false;
                }
            }

            switch (freqRaw.ToUpperInvariant())
            {
                case "DAILY":
                    // Every day / every N days. No BYDAY or BYMONTHDAY in the core.
                    if (parts.ContainsKey("BYDAY") || parts.ContainsKey("BYMONTHDAY"))
                    {
                        error = "FREQ=DAILY does not take BYDAY/BYMONTHDAY in the core. Use FREQ=WEEKLY for specific weekdays.";
                        return false;
                    }
                    rule = new RecurrenceRule(RecurrenceFreq.Daily, interval, Array.Empty<DayOfWeek>(), 0);
                    return true;

                case "WEEKLY":
                    if (interval != 1)
                    {
                        error = "Weekly INTERVAL other than 1 is not supported yet.";
                        return false;
                    }
                    if (!parts.TryGetValue("BYDAY", out var bydayRaw) || string.IsNullOrWhiteSpace(bydayRaw))
                    {
                        error = "FREQ=WEEKLY requires BYDAY (e.g. BYDAY=MO,WE,FR).";
                        return false;
                    }
                    if (!TryParseWeekdays(bydayRaw, out var weekdays, out error))
                        return false;
                    rule = new RecurrenceRule(RecurrenceFreq.Weekly, 1, weekdays!, 0);
                    return true;

                case "MONTHLY":
                    if (interval != 1)
                    {
                        error = "Monthly INTERVAL other than 1 is not supported yet.";
                        return false;
                    }
                    if (parts.ContainsKey("BYDAY"))
                    {
                        error = "Nth-weekday recurrence (e.g. BYDAY=3TH) is not supported yet.";
                        return false;
                    }
                    if (!parts.TryGetValue("BYMONTHDAY", out var monthDayRaw))
                    {
                        error = "FREQ=MONTHLY requires BYMONTHDAY (e.g. BYMONTHDAY=15).";
                        return false;
                    }
                    if (!int.TryParse(monthDayRaw, out var monthDay) || monthDay < 1 || monthDay > 31)
                    {
                        error = "BYMONTHDAY must be a day of month between 1 and 31.";
                        return false;
                    }
                    rule = new RecurrenceRule(RecurrenceFreq.Monthly, 1, Array.Empty<DayOfWeek>(), monthDay);
                    return true;

                default:
                    error = $"Unsupported FREQ '{freqRaw}'. Use DAILY, WEEKLY, or MONTHLY.";
                    return false;
            }
        }

        // Parse a BYDAY list (e.g. "MO,WE,FR") into distinct weekdays. Rejects nth-weekday
        // tokens (e.g. "3TH"), which are v2.15.0, and any unknown code.
        private static bool TryParseWeekdays(string raw, out IReadOnlyList<DayOfWeek>? weekdays, out string? error)
        {
            weekdays = null;
            error = null;
            var days = new List<DayOfWeek>();
            foreach (var token in raw.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            {
                var code = token.ToUpperInvariant();
                if (!CodeToDay.TryGetValue(code, out var day))
                {
                    error = CodeToDay.Keys.Any(c => code.EndsWith(c, StringComparison.Ordinal))
                        ? $"Nth-weekday recurrence ('{token}') is not supported yet."
                        : $"Unknown weekday code '{token}'.";
                    return false;
                }
                if (!days.Contains(day)) days.Add(day);
            }
            if (days.Count == 0)
            {
                error = "BYDAY must list at least one weekday.";
                return false;
            }
            // Canonical order (Sun..Sat) so the serialized form is deterministic.
            days.Sort();
            weekdays = days;
            return true;
        }

        // Serialize back to a canonical RRULE-shaped string. Storing the canonical form
        // (not the raw input) keeps the column consistent regardless of input casing/order.
        public string Serialize() => Freq switch
        {
            RecurrenceFreq.Daily => Interval == 1 ? "FREQ=DAILY" : $"FREQ=DAILY;INTERVAL={Interval}",
            RecurrenceFreq.Weekly => $"FREQ=WEEKLY;BYDAY={string.Join(",", Weekdays.Select(d => DayToCode[d]))}",
            RecurrenceFreq.Monthly => $"FREQ=MONTHLY;BYMONTHDAY={MonthDay}",
            _ => throw new InvalidOperationException($"Unhandled frequency {Freq}."),
        };

        // Compute the next deadline after `current`, advancing from the scheduled date
        // (not "now"). The original time-of-day is always preserved (v2.12.0 timed
        // deadlines): a "daily 15:00" repeat stays at 15:00.
        public DateTime NextDeadline(DateTime current)
        {
            var timeOfDay = current.TimeOfDay;
            switch (Freq)
            {
                case RecurrenceFreq.Daily:
                    // AddDays preserves the time component.
                    return current.AddDays(Interval);

                case RecurrenceFreq.Weekly:
                    // The next calendar day strictly after the current deadline whose
                    // weekday is in the set. With Interval==1, scanning the next 7 days
                    // always finds one. Reattach the original time-of-day.
                    for (var offset = 1; offset <= 7; offset++)
                    {
                        var candidate = current.Date.AddDays(offset);
                        if (Weekdays.Contains(candidate.DayOfWeek))
                            return candidate + timeOfDay;
                    }
                    // Unreachable for a non-empty weekday set, but keep the compiler happy.
                    return current.AddDays(7);

                case RecurrenceFreq.Monthly:
                    // One month on from the current deadline's month, landing on MonthDay.
                    // Days beyond the target month's length clamp to the last day
                    // (e.g. "the 31st" in February -> Feb 28/29).
                    var firstOfNextMonth = new DateTime(current.Year, current.Month, 1).AddMonths(1);
                    var daysInMonth = DateTime.DaysInMonth(firstOfNextMonth.Year, firstOfNextMonth.Month);
                    var day = Math.Min(MonthDay, daysInMonth);
                    return new DateTime(firstOfNextMonth.Year, firstOfNextMonth.Month, day) + timeOfDay;

                default:
                    throw new InvalidOperationException($"Unhandled frequency {Freq}.");
            }
        }
    }
}
