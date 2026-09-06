using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Tasklog.Api.Data;
using Tasklog.Api.Models;

namespace Tasklog.Api.Controllers
{
    // The Capture inbox API (#87) - the trust loop over staged proposals. The companion
    // (and later MCP / claude.ai) POSTs proposed captures here; the user confirms or
    // dismisses each one. Confirm MATERIALIZES the typed home - for type "task" that is
    // a real row in Tasks - and records what was created (ConfirmedType/ConfirmedId), so
    // re-confirming is idempotent and the audit trail stays inspectable.
    [ApiController]
    [Route("api/captures")]
    public class CapturesController : ControllerBase
    {
        // The type registry, v4.0 edition: which capture types this API accepts and can
        // materialize. Grows per minor (v4.1 "mood" -> MoodCheckins, v4.2 "mention"...);
        // adding a type is a writer method + an entry here, never a migration.
        private static readonly HashSet<string> RegisteredTypes = new() { "task" };

        private readonly TasklogDbContext _context;
        private readonly Services.EmbeddingService? _embeddings;

        // EmbeddingService optional, mirroring TasksController: a task materialized by
        // confirm gets its vector refreshed too; tests construct without it.
        public CapturesController(TasklogDbContext context, Services.EmbeddingService? embeddings = null)
        {
            _context = context;
            _embeddings = embeddings;
        }

        // GET /api/captures?sessionId=&status= - filtered list, oldest first (cards render
        // in the order they were proposed).
        [HttpGet]
        public async Task<IActionResult> List([FromQuery] int? sessionId, [FromQuery] string? status)
        {
            var query = _context.Captures.AsQueryable();
            if (sessionId is not null) query = query.Where(c => c.SessionId == sessionId);
            if (!string.IsNullOrWhiteSpace(status)) query = query.Where(c => c.Status == status);
            var captures = await query.OrderBy(c => c.Id).ToListAsync();
            return Ok(captures.Select(Project).ToList());
        }

        // POST /api/captures  { type, payload: {...}, sessionId?, span?, confidence?, source? }
        // Creates a PROPOSED capture. Structurally validated only (a task payload must have
        // a title); a bad project guess is not rejected here - confirm validates strictly.
        // Idempotent per conversation: proposing the same type+title into the same session
        // again returns the existing row instead of duplicating the card (covers the model
        // re-proposing across turns, including items the user already dismissed).
        [HttpPost]
        public async Task<IActionResult> Create([FromBody] CaptureRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.Type) || !RegisteredTypes.Contains(request.Type))
                return BadRequest(new { message = $"type must be one of: {string.Join(", ", RegisteredTypes)}." });
            if (request.Payload.ValueKind != JsonValueKind.Object)
                return BadRequest(new { message = "payload must be a JSON object." });
            if (request.Confidence is < 0 or > 1)
                return BadRequest(new { message = "confidence must be between 0 and 1." });

            var title = GetTaskTitle(request.Payload);
            if (request.Type == "task" && title is null)
                return BadRequest(new { message = "a task payload requires a non-empty title." });

            if (request.SessionId is not null)
            {
                var sessionExists = await _context.CompanionSessions
                    .AnyAsync(s => s.Id == request.SessionId);
                if (!sessionExists)
                    return BadRequest(new { message = $"Companion session {request.SessionId} not found." });

                // Dedupe within the conversation by normalized title (task type). Any
                // status counts: a dismissed "Call the plumber" must stay dismissed.
                if (title is not null)
                {
                    var normalized = title.Trim().ToLowerInvariant();
                    var existing = (await _context.Captures
                            .Where(c => c.SessionId == request.SessionId && c.Type == request.Type)
                            .ToListAsync())
                        .FirstOrDefault(c => GetTaskTitle(JsonSerializer.Deserialize<JsonElement>(c.PayloadJson))
                            ?.Trim().ToLowerInvariant() == normalized);
                    if (existing is not null)
                        return Ok(Project(existing));
                }
            }

            var capture = new Capture
            {
                Type = request.Type,
                Status = "proposed",
                Source = string.IsNullOrWhiteSpace(request.Source) ? "companion" : request.Source!,
                SessionId = request.SessionId,
                PayloadJson = request.Payload.GetRawText(),
                Span = string.IsNullOrWhiteSpace(request.Span) ? null : request.Span,
                Confidence = request.Confidence,
                CreatedAt = DateTime.Now,
                UpdatedAt = DateTime.Now,
            };
            _context.Captures.Add(capture);
            await _context.SaveChangesAsync();
            return CreatedAtAction(nameof(List), Project(capture));
        }

        // PATCH /api/captures/{id}  { payload: {...} } - edit a proposal before confirming
        // (the card's quick-edit). Only proposed captures are editable; resolved ones are
        // an audit record.
        [HttpPatch("{id:int}")]
        public async Task<IActionResult> Update(int id, [FromBody] JsonElement body)
        {
            var capture = await _context.Captures.FindAsync(id);
            if (capture is null)
                return NotFound(new { message = $"Capture {id} not found." });
            if (capture.Status != "proposed")
                return BadRequest(new { message = $"Capture {id} is {capture.Status}; only proposed captures can be edited." });

            if (!body.TryGetProperty("payload", out var payload) || payload.ValueKind != JsonValueKind.Object)
                return BadRequest(new { message = "payload must be a JSON object." });
            if (capture.Type == "task" && GetTaskTitle(payload) is null)
                return BadRequest(new { message = "a task payload requires a non-empty title." });

            capture.PayloadJson = payload.GetRawText();
            capture.UpdatedAt = DateTime.Now;
            await _context.SaveChangesAsync();
            return Ok(Project(capture));
        }

        // POST /api/captures/{id}/confirm - the KEEP of the trust loop. Materializes the
        // typed home for the capture's type and records the outcome. Idempotent: confirming
        // an already-confirmed capture returns it unchanged (no duplicate task).
        [HttpPost("{id:int}/confirm")]
        public async Task<IActionResult> Confirm(int id)
        {
            var capture = await _context.Captures.FindAsync(id);
            if (capture is null)
                return NotFound(new { message = $"Capture {id} not found." });
            if (capture.Status == "confirmed")
                return Ok(Project(capture));
            if (capture.Status == "dismissed")
                return BadRequest(new { message = $"Capture {id} was dismissed; it cannot be confirmed." });

            // v4.0 writer: "task". Later minors add writers here (mood -> MoodCheckins...).
            var payload = JsonSerializer.Deserialize<JsonElement>(capture.PayloadJson);
            var title = GetTaskTitle(payload);
            if (title is null)
                return BadRequest(new { message = "a task payload requires a non-empty title." });

            int? projectId = null;
            if (payload.TryGetProperty("projectId", out var pid) && pid.ValueKind == JsonValueKind.Number)
            {
                projectId = pid.GetInt32();
                var projectExists = await _context.Projects.AnyAsync(p => p.Id == projectId);
                if (!projectExists)
                    return BadRequest(new { message = $"Project {projectId} not found. Edit the capture first." });
            }

            // newProjectName (#87): the user asked for a NEW project for this task, so one
            // confirm materializes BOTH. Get-or-create by name (case-insensitive) - if the
            // project came to exist between propose and confirm, reuse it, never duplicate.
            // An explicit existing projectId wins over newProjectName.
            if (projectId is null &&
                payload.TryGetProperty("newProjectName", out var npn) &&
                npn.ValueKind == JsonValueKind.String &&
                !string.IsNullOrWhiteSpace(npn.GetString()))
            {
                var name = npn.GetString()!.Trim();
                var project = (await _context.Projects.ToListAsync())
                    .FirstOrDefault(p => string.Equals(p.Name, name, StringComparison.OrdinalIgnoreCase));
                if (project is null)
                {
                    var maxPosition = await _context.Projects.AnyAsync()
                        ? await _context.Projects.MaxAsync(p => p.Position)
                        : 0;
                    project = new Project { Name = name, Position = maxPosition + 1, CreatedAt = DateTime.Now };
                    _context.Projects.Add(project);
                    await _context.SaveChangesAsync(); // project gets its id here
                }
                projectId = project.Id;
            }

            DateTime? deadline = null;
            if (payload.TryGetProperty("deadline", out var dl) && dl.ValueKind == JsonValueKind.String)
            {
                if (!DateTime.TryParse(dl.GetString(), out var parsed))
                    return BadRequest(new { message = "deadline is not a valid date. Edit the capture first." });
                deadline = parsed;
            }

            var task = new TaskModel
            {
                Title = title,
                ProjectId = projectId,
                Deadline = deadline,
                CreatedAt = DateTime.Now,
            };
            _context.Tasks.Add(task);

            capture.Status = "confirmed";
            capture.ConfirmedType = "task";
            capture.UpdatedAt = DateTime.Now;
            await _context.SaveChangesAsync(); // task gets its id here

            capture.ConfirmedId = task.Id;
            await _context.SaveChangesAsync();

            // The new task enters the semantic index like any other write (#87).
            if (_embeddings is not null)
                await _embeddings.UpsertAsync("task", task.Id, task.Title);

            return Ok(new { capture = Project(capture), task });
        }

        // POST /api/captures/{id}/restore - undo an accidental TOSS: dismissed -> proposed.
        // User-initiated only (the companion has no restore tool - the dismissed-stays-
        // dismissed guard exists to stop the MODEL re-surfacing things; it must not be a
        // wall against the human who mis-tapped). Idempotent for already-proposed.
        [HttpPost("{id:int}/restore")]
        public async Task<IActionResult> Restore(int id)
        {
            var capture = await _context.Captures.FindAsync(id);
            if (capture is null)
                return NotFound(new { message = $"Capture {id} not found." });
            if (capture.Status == "proposed")
                return Ok(Project(capture));
            if (capture.Status == "confirmed")
                return BadRequest(new { message = $"Capture {id} is confirmed; there is nothing to restore." });

            capture.Status = "proposed";
            capture.UpdatedAt = DateTime.Now;
            await _context.SaveChangesAsync();
            return Ok(Project(capture));
        }

        // POST /api/captures/{id}/dismiss - the TOSS. Costs nothing, stays as a record so
        // the same proposal is not re-surfaced (see the dedupe in Create). Idempotent.
        [HttpPost("{id:int}/dismiss")]
        public async Task<IActionResult> Dismiss(int id)
        {
            var capture = await _context.Captures.FindAsync(id);
            if (capture is null)
                return NotFound(new { message = $"Capture {id} not found." });
            if (capture.Status == "dismissed")
                return Ok(Project(capture));
            if (capture.Status == "confirmed")
                return BadRequest(new { message = $"Capture {id} is already confirmed; it cannot be dismissed." });

            capture.Status = "dismissed";
            capture.UpdatedAt = DateTime.Now;
            await _context.SaveChangesAsync();
            return Ok(Project(capture));
        }

        // Extracts a usable title from a task payload; null when missing/blank.
        private static string? GetTaskTitle(JsonElement payload)
        {
            if (payload.ValueKind != JsonValueKind.Object) return null;
            if (!payload.TryGetProperty("title", out var t) || t.ValueKind != JsonValueKind.String) return null;
            var title = t.GetString()?.Trim();
            return string.IsNullOrEmpty(title) ? null : title;
        }

        // PayloadJson is TEXT in the DB but real JSON on the wire (MoodCheckins precedent).
        private static object Project(Capture c) => new
        {
            c.Id,
            c.Type,
            c.Status,
            c.Source,
            c.SessionId,
            Payload = JsonSerializer.Deserialize<JsonElement>(c.PayloadJson),
            c.Span,
            c.Confidence,
            c.ConfirmedType,
            c.ConfirmedId,
            c.CreatedAt,
            c.UpdatedAt,
        };
    }

    public record CaptureRequest(
        string? Type,
        JsonElement Payload,
        int? SessionId,
        string? Span,
        double? Confidence,
        string? Source);
}
