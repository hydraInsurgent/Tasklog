using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Tasklog.Api.Data;
using Tasklog.Api.Models;

namespace Tasklog.Api.Controllers
{
    // Companion conversation sessions (#87) - one per calendar day (unique SessionDate).
    // The transcript is the raw SOURCE of the Living Profile: it saves on every turn,
    // before/independently of AI success, so the user's words are never lost even when
    // the model is unreachable (the degradability rule).
    [ApiController]
    [Route("api/companion/sessions")]
    public class CompanionSessionsController : ControllerBase
    {
        private readonly TasklogDbContext _context;

        public CompanionSessionsController(TasklogDbContext context)
        {
            _context = context;
        }

        // GET /api/companion/sessions/today - today's session, or 204 when none exists yet.
        // Reads never auto-create (the journal convention); the client POSTs on first send.
        [HttpGet("today")]
        public async Task<IActionResult> Today()
        {
            var today = DateTime.Today;
            var session = await _context.CompanionSessions
                .FirstOrDefaultAsync(s => s.SessionDate == today);
            return session is null ? NoContent() : Ok(Project(session));
        }

        // GET /api/companion/sessions?date=yyyy-MM-dd - that day's session (read-only
        // history view), or 204 when the day has no conversation. Default today.
        [HttpGet]
        public async Task<IActionResult> ByDate([FromQuery] DateTime? date)
        {
            var day = (date ?? DateTime.Today).Date;
            var session = await _context.CompanionSessions
                .FirstOrDefaultAsync(s => s.SessionDate == day);
            return session is null ? NoContent() : Ok(Project(session));
        }

        // GET /api/companion/sessions/dates?from=&to= - which days in the range have a
        // conversation (drives the history calendar's dots). Mirrors the journal's
        // entries/dates endpoint exactly, defaults to the current month window.
        [HttpGet("dates")]
        public async Task<IActionResult> SessionDates([FromQuery] DateTime? from, [FromQuery] DateTime? to)
        {
            var start = (from ?? new DateTime(DateTime.Today.Year, DateTime.Today.Month, 1)).Date;
            var end = (to ?? start.AddMonths(1)).Date;
            if ((end - start).TotalDays > 400)
                return BadRequest(new { message = "Date range must not exceed 400 days." });

            var dates = await _context.CompanionSessions
                .Where(s => s.SessionDate >= start && s.SessionDate < end)
                .Select(s => s.SessionDate)
                .Distinct()
                .OrderBy(d => d)
                .ToListAsync();
            return Ok(dates.Select(d => d.ToString("yyyy-MM-dd")).ToList());
        }

        // POST /api/companion/sessions - get-or-create TODAY's session. Idempotent by
        // design (unique SessionDate): calling it twice returns the same row, so the
        // client needs no "does today exist?" logic before its first message.
        [HttpPost]
        public async Task<IActionResult> Create()
        {
            var today = DateTime.Today;
            var existing = await _context.CompanionSessions
                .FirstOrDefaultAsync(s => s.SessionDate == today);
            if (existing is not null)
                return Ok(Project(existing));

            var session = new CompanionSession
            {
                SessionDate = today,
                CreatedAt = DateTime.Now,
                UpdatedAt = DateTime.Now,
            };
            _context.CompanionSessions.Add(session);
            await _context.SaveChangesAsync();
            return CreatedAtAction(nameof(Today), Project(session));
        }

        // PUT /api/companion/sessions/{id}  { messages: [...], sdkSessionId? }
        // Saves the full transcript (the client owns the message shape; we store it
        // verbatim) and, when present, the Agent SDK's session id used for resume.
        // Present-key: omitting sdkSessionId keeps the stored one.
        [HttpPut("{id:int}")]
        public async Task<IActionResult> Save(int id, [FromBody] JsonElement body)
        {
            var session = await _context.CompanionSessions.FindAsync(id);
            if (session is null)
                return NotFound(new { message = $"Companion session {id} not found." });

            if (!body.TryGetProperty("messages", out var messages) ||
                messages.ValueKind != JsonValueKind.Array)
                return BadRequest(new { message = "messages must be a JSON array." });

            session.MessagesJson = messages.GetRawText();

            if (body.TryGetProperty("sdkSessionId", out var sdkId))
            {
                if (sdkId.ValueKind != JsonValueKind.String || string.IsNullOrWhiteSpace(sdkId.GetString()))
                    return BadRequest(new { message = "sdkSessionId must be a non-empty string." });
                session.SdkSessionId = sdkId.GetString();
            }

            session.UpdatedAt = DateTime.Now;
            await _context.SaveChangesAsync();
            return Ok(Project(session));
        }

        // Transcript is stored as TEXT but returned as real JSON, so clients never
        // double-parse (the MoodCheckins WordsJson precedent).
        private static object Project(CompanionSession s) => new
        {
            s.Id,
            s.SessionDate,
            Messages = JsonSerializer.Deserialize<JsonElement>(s.MessagesJson),
            s.SdkSessionId,
            s.CreatedAt,
            s.UpdatedAt,
        };
    }
}
