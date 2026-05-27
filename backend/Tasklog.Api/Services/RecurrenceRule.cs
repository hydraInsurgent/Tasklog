using System.Globalization;

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
    // Storage is an RRULE-shaped string (RFC 5545). See docs/research/rrule-rfc5545-2026-05-27.md
    // for the grammar and the per-version subset. v2.14.0 shipped the core (daily / every-N /
    // weekly-on-weekdays / monthly-on-day, repeating forever); v2.15.0 adds the advanced forms:
    // nth-weekday-of-month (BYDAY=3TH), day-from-month-end (BYMONTHDAY=-1), weekly/monthly
    // INTERVAL>1, and end conditions (UNTIL / COUNT). The parser still REJECTS grammar the
    // expander can't advance (returns an error -> the controller turns that into a 400) rather
    // than storing a rule that would silently fail.
    public sealed class RecurrenceRule
    {
        public RecurrenceFreq Freq { get; }
        // Repeat every N units of Freq. Default 1. Honored for daily, weekly, and monthly.
        public int Interval { get; }
        // For Weekly: the weekday(s) the task recurs on (non-empty). For Monthly nth-weekday:
        // exactly one weekday (paired with Ordinal). Empty for Monthly day-of-month.
        public IReadOnlyList<DayOfWeek> Weekdays { get; }
        // For Monthly day-of-month: 1..31, or negative from the end (-1 = last day .. -28).
        // 0 when the monthly rule is an nth-weekday instead.
        public int MonthDay { get; }
        // For Monthly nth-weekday: the ordinal (+1..+4, or -1 = last) applied to Weekdays[0],
        // e.g. "3rd Thursday" / "last Monday". Null for every other rule. (v2.15.0)
        public int? Ordinal { get; }
        // End conditions, mutually exclusive (RFC 5545). Null = repeats forever. (v2.15.0)
        public DateTime? Until { get; } // inclusive last date the series may land on
        public int? Count { get; }      // total number of occurrences in the series

        private RecurrenceRule(
            RecurrenceFreq freq, int interval, IReadOnlyList<DayOfWeek> weekdays,
            int monthDay, int? ordinal, DateTime? until, int? count)
        {
            Freq = freq;
            Interval = interval;
            Weekdays = weekdays;
            MonthDay = monthDay;
            Ordinal = ordinal;
            Until = until;
            Count = count;
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
        // human-readable error (and a null rule) for anything the supported subset does not
        // cover, so the controller can surface a 400. Case-insensitive on keys/values.
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

            // Reject parts the expander cannot handle up front, so a recurrence that "looked
            // accepted" never fails silently at spawn time. UNTIL/COUNT/INTERVAL are now known.
            foreach (var key in parts.Keys)
            {
                var upper = key.ToUpperInvariant();
                if (upper is "FREQ" or "INTERVAL" or "BYDAY" or "BYMONTHDAY" or "UNTIL" or "COUNT") continue;
                error = $"Unsupported recurrence part '{key}'.";
                return false;
            }

            if (!parts.TryGetValue("FREQ", out var freqRaw))
            {
                error = "Recurrence rule must include FREQ.";
                return false;
            }

            // INTERVAL: optional, default 1, positive integer (honored for all frequencies).
            var interval = 1;
            if (parts.TryGetValue("INTERVAL", out var intervalRaw))
            {
                if (!int.TryParse(intervalRaw, out interval) || interval < 1)
                {
                    error = "INTERVAL must be a positive integer.";
                    return false;
                }
            }

            // End conditions: UNTIL (a date) or COUNT (a positive int), mutually exclusive.
            if (parts.ContainsKey("UNTIL") && parts.ContainsKey("COUNT"))
            {
                error = "UNTIL and COUNT cannot both be set.";
                return false;
            }
            DateTime? until = null;
            if (parts.TryGetValue("UNTIL", out var untilRaw))
            {
                if (!TryParseUntil(untilRaw, out var u))
                {
                    error = "UNTIL must be a date (YYYYMMDD or ISO 8601).";
                    return false;
                }
                until = u;
            }
            int? count = null;
            if (parts.TryGetValue("COUNT", out var countRaw))
            {
                if (!int.TryParse(countRaw, out var c) || c < 1)
                {
                    error = "COUNT must be a positive integer.";
                    return false;
                }
                count = c;
            }

            switch (freqRaw.ToUpperInvariant())
            {
                case "DAILY":
                    // Every day / every N days. No BYDAY or BYMONTHDAY.
                    if (parts.ContainsKey("BYDAY") || parts.ContainsKey("BYMONTHDAY"))
                    {
                        error = "FREQ=DAILY does not take BYDAY/BYMONTHDAY. Use FREQ=WEEKLY for specific weekdays.";
                        return false;
                    }
                    rule = new RecurrenceRule(RecurrenceFreq.Daily, interval, Array.Empty<DayOfWeek>(), 0, null, until, count);
                    return true;

                case "WEEKLY":
                    if (!parts.TryGetValue("BYDAY", out var bydayRaw) || string.IsNullOrWhiteSpace(bydayRaw))
                    {
                        error = "FREQ=WEEKLY requires BYDAY (e.g. BYDAY=MO,WE,FR).";
                        return false;
                    }
                    if (!TryParsePlainWeekdays(bydayRaw, out var weekdays, out error))
                        return false;
                    rule = new RecurrenceRule(RecurrenceFreq.Weekly, interval, weekdays!, 0, null, until, count);
                    return true;

                case "MONTHLY":
                    var hasByDay = parts.TryGetValue("BYDAY", out var monthlyByDay) && !string.IsNullOrWhiteSpace(monthlyByDay);
                    var hasByMonthDay = parts.TryGetValue("BYMONTHDAY", out var monthDayRaw);
                    if (hasByDay == hasByMonthDay)
                    {
                        error = "FREQ=MONTHLY requires exactly one of BYMONTHDAY (e.g. 15, -1) or BYDAY (e.g. 3TH).";
                        return false;
                    }
                    if (hasByDay)
                    {
                        // Nth-weekday: a single ordinaled token like 3TH or -1MO.
                        if (!TryParseOrdinalWeekday(monthlyByDay!, out var ordinal, out var weekday, out error))
                            return false;
                        rule = new RecurrenceRule(RecurrenceFreq.Monthly, interval, new[] { weekday }, 0, ordinal, until, count);
                        return true;
                    }
                    // Day-of-month: 1..31, or -1..-28 from the end.
                    if (!int.TryParse(monthDayRaw, out var monthDay)
                        || monthDay == 0
                        || monthDay > 31
                        || monthDay < -28)
                    {
                        error = "BYMONTHDAY must be 1..31, or -1..-28 to count from the end of the month.";
                        return false;
                    }
                    rule = new RecurrenceRule(RecurrenceFreq.Monthly, interval, Array.Empty<DayOfWeek>(), monthDay, null, until, count);
                    return true;

                default:
                    error = $"Unsupported FREQ '{freqRaw}'. Use DAILY, WEEKLY, or MONTHLY.";
                    return false;
            }
        }

        // Parse a UNTIL value: RFC basic date "YYYYMMDD", or an ISO 8601 date(time).
        private static bool TryParseUntil(string raw, out DateTime value)
        {
            if (raw.Length == 8 && raw.All(char.IsDigit)
                && DateTime.TryParseExact(raw, "yyyyMMdd", CultureInfo.InvariantCulture, DateTimeStyles.None, out value))
                return true;
            return DateTime.TryParse(raw, CultureInfo.InvariantCulture, DateTimeStyles.None, out value);
        }

        // Parse a plain BYDAY list (WEEKLY) - distinct weekdays, NO ordinal prefixes.
        private static bool TryParsePlainWeekdays(string raw, out IReadOnlyList<DayOfWeek>? weekdays, out string? error)
        {
            weekdays = null;
            error = null;
            var days = new List<DayOfWeek>();
            foreach (var token in raw.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            {
                var code = token.ToUpperInvariant();
                if (!CodeToDay.TryGetValue(code, out var day))
                {
                    // A token with a leading ordinal (e.g. 3TH) is nth-weekday - only valid MONTHLY.
                    error = code.Length > 2 && CodeToDay.ContainsKey(code[^2..])
                        ? $"Nth-weekday ('{token}') is only valid with FREQ=MONTHLY."
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
            days.Sort();
            weekdays = days;
            return true;
        }

        // Parse a single ordinaled BYDAY token (MONTHLY nth-weekday), e.g. "3TH", "-1MO", "+2WE".
        // Exactly one token; ordinal in {+1..+4, -1}; the trailing two letters are the weekday.
        private static bool TryParseOrdinalWeekday(string raw, out int ordinal, out DayOfWeek weekday, out string? error)
        {
            ordinal = 0;
            weekday = default;
            error = null;

            var tokens = raw.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            if (tokens.Length != 1)
            {
                error = "Monthly BYDAY supports a single ordinaled weekday (e.g. 3TH), not a list.";
                return false;
            }
            var token = tokens[0].ToUpperInvariant();
            if (token.Length < 3 || !CodeToDay.TryGetValue(token[^2..], out weekday))
            {
                error = $"Monthly BYDAY must be an ordinal + weekday (e.g. 3TH, -1MO), got '{tokens[0]}'.";
                return false;
            }
            if (!int.TryParse(token[..^2], out ordinal) || !(ordinal is >= 1 and <= 4 || ordinal == -1))
            {
                error = "Monthly nth-weekday ordinal must be 1..4 (1st..4th) or -1 (last).";
                return false;
            }
            return true;
        }

        // Serialize back to a canonical RRULE-shaped string (FREQ;INTERVAL;BYxxx;UNTIL|COUNT).
        // Storing the canonical form keeps the column consistent regardless of input casing/order.
        public string Serialize()
        {
            var parts = new List<string> { $"FREQ={Freq.ToString().ToUpperInvariant()}" };
            if (Interval > 1) parts.Add($"INTERVAL={Interval}");
            switch (Freq)
            {
                case RecurrenceFreq.Weekly:
                    parts.Add($"BYDAY={string.Join(",", Weekdays.Select(d => DayToCode[d]))}");
                    break;
                case RecurrenceFreq.Monthly:
                    if (Ordinal is int ord)
                        parts.Add($"BYDAY={ord}{DayToCode[Weekdays[0]]}"); // e.g. 3TH or -1MO
                    else
                        parts.Add($"BYMONTHDAY={MonthDay}");
                    break;
            }
            if (Until is DateTime until) parts.Add($"UNTIL={until:yyyyMMdd}");
            if (Count is int count) parts.Add($"COUNT={count}");
            return string.Join(";", parts);
        }

        // Compute the next deadline after `current`, advancing from the scheduled date (not
        // "now"). The original time-of-day is always preserved (v2.12.0 timed deadlines).
        public DateTime NextDeadline(DateTime current)
        {
            var timeOfDay = current.TimeOfDay;
            switch (Freq)
            {
                case RecurrenceFreq.Daily:
                    return current.AddDays(Interval);

                case RecurrenceFreq.Weekly:
                {
                    // Week-anchored: a candidate weekday is valid only when its week is a
                    // whole multiple of Interval weeks from the current deadline's week
                    // (Sunday-start, matching ComputeDueStatus). At Interval=1 this is just
                    // "the next matching weekday".
                    var weekStart = current.Date.AddDays(-(int)current.Date.DayOfWeek);
                    for (var offset = 1; offset <= Interval * 7 + 7; offset++)
                    {
                        var candidate = current.Date.AddDays(offset);
                        if (!Weekdays.Contains(candidate.DayOfWeek)) continue;
                        var candidateWeekStart = candidate.AddDays(-(int)candidate.DayOfWeek);
                        var weekDiff = (candidateWeekStart - weekStart).Days / 7;
                        if (weekDiff % Interval == 0) return candidate + timeOfDay;
                    }
                    return current.AddDays(7 * Interval); // unreachable for a non-empty set
                }

                case RecurrenceFreq.Monthly:
                {
                    // Interval months on from the current deadline's month.
                    var firstOfTarget = new DateTime(current.Year, current.Month, 1).AddMonths(Interval);
                    var year = firstOfTarget.Year;
                    var month = firstOfTarget.Month;
                    var daysInMonth = DateTime.DaysInMonth(year, month);

                    int day;
                    if (Ordinal is int ord)
                    {
                        // Nth (or last) occurrence of Weekdays[0] in the target month.
                        var target = Weekdays[0];
                        if (ord > 0)
                        {
                            var first = new DateTime(year, month, 1);
                            var firstMatch = 1 + (((int)target - (int)first.DayOfWeek + 7) % 7);
                            day = firstMatch + 7 * (ord - 1);
                            if (day > daysInMonth) day -= 7; // clamp a non-existent occurrence to the last
                        }
                        else
                        {
                            // ord == -1: walk back from the last day to the matching weekday.
                            var last = new DateTime(year, month, daysInMonth);
                            day = daysInMonth - (((int)last.DayOfWeek - (int)target + 7) % 7);
                        }
                    }
                    else if (MonthDay < 0)
                    {
                        // Count from the end: -1 = last day, -2 = second-to-last, ...
                        day = daysInMonth + 1 + MonthDay;
                        if (day < 1) day = 1;
                    }
                    else
                    {
                        // Day-of-month, clamped to the target month's length.
                        day = Math.Min(MonthDay, daysInMonth);
                    }

                    return new DateTime(year, month, day) + timeOfDay;
                }

                default:
                    throw new InvalidOperationException($"Unhandled frequency {Freq}.");
            }
        }

        // Whether the series should spawn another occurrence given the just-computed next
        // deadline and how many occurrences the series already has. Respects the end
        // conditions: stop once UNTIL is passed, or once COUNT occurrences exist. With no
        // end condition the series repeats forever. (v2.15.0)
        public bool ShouldSpawn(DateTime next, int existingSeriesCount)
        {
            if (Until is DateTime until && next.Date > until.Date) return false;
            if (Count is int count && existingSeriesCount >= count) return false;
            return true;
        }
    }
}
