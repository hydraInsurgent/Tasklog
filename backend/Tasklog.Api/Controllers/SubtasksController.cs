using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Tasklog.Api.Data;
using Tasklog.Api.Models;

namespace Tasklog.Api.Controllers
{
    // Subtasks are a sub-resource of a task: /api/tasks/{taskId}/subtasks.
    // Kept in its own controller (like CommentsController) so TasksController stays focused.
    // The full ordered list is also returned inline on GET /api/tasks/{id} (see GetById).
    [ApiController]
    [Route("api/tasks/{taskId:int}/subtasks")]
    public class SubtasksController : ControllerBase
    {
        private const int MaxTitleLength = 500;
        private readonly TasklogDbContext _context;

        public SubtasksController(TasklogDbContext context)
        {
            _context = context;
        }

        // GET /api/tasks/{taskId}/subtasks
        // Lists the task's subtasks in manual order (Position asc). 404 if task missing.
        [HttpGet]
        public async Task<IActionResult> GetForTask(int taskId)
        {
            if (!await _context.Tasks.AnyAsync(t => t.Id == taskId))
                return NotFound(new { message = $"Task {taskId} not found." });

            var subtasks = await _context.Subtasks
                .Where(s => s.TaskId == taskId)
                .OrderBy(s => s.Position)
                .ToListAsync();

            return Ok(subtasks);
        }

        // POST /api/tasks/{taskId}/subtasks
        // Adds a subtask. Body: { title, deadline? }. Title required, trimmed, <= 500 chars.
        // Position is assigned as (current max + 1) so new items land at the bottom. 404 if
        // the task does not exist.
        [HttpPost]
        public async Task<IActionResult> Create(int taskId, [FromBody] CreateSubtaskRequest request)
        {
            if (!await _context.Tasks.AnyAsync(t => t.Id == taskId))
                return NotFound(new { message = $"Task {taskId} not found." });

            var (title, error) = NormalizeTitle(request.Title);
            if (error is not null)
                return BadRequest(new { message = error });

            // Next position = one past the current max for this task (0 when it's the first).
            var maxPosition = await _context.Subtasks
                .Where(s => s.TaskId == taskId)
                .Select(s => (int?)s.Position)
                .MaxAsync() ?? -1;

            var subtask = new Subtask
            {
                TaskId = taskId,
                Title = title!,
                Deadline = request.Deadline,
                Position = maxPosition + 1,
                CreatedAt = DateTime.Now,
            };
            _context.Subtasks.Add(subtask);
            await _context.SaveChangesAsync();

            return CreatedAtAction(nameof(GetForTask), new { taskId }, subtask);
        }

        // PATCH /api/tasks/{taskId}/subtasks/{id}
        // Partial update using present-key detection (same JsonElement pattern as
        // TasksController.Update): title (non-empty string), deadline (ISO string or null),
        // isCompleted (bool). Absent = unchanged. 404 if the subtask is not under this task.
        [HttpPatch("{id:int}")]
        public async Task<IActionResult> Update(int taskId, int id, [FromBody] JsonElement body)
        {
            var subtask = await _context.Subtasks
                .FirstOrDefaultAsync(s => s.Id == id && s.TaskId == taskId);

            if (subtask is null)
                return NotFound(new { message = $"Subtask {id} not found on task {taskId}." });

            if (body.ValueKind != JsonValueKind.Object)
                return BadRequest(new { message = "Request body must be a JSON object." });

            if (body.TryGetProperty("title", out var titleEl))
            {
                if (titleEl.ValueKind != JsonValueKind.String)
                    return BadRequest(new { message = "Title must be a string." });
                var (title, error) = NormalizeTitle(titleEl.GetString());
                if (error is not null) return BadRequest(new { message = error });
                subtask.Title = title!;
            }

            // deadline: present + null clears; present + ISO string sets; else 400. Absent keeps.
            if (body.TryGetProperty("deadline", out var deadlineEl))
            {
                if (deadlineEl.ValueKind == JsonValueKind.Null)
                {
                    subtask.Deadline = null;
                }
                else if (deadlineEl.ValueKind == JsonValueKind.String && deadlineEl.TryGetDateTime(out var dl))
                {
                    subtask.Deadline = dl;
                }
                else
                {
                    return BadRequest(new { message = "Deadline must be an ISO 8601 date string or null." });
                }
            }

            if (body.TryGetProperty("isCompleted", out var completedEl))
            {
                if (completedEl.ValueKind != JsonValueKind.True && completedEl.ValueKind != JsonValueKind.False)
                    return BadRequest(new { message = "isCompleted must be a boolean." });
                subtask.IsCompleted = completedEl.GetBoolean();
            }

            await _context.SaveChangesAsync();

            return Ok(subtask);
        }

        // DELETE /api/tasks/{taskId}/subtasks/{id}
        // Removes a subtask that belongs to this task. 404 if not found under it.
        [HttpDelete("{id:int}")]
        public async Task<IActionResult> Delete(int taskId, int id)
        {
            var subtask = await _context.Subtasks
                .FirstOrDefaultAsync(s => s.Id == id && s.TaskId == taskId);

            if (subtask is null)
                return NotFound(new { message = $"Subtask {id} not found on task {taskId}." });

            _context.Subtasks.Remove(subtask);
            await _context.SaveChangesAsync();

            return NoContent();
        }

        // POST /api/tasks/{taskId}/subtasks/reorder
        // Rewrites Position from an ordered array of subtask ids. The ids must be exactly the
        // task's current subtask ids (same set, any order) so we never half-apply an order.
        // Returns the reordered list. 404 if the task is missing.
        [HttpPost("reorder")]
        public async Task<IActionResult> Reorder(int taskId, [FromBody] ReorderSubtasksRequest request)
        {
            if (!await _context.Tasks.AnyAsync(t => t.Id == taskId))
                return NotFound(new { message = $"Task {taskId} not found." });

            var subtasks = await _context.Subtasks
                .Where(s => s.TaskId == taskId)
                .ToListAsync();

            var orderedIds = request.OrderedIds ?? Array.Empty<int>();
            var currentIds = subtasks.Select(s => s.Id).ToHashSet();

            // The supplied order must be a permutation of exactly this task's subtasks.
            if (orderedIds.Length != subtasks.Count || !orderedIds.ToHashSet().SetEquals(currentIds))
                return BadRequest(new { message = "orderedIds must contain exactly this task's subtask ids." });

            var byId = subtasks.ToDictionary(s => s.Id);
            for (var i = 0; i < orderedIds.Length; i++)
                byId[orderedIds[i]].Position = i;

            await _context.SaveChangesAsync();

            return Ok(subtasks.OrderBy(s => s.Position).ToList());
        }

        // Normalise a subtask title: require non-blank, trim, cap length. Returns an error
        // string (caller -> 400) when blank or too long.
        private static (string? value, string? error) NormalizeTitle(string? raw)
        {
            if (string.IsNullOrWhiteSpace(raw))
                return (null, "Subtask title is required.");
            var trimmed = raw.Trim();
            if (trimmed.Length > MaxTitleLength)
                return (null, $"Subtask title must be {MaxTitleLength} characters or fewer.");
            return (trimmed, null);
        }

        // Request body for creating a subtask. Deadline is optional.
        public record CreateSubtaskRequest(string Title, DateTime? Deadline = null);

        // Request body for reordering: the full set of this task's subtask ids, in the
        // desired order.
        public record ReorderSubtasksRequest(int[] OrderedIds);
    }
}
