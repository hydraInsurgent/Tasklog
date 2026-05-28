using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Tasklog.Api.Data;
using Tasklog.Api.Models;

namespace Tasklog.Api.Controllers
{
    // Daily check-ins on a habit task. "Done today" is idempotent: one check-in per
    // (task, day), enforced by the unique index. Dates are date-only in the server's
    // local zone (TZ is set on the deployed service), matching how the streak is computed.
    [ApiController]
    [Route("api/tasks/{taskId:int}/checkins")]
    public class CheckInsController : ControllerBase
    {
        private readonly TasklogDbContext _context;

        public CheckInsController(TasklogDbContext context)
        {
            _context = context;
        }

        // GET /api/tasks/{taskId}/checkins - the task's check-in dates (newest first).
        [HttpGet]
        public async Task<IActionResult> GetForTask(int taskId)
        {
            if (!await _context.Tasks.AnyAsync(t => t.Id == taskId))
                return NotFound(new { message = $"Task {taskId} not found." });

            var checkIns = await _context.CheckIns
                .Where(c => c.TaskId == taskId)
                .OrderByDescending(c => c.CheckInDate)
                .ToListAsync();

            return Ok(checkIns);
        }

        // POST /api/tasks/{taskId}/checkins - mark the habit done for a day (default today).
        // Idempotent: if a check-in already exists for that day, return it (200) instead of
        // creating a duplicate; otherwise create it (201).
        [HttpPost]
        public async Task<IActionResult> Create(int taskId, [FromBody] CheckInRequest? request)
        {
            if (!await _context.Tasks.AnyAsync(t => t.Id == taskId))
                return NotFound(new { message = $"Task {taskId} not found." });

            // Default to today (local); a supplied date is reduced to its date component.
            var date = (request?.Date ?? DateTime.Now).Date;

            var existing = await _context.CheckIns
                .FirstOrDefaultAsync(c => c.TaskId == taskId && c.CheckInDate == date);
            if (existing is not null)
                return Ok(existing);

            var checkIn = new CheckIn { TaskId = taskId, CheckInDate = date, CreatedAt = DateTime.Now };
            _context.CheckIns.Add(checkIn);
            await _context.SaveChangesAsync();

            return CreatedAtAction(nameof(GetForTask), new { taskId }, checkIn);
        }

        // DELETE /api/tasks/{taskId}/checkins?date=yyyy-MM-dd - undo a check-in (default
        // today). 204 on success; 404 if there was no check-in for that day.
        [HttpDelete]
        public async Task<IActionResult> Delete(int taskId, [FromQuery] DateTime? date)
        {
            var day = (date ?? DateTime.Now).Date;

            var checkIn = await _context.CheckIns
                .FirstOrDefaultAsync(c => c.TaskId == taskId && c.CheckInDate == day);
            if (checkIn is null)
                return NotFound(new { message = $"No check-in for task {taskId} on {day:yyyy-MM-dd}." });

            _context.CheckIns.Remove(checkIn);
            await _context.SaveChangesAsync();

            return NoContent();
        }
    }

    // Optional body for a check-in. Date omitted = today.
    public record CheckInRequest(DateTime? Date);
}
