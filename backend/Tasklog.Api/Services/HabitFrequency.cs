namespace Tasklog.Api.Services
{
    // Computes the stats for a "x times a week" frequency habit from its check-in dates.
    // A PURE helper (like RecurrenceRule / HabitStreak / ComputeDueStatus) - it takes "today"
    // as a parameter and never reads the clock, so it is trivially unit-testable. The
    // controller wires in DateTime.Now.Date.
    //
    // Period is the calendar week, Monday-Sunday (matches the app's "this week = through the
    // upcoming Sunday" convention). A week is classified by how many distinct days were
    // checked in versus the target:
    //   met     (green)  count >= target
    //   partial (yellow) 1 <= count < target  ("showed up" but under target)
    //   none    (grey)   count == 0
    // The STREAK ignores the target for its length: it is the run of consecutive weeks with
    // at least one check-in (bare-minimum showing-up keeps it alive); a "none" week breaks it.
    // green vs yellow is purely visual (#75).
    public static class HabitFrequency
    {
        // The Monday on/before `date` (start of its calendar week). DayOfWeek has Sunday=0,
        // so ((dow + 6) % 7) maps Monday->0 .. Sunday->6, the offset back to Monday.
        public static DateTime WeekStart(DateTime date)
        {
            var offset = ((int)date.DayOfWeek + 6) % 7;
            return date.Date.AddDays(-offset);
        }

        // Distinct check-in days falling in the week that starts at `weekStart`.
        private static int CountInWeek(HashSet<DateTime> days, DateTime weekStart)
        {
            var count = 0;
            for (var i = 0; i < 7; i++)
                if (days.Contains(weekStart.AddDays(i))) count++;
            return count;
        }

        // Distinct days checked in during the current calendar week (the "n" in "n/x this week").
        public static int ThisWeekCount(IReadOnlyCollection<DateTime> checkInDates, DateTime today)
        {
            var days = ToDaySet(checkInDates);
            return CountInWeek(days, WeekStart(today));
        }

        // Consecutive weeks (ending at the current week) with at least one check-in.
        // Grace: the current week is in-progress, so a current week with no check-in YET does
        // not break the run - it is skipped and the streak measured from completed weeks
        // (mirrors HabitStreak's "through yesterday" grace, one period up).
        public static int WeekStreak(IReadOnlyCollection<DateTime> checkInDates, DateTime today)
        {
            if (checkInDates.Count == 0) return 0;
            var days = ToDaySet(checkInDates);

            var cursor = WeekStart(today);
            var streak = 0;
            var isCurrentWeek = true;
            // Bounded by the data: once we walk past the oldest check-in every week is empty
            // and a completed empty week breaks the loop. The cap is a pathological backstop.
            for (var guard = 0; guard < 1040; guard++)
            {
                var count = CountInWeek(days, cursor);
                if (count >= 1)
                {
                    streak++;
                }
                else if (!isCurrentWeek)
                {
                    break; // a completed week with no check-in ends the streak
                }
                // else: current week, no check-in yet -> grace, keep going without counting

                isCurrentWeek = false;
                cursor = cursor.AddDays(-7);
            }
            return streak;
        }

        // The last `count` weeks (oldest first .. current week last), each classified
        // met/partial/none against `target`. Powers the coloured week cells on the habit card.
        public static List<WeekStatus> RecentWeeks(IReadOnlyCollection<DateTime> checkInDates, DateTime today, int target, int count)
        {
            var days = ToDaySet(checkInDates);
            var currentWeekStart = WeekStart(today);
            var weeks = new List<WeekStatus>(count);
            for (var i = count - 1; i >= 0; i--)
            {
                var ws = currentWeekStart.AddDays(-7 * i);
                var n = CountInWeek(days, ws);
                var status = n == 0 ? "none" : (n >= target ? "met" : "partial");
                weeks.Add(new WeekStatus(ws, n, status));
            }
            return weeks;
        }

        private static HashSet<DateTime> ToDaySet(IReadOnlyCollection<DateTime> checkInDates)
        {
            var days = new HashSet<DateTime>();
            foreach (var d in checkInDates) days.Add(d.Date);
            return days;
        }
    }

    // One week's frequency status for the habit card's coloured cells.
    // Status is "met" (green), "partial" (yellow), or "none" (grey).
    public record WeekStatus(DateTime WeekStart, int Count, string Status);
}
