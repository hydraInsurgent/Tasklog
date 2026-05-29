namespace Tasklog.Api.Services
{
    // Computes a habit's current streak from its check-in dates. A PURE helper (like
    // ComputeDueStatus / RecurrenceRule) - it takes "today" as a parameter and never reads
    // the clock, so it is trivially unit-testable. The controller wires in DateTime.Now.Date.
    public static class HabitStreak
    {
        // Current streak = the run of consecutive SCHEDULED days, ending at the latest
        // scheduled day on/before today, on which the habit was checked in.
        //
        // `recurrence` is the habit's schedule (an RRULE-shaped string). When null/empty/
        // unparseable the habit is treated as DAILY (every day is scheduled), which reduces
        // exactly to "consecutive calendar days". When set (e.g. "every Tue & Thu"), only the
        // scheduled days count: a skipped NON-scheduled day never breaks the streak, while a
        // scheduled day with no check-in does.
        //
        // Grace rule: if today is a scheduled day with no check-in yet, the streak is measured
        // from the previous scheduled day (so a habit you haven't done *yet* today still shows
        // the run you're keeping).
        //
        // Examples, daily (today = the 10th): {10,9,8}->3; {9,8}->2; {10,8}->1; {8}->0; {}->0.
        // Example, "every Tue & Thu" (today = Thu 12th): check-ins {Thu 12, Tue 10} -> 2
        // (Wed/Mon are not scheduled, so skipping them doesn't matter).
        public static int CurrentStreak(IReadOnlyCollection<DateTime> checkInDates, DateTime today, string? recurrence = null)
        {
            if (checkInDates.Count == 0) return 0;

            // Work in date-only terms; a HashSet gives O(1) per-day lookups.
            var days = new HashSet<DateTime>();
            foreach (var d in checkInDates) days.Add(d.Date);

            var todayDate = today.Date;

            // Parse the schedule. No/invalid rule => every day is scheduled (daily habit).
            RecurrenceRule? rule = null;
            if (!string.IsNullOrWhiteSpace(recurrence))
                RecurrenceRule.TryParse(recurrence!, out rule, out _);
            bool Scheduled(DateTime d) => rule?.OccursOn(d) ?? true;

            // The previous scheduled day strictly before `from` (cap the scan at a year so a
            // pathological rule can't loop forever).
            DateTime? PrevScheduled(DateTime from)
            {
                for (var i = 1; i <= 366; i++)
                {
                    var d = from.AddDays(-i);
                    if (Scheduled(d)) return d;
                }
                return null;
            }

            // Anchor: the latest scheduled day on or before today.
            DateTime? anchor = null;
            for (var i = 0; i <= 366; i++)
            {
                var d = todayDate.AddDays(-i);
                if (Scheduled(d)) { anchor = d; break; }
            }
            if (anchor is null) return 0;

            var cursor = anchor.Value;
            // Grace: today scheduled but not done yet -> count from the previous scheduled day.
            if (cursor == todayDate && !days.Contains(cursor))
            {
                var prev = PrevScheduled(cursor);
                if (prev is null) return 0;
                cursor = prev.Value;
            }

            var streak = 0;
            while (days.Contains(cursor))
            {
                streak++;
                var prev = PrevScheduled(cursor);
                if (prev is null) break;
                cursor = prev.Value;
            }
            return streak;
        }
    }
}
