using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Tasklog.Api.Data;
using Tasklog.Api.Models;

namespace Tasklog.Api.Controllers
{
    [ApiController]
    [Route("api/tasks")]
    public class TasksController : ControllerBase
    {
        private readonly TasklogDbContext _context;

        public TasksController(TasklogDbContext context)
        {
            _context = context;
        }

        // GET /api/tasks
        // Returns all tasks ordered by creation date, newest first.
        [HttpGet]
        public async Task<IActionResult> GetAll()
        {
            var tasks = await _context.Tasks
                .OrderByDescending(t => t.CreatedAt)
                .ToListAsync();

            return Ok(tasks);
        }

        // GET /api/tasks/{id}
        // Returns a single task by ID, or 404 if not found.
        [HttpGet("{id:int}")]
        public async Task<IActionResult> GetById(int id)
        {
            var task = await _context.Tasks.FindAsync(id);

            if (task is null)
                return NotFound(new { message = $"Task {id} not found." });

            return Ok(task);
        }

        // POST /api/tasks
        // Creates a new task. Expects { title: string, deadline?: string }.
        [HttpPost]
        public async Task<IActionResult> Create([FromBody] CreateTaskRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.Title))
                return BadRequest(new { message = "Title is required." });

            var task = new TaskModel
            {
                Title = request.Title.Trim(),
                Deadline = request.Deadline,
                CreatedAt = DateTime.Now
            };

            _context.Tasks.Add(task);
            await _context.SaveChangesAsync();

            return CreatedAtAction(nameof(GetById), new { id = task.Id }, task);
        }

        // DELETE /api/tasks/{id}
        // Deletes a task by ID. Returns 204 No Content on success, or 404 if not found.
        [HttpDelete("{id:int}")]
        public async Task<IActionResult> Delete(int id)
        {
            var task = await _context.Tasks.FindAsync(id);

            if (task is null)
                return NotFound(new { message = $"Task {id} not found." });

            _context.Tasks.Remove(task);
            await _context.SaveChangesAsync();

            return NoContent();
        }

        // PATCH /api/tasks/{id}/complete
        // Marks a task as complete or incomplete. Returns the updated task.
        [HttpPatch("{id:int}/complete")]
        public async Task<IActionResult> Complete(int id, [FromBody] CompleteTaskRequest request)
        {
            var task = await _context.Tasks.FindAsync(id);

            if (task is null)
                return NotFound(new { message = $"Task {id} not found." });

            task.IsCompleted = request.IsCompleted;
            // Record when the task was completed; clear it if marked incomplete again.
            task.CompletedAt = request.IsCompleted ? DateTime.Now : null;
            await _context.SaveChangesAsync();

            return Ok(task);
        }
    }

    // Request body shape for task creation.
    public record CreateTaskRequest(string Title, DateTime? Deadline);

    // Request body shape for toggling task completion.
    public record CompleteTaskRequest(bool IsCompleted);
}
