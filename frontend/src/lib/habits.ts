import { Habit, WeekStatus } from "./api";

// Produce the optimistically-updated habit after toggling today's check-in, BEFORE the
// server confirms. Shared by the /habits page (HabitsClient) and the right-side Habits
// panel (ProjectLayout) so both flash the same consistent state. The next poll/refetch
// reconciles the exact schedule-aware values.
//
// Two habit kinds need different handling (#76):
//  - frequency ("x times a week"): the streak is in WEEKS. thisWeekCount and the current
//    week's cell move on every check-in, but the streak only shifts when this week crosses
//    the 0<->1 "showed up at all" threshold (matches HabitFrequency.WeekStreak).
//  - day-pattern / daily: the streak is in DAYS and shifts by +/-1 per check-in (the
//    original behaviour); the frequency fields stay null.
export function applyOptimisticCheckIn(habit: Habit, markingDone: boolean, todayKey: string): Habit {
  const recentCheckIns = markingDone
    ? [todayKey, ...habit.recentCheckIns]
    : habit.recentCheckIns.filter((d) => d.slice(0, 10) !== todayKey);

  if (habit.task.weeklyTarget != null) {
    const target = habit.task.weeklyTarget;
    const prevWeek = habit.thisWeekCount ?? 0;
    const thisWeekCount = Math.max(0, prevWeek + (markingDone ? 1 : -1));

    // The week streak only moves when this week crosses the "at least one check-in" line.
    let currentStreak = habit.currentStreak;
    if (markingDone && prevWeek === 0) currentStreak += 1;
    else if (!markingDone && thisWeekCount === 0) currentStreak = Math.max(0, currentStreak - 1);

    const status: WeekStatus["status"] =
      thisWeekCount === 0 ? "none" : thisWeekCount >= target ? "met" : "partial";

    // The current week is the last entry (RecentWeeks is oldest-first). Recolour just it.
    const weeks = habit.recentWeeks;
    const recentWeeks = weeks
      ? weeks.map((w, i) => (i === weeks.length - 1 ? { ...w, count: thisWeekCount, status } : w))
      : weeks;

    return { ...habit, doneToday: markingDone, recentCheckIns, thisWeekCount, currentStreak, recentWeeks };
  }

  return {
    ...habit,
    doneToday: markingDone,
    currentStreak: Math.max(0, habit.currentStreak + (markingDone ? 1 : -1)),
    recentCheckIns,
  };
}
