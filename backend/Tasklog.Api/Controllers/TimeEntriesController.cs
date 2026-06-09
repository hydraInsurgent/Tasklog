using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Tasklog.Api.Data;
using Tasklog.Api.Models;

namespace Tasklog.Api.Controllers
{
    // Time tracking (#77). A TimeEntry is one start->stop interval on a task; EndedAt null =
    // running. At most one entry is running app-wide (single timer) - starting a new one
    // auto-stops the current. Responses are projected to include the task title + project
    // color so the timeline is self-contained. Per-day totals / block geometry are computed
    // client-side (the timeline is the only consumer), so there is no aggregation here.
    [ApiController]
    [Route("api/time-entries")]
    public class TimeEntriesController : ControllerBase
    {
        private readonly TasklogDbContext _context;

        public TimeEntriesController(TasklogDbContext context)
        {
            _context = context;
        }

        // GET /api/time-entries?from=...&to=...
        // Entries that OVERLAP the [from, to) window (so an interval started before `from`
        // but still running/ending inside it is included - e.g. a timer left running
        // overnight shows on today). Defaults to today if the range is omitted.
        [HttpGet]
        public async Task<IActionResult> List([FromQuery] DateTime? from, [FromQuery] DateTime? to)
        {
            var start = from ?? DateTime.Today;
            var end = to ?? DateTime.Today.AddDays(1);
            var now = DateTime.Now;

            var entries = await _context.TimeEntries
                .Include(e => e.Task!).ThenInclude(t => t.Project)
                .Where(e => e.StartedAt < end && (e.EndedAt ?? now) >= start)
                .OrderBy(e => e.StartedAt)
                .ToListAsync();

            return Ok(entries.Select(Project).ToList());
        }

        // GET /api/time-entries/active - the running entry (EndedAt == null), or null.
        [HttpGet("active")]
        public async Task<IActionResult> Active()
        {
            var running = await _context.TimeEntries
                .Include(e => e.Task!).ThenInclude(t => t.Project)
                .FirstOrDefaultAsync(e => e.EndedAt == null);
            return Ok(running is null ? null : Project(running));
        }

        // POST /api/time-entries/start  { taskId }
        // Auto-stops any running entry, then opens a new one on the task. 404 if task missing.
        [HttpPost("start")]
        public async Task<IActionResult> Start([FromBody] StartRequest request)
        {
            var task = await _context.Tasks.FindAsync(request.TaskId);
            if (task is null)
                return NotFound(new { message = $"Task {request.TaskId} not found." });

            var now = DateTime.Now;
            await StopAllRunning(now);

            var entry = new TimeEntry { TaskId = task.Id, StartedAt = now, CreatedAt = now };
            _context.TimeEntries.Add(entry);
            await _context.SaveChangesAsync();

            return CreatedAtAction(nameof(Active), await ProjectByIdAsync(entry.Id));
        }

        // POST /api/time-entries/{id}/stop - close a running entry (idempotent: a
        // already-stopped entry is returned unchanged).
        [HttpPost("{id:int}/stop")]
        public async Task<IActionResult> Stop(int id)
        {
            var entry = await _context.TimeEntries.FindAsync(id);
            if (entry is null)
                return NotFound(new { message = $"Time entry {id} not found." });

            if (entry.EndedAt is null)
            {
                entry.EndedAt = DateTime.Now;
                await _context.SaveChangesAsync();
            }
            return Ok(await ProjectByIdAsync(id));
        }

        // POST /api/time-entries  { taskId, startedAt, endedAt }
        // Manual (retroactive) entry - a closed interval logged without the timer.
        [HttpPost]
        public async Task<IActionResult> AddManual([FromBody] ManualRequest request)
        {
            var task = await _context.Tasks.FindAsync(request.TaskId);
            if (task is null)
                return NotFound(new { message = $"Task {request.TaskId} not found." });
            if (request.EndedAt <= request.StartedAt)
                return BadRequest(new { message = "End time must be after the start time." });

            var entry = new TimeEntry
            {
                TaskId = task.Id,
                StartedAt = request.StartedAt,
                EndedAt = request.EndedAt,
                CreatedAt = DateTime.Now,
            };
            _context.TimeEntries.Add(entry);
            await _context.SaveChangesAsync();

            return CreatedAtAction(nameof(Active), await ProjectByIdAsync(entry.Id));
        }

        // PATCH /api/time-entries/{id}  { startedAt?, endedAt? }
        // Edit an entry's bounds. Present-key: omit = keep. Both timestamps must stay ordered
        // (end > start) when the entry is closed. We don't reopen a closed entry here (use the
        // timer for live tracking), so endedAt must be a datetime, not null.
        [HttpPatch("{id:int}")]
        public async Task<IActionResult> Update(int id, [FromBody] JsonElement body)
        {
            var entry = await _context.TimeEntries.FindAsync(id);
            if (entry is null)
                return NotFound(new { message = $"Time entry {id} not found." });
            if (body.ValueKind != JsonValueKind.Object)
                return BadRequest(new { message = "Request body must be a JSON object." });

            if (body.TryGetProperty("startedAt", out var startEl))
            {
                if (startEl.ValueKind != JsonValueKind.String || !startEl.TryGetDateTime(out var s))
                    return BadRequest(new { message = "startedAt must be an ISO 8601 date string." });
                entry.StartedAt = s;
            }
            if (body.TryGetProperty("endedAt", out var endEl))
            {
                if (endEl.ValueKind != JsonValueKind.String || !endEl.TryGetDateTime(out var e))
                    return BadRequest(new { message = "endedAt must be an ISO 8601 date string." });
                entry.EndedAt = e;
            }
            if (entry.EndedAt is DateTime ended && ended <= entry.StartedAt)
                return BadRequest(new { message = "End time must be after the start time." });

            await _context.SaveChangesAsync();
            return Ok(await ProjectByIdAsync(id));
        }

        // DELETE /api/time-entries/{id} - hard delete a logged interval.
        [HttpDelete("{id:int}")]
        public async Task<IActionResult> Delete(int id)
        {
            var entry = await _context.TimeEntries.FindAsync(id);
            if (entry is null)
                return NotFound(new { message = $"Time entry {id} not found." });

            _context.TimeEntries.Remove(entry);
            await _context.SaveChangesAsync();
            return NoContent();
        }

        // Stop every running entry (normally at most one) - the single-timer invariant.
        private async Task StopAllRunning(DateTime now)
        {
            var running = await _context.TimeEntries.Where(e => e.EndedAt == null).ToListAsync();
            foreach (var r in running) r.EndedAt = now;
        }

        private async Task<TimeEntryResponse> ProjectByIdAsync(int id)
        {
            var entry = await _context.TimeEntries
                .Include(e => e.Task!).ThenInclude(t => t.Project)
                .FirstAsync(e => e.Id == id);
            return Project(entry);
        }

        private static TimeEntryResponse Project(TimeEntry e) => new(
            e.Id,
            e.TaskId,
            e.Task?.Title ?? "",
            e.Task?.ProjectId,
            e.Task?.Project?.Color,
            e.StartedAt,
            e.EndedAt,
            e.DurationSeconds);
    }

    public record StartRequest(int TaskId);
    public record ManualRequest(int TaskId, DateTime StartedAt, DateTime EndedAt);

    // The timeline-facing shape: the interval plus the denormalized task title + project
    // color it needs to render a block without a second lookup.
    public record TimeEntryResponse(
        int Id,
        int TaskId,
        string TaskTitle,
        int? ProjectId,
        string? ProjectColor,
        DateTime StartedAt,
        DateTime? EndedAt,
        int DurationSeconds);
}
