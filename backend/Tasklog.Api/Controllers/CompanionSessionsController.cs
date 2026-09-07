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
            try
            {
                await _context.SaveChangesAsync();
            }
            catch (DbUpdateException)
            {
                // Two first-messages-of-the-day racing (two devices / double-submit):
                // the loser hits the unique SessionDate index. Get-or-create means the
                // loser should WIN too - return the row the other request created
                // instead of a naked 500 (review R15).
                _context.Entry(session).State = EntityState.Detached;
                var winner = await _context.CompanionSessions
                    .FirstOrDefaultAsync(s => s.SessionDate == today);
                if (winner is not null) return Ok(Project(winner));
                throw; // not the unique-index case - surface it
            }
            return CreatedAtAction(nameof(Today), Project(session));
        }

        // Transcript sanity caps (review R8). Generous for a personal journal, tight
        // enough that a runaway client cannot balloon a row: ~1MB of JSON per day.
        private const int MaxMessageContentChars = 8000;
        private const int MaxMessagesPerDay = 2000;
        private const int MaxTranscriptChars = 1_000_000;

        // Validates one { role, content, at } transcript message. Returns an error
        // string, or null when valid.
        private static string? ValidateMessage(JsonElement m)
        {
            if (m.ValueKind != JsonValueKind.Object) return "each message must be an object.";
            if (!m.TryGetProperty("role", out var role) || role.ValueKind != JsonValueKind.String ||
                (role.GetString() != "user" && role.GetString() != "assistant"))
                return "each message needs role 'user' or 'assistant'.";
            if (!m.TryGetProperty("content", out var content) || content.ValueKind != JsonValueKind.String)
                return "each message needs a string content.";
            if (content.GetString()!.Length > MaxMessageContentChars)
                return $"a message exceeds {MaxMessageContentChars} characters.";
            if (!m.TryGetProperty("at", out var at) || at.ValueKind != JsonValueKind.String || at.GetString()!.Length > 40)
                return "each message needs a short 'at' timestamp string.";
            return null;
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
            if (messages.GetArrayLength() > MaxMessagesPerDay)
                return BadRequest(new { message = $"At most {MaxMessagesPerDay} messages per day." });
            foreach (var m in messages.EnumerateArray())
                if (ValidateMessage(m) is string error)
                    return BadRequest(new { message = error });
            var raw = messages.GetRawText();
            if (raw.Length > MaxTranscriptChars)
                return BadRequest(new { message = "Transcript too large." });

            session.MessagesJson = raw;

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

        // POST /api/companion/sessions/{id}/messages  { messages: [...], sdkSessionId? }
        // APPENDS the given messages to the stored transcript server-side (review R4).
        // The companion route sends only the NEW turn's lines instead of replacing the
        // whole array, so two concurrent turns (PC + phone in the same day-session)
        // interleave instead of last-write-wins erasing each other. Present-key
        // sdkSessionId, same as Save.
        [HttpPost("{id:int}/messages")]
        public async Task<IActionResult> Append(int id, [FromBody] JsonElement body)
        {
            var session = await _context.CompanionSessions.FindAsync(id);
            if (session is null)
                return NotFound(new { message = $"Companion session {id} not found." });

            if (!body.TryGetProperty("messages", out var messages) ||
                messages.ValueKind != JsonValueKind.Array)
                return BadRequest(new { message = "messages must be a JSON array." });
            foreach (var m in messages.EnumerateArray())
                if (ValidateMessage(m) is string error)
                    return BadRequest(new { message = error });

            var existing = JsonSerializer.Deserialize<List<JsonElement>>(session.MessagesJson) ?? new();
            if (existing.Count + messages.GetArrayLength() > MaxMessagesPerDay)
                return BadRequest(new { message = $"At most {MaxMessagesPerDay} messages per day." });
            foreach (var m in messages.EnumerateArray())
                existing.Add(m.Clone());

            var raw = JsonSerializer.Serialize(existing);
            if (raw.Length > MaxTranscriptChars)
                return BadRequest(new { message = "Transcript too large." });
            session.MessagesJson = raw;

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
