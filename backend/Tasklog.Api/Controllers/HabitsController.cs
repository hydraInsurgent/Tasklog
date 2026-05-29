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
                return new HabitResponse(
                    task,
                    // Pass the habit's recurrence as its schedule so the streak counts only
                    // scheduled days (e.g. "every Tue & Thu"); null = daily. (#73 Habits v2)
                    HabitStreak.CurrentStreak(dates, today, task.Recurrence),
                    dates.Contains(today),
                    dates.OrderByDescending(d => d).ToList());
            }).ToList();

            return Ok(result);
        }
    }

    // The per-habit shape returned by GET /api/habits: the task plus its computed
    // check-in stats (streak, whether done today, and recent check-in days for the dot row).
    public record HabitResponse(TaskModel Task, int CurrentStreak, bool DoneToday, List<DateTime> RecentCheckIns);
}
