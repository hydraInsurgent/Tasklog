using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Tasklog.Api.Data;
using Tasklog.Api.Models;
using Tasklog.Api.Services;

namespace Tasklog.Api.Controllers
{
    // The Habits view's data source: every task flagged IsHabit, each with its recent
    // check-ins, computed current streak, and whether it's been done today. A dedicated
    // shape keeps check-in data off ordinary task responses (CheckIns is [JsonIgnore]).
    [ApiController]
    [Route("api/habits")]
    public class HabitsController : ControllerBase
    {
        private readonly TasklogDbContext _context;

        // How far back the view shows individual check-in days (enough for the 7-day dot
        // row now and a future heatmap without sending the whole history).
        private const int RecentDays = 90;

        // How many recent weeks of frequency status to return for the habit-card cell strip.
        private const int RecentWeeksCount = 8;

        public HabitsController(TasklogDbContext context)
        {
            _context = context;
        }

        // GET /api/habits
        [HttpGet]
        public async Task<IActionResult> GetAll()
        {
            var today = DateTime.Now.Date;
            var since = today.AddDays(-RecentDays);

            var habits = await _context.Tasks
                .Where(t => t.IsHabit)
                .Include(t => t.Labels)
                .Include(t => t.CheckIns.Where(c => c.CheckInDate >= since))
                .OrderByDescending(t => t.CreatedAt)
                .ToListAsync();

            var result = habits.Select(task =>
            {
                var dates = task.CheckIns.Select(c => c.CheckInDate.Date).ToList();

                // Frequency habits ("x times a week") are the special case handled first: a
                // different streak (consecutive weeks, not scheduled days) plus weekly-progress
                // fields. The fall-through is the default specific-days / daily habit, which
                // uses the schedule-aware day streak and leaves the frequency fields null.
                if (task.WeeklyTarget is int target)
                {
                    return new HabitResponse(
                        task,
                        HabitFrequency.WeekStreak(dates, today),
                        dates.Contains(today),
                        dates.OrderByDescending(d => d).ToList(),
                        target,
                        HabitFrequency.ThisWeekCount(dates, today),
                        HabitFrequency.RecentWeeks(dates, today, target, RecentWeeksCount));
                }

                return new HabitResponse(
                    task,
                    // Pass the habit's recurrence as its schedule so the streak counts only
                    // scheduled days (e.g. "every Tue & Thu"); null = daily. (#73 Habits v2)
                    HabitStreak.CurrentStreak(dates, today, task.Recurrence),
                    dates.Contains(today),
                    dates.OrderByDescending(d => d).ToList(),
                    null, null, null);
            }).ToList();

            return Ok(result);
        }
    }

    // The per-habit shape returned by GET /api/habits: the task plus its computed check-in
    // stats. CurrentStreak is unit-aware - DAYS for a specific-days/daily habit, WEEKS for a
    // frequency habit (WeeklyTarget != null signals the unit). The frequency fields
    // (WeeklyTarget / ThisWeekCount / RecentWeeks) are null for non-frequency habits (#75).
    public record HabitResponse(
        TaskModel Task,
        int CurrentStreak,
        bool DoneToday,
        List<DateTime> RecentCheckIns,
        int? WeeklyTarget,
        int? ThisWeekCount,
        List<WeekStatus>? RecentWeeks);
}
