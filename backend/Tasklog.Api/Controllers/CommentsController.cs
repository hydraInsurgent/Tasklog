using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Tasklog.Api.Data;
using Tasklog.Api.Models;

namespace Tasklog.Api.Controllers
{
    // Comments are a sub-resource of a task: /api/tasks/{taskId}/comments.
    // Kept in its own controller so TasksController stays focused.
    [ApiController]
    [Route("api/tasks/{taskId:int}/comments")]
    public class CommentsController : ControllerBase
    {
        private const int MaxCommentLength = 2000;
        private readonly TasklogDbContext _context;

        public CommentsController(TasklogDbContext context)
        {
            _context = context;
        }

        // GET /api/tasks/{taskId}/comments
        // Lists the task's comments, newest first. 404 if the task does not exist.
        [HttpGet]
        public async Task<IActionResult> GetForTask(int taskId)
        {
            if (!await _context.Tasks.AnyAsync(t => t.Id == taskId))
                return NotFound(new { message = $"Task {taskId} not found." });

            var comments = await _context.Comments
                .Where(c => c.TaskId == taskId)
                .OrderByDescending(c => c.CreatedAt)
                .ToListAsync();

            return Ok(comments);
        }

        // POST /api/tasks/{taskId}/comments
        // Adds a comment. Body required, trimmed, <= 2000 chars. 404 if task missing.
        [HttpPost]
        public async Task<IActionResult> Create(int taskId, [FromBody] CreateCommentRequest request)
        {
            if (!await _context.Tasks.AnyAsync(t => t.Id == taskId))
                return NotFound(new { message = $"Task {taskId} not found." });

            if (string.IsNullOrWhiteSpace(request.Body))
                return BadRequest(new { message = "Comment body is required." });

            var body = request.Body.Trim();
            if (body.Length > MaxCommentLength)
                return BadRequest(new { message = $"Comment must be {MaxCommentLength} characters or fewer." });

            var comment = new TaskComment
            {
                TaskId = taskId,
                Body = body,
                CreatedAt = DateTime.Now,
            };
            _context.Comments.Add(comment);
            await _context.SaveChangesAsync();

            return CreatedAtAction(nameof(GetForTask), new { taskId }, comment);
        }

        // DELETE /api/tasks/{taskId}/comments/{id}
        // Removes a comment that belongs to this task. 404 if not found under it.
        [HttpDelete("{id:int}")]
        public async Task<IActionResult> Delete(int taskId, int id)
        {
            var comment = await _context.Comments
                .FirstOrDefaultAsync(c => c.Id == id && c.TaskId == taskId);

            if (comment is null)
                return NotFound(new { message = $"Comment {id} not found on task {taskId}." });

            _context.Comments.Remove(comment);
            await _context.SaveChangesAsync();

            return NoContent();
        }

        // Request body for adding a comment.
        public record CreateCommentRequest(string Body);
    }
}
