namespace Tasklog.Api.Services
{
    // Computes a habit's current streak from its check-in dates. A PURE helper (like
    // ComputeDueStatus / RecurrenceRule) - it takes "today" as a parameter and never reads
    // the clock, so it is trivially unit-testable. The controller wires in DateTime.Now.Date.
    public static class HabitStreak
    {
        // Current streak = the run of consecutive calendar days, ending at today, on which
        // the habit was checked in. Grace rule: if today has no check-in yet, the streak is
        // measured through yesterday (so a habit you haven't done *yet* today still shows the
        // run you're keeping). A gap (a missed day) ends the streak.
        //
        // Examples (today = the 10th):
        //   {10,9,8}        -> 3   (done today + the two before)
        //   {9,8}           -> 2   (not done today yet, but yesterday's run survives)
        //   {10,8}          -> 1   (today done, but the 9th was missed)
        //   {8}             -> 0   (last done two days ago - the run is broken)
        //   {}              -> 0
        public static int CurrentStreak(IReadOnlyCollection<DateTime> checkInDates, DateTime today)
        {
            if (checkInDates.Count == 0) return 0;

            // Work in date-only terms; a HashSet gives O(1) per-day lookups.
            var days = new HashSet<DateTime>();
            foreach (var d in checkInDates) days.Add(d.Date);

            var todayDate = today.Date;

            // Anchor: start counting from today if it's checked in, otherwise from yesterday
            // (the grace window). If neither today nor yesterday is checked in, the streak is 0.
            DateTime cursor;
            if (days.Contains(todayDate)) cursor = todayDate;
            else if (days.Contains(todayDate.AddDays(-1))) cursor = todayDate.AddDays(-1);
            else return 0;

            var streak = 0;
            while (days.Contains(cursor))
            {
                streak++;
                cursor = cursor.AddDays(-1);
            }
            return streak;
        }
    }
}
