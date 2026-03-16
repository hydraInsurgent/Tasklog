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
        // Labels are eagerly loaded so callers don't need a second request.
        [HttpGet]
        public async Task<IActionResult> GetAll()
        {
            var tasks = await _context.Tasks
                .Include(t => t.Labels)
                .OrderByDescending(t => t.CreatedAt)
                .ToListAsync();

            return Ok(tasks);
        }

        // GET /api/tasks/{id}
        // Returns a single task by ID, or 404 if not found.
        // Labels are eagerly loaded alongside the task.
        [HttpGet("{id:int}")]
        public async Task<IActionResult> GetById(int id)
        {
            // FindAsync does not support Include, so we use FirstOrDefaultAsync here.
            var task = await _context.Tasks
                .Include(t => t.Labels)
                .FirstOrDefaultAsync(t => t.Id == id);

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
                CreatedAt = DateTime.Now,
                // Null means the task goes to Inbox (uncategorized).
                ProjectId = request.ProjectId
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

        // PATCH /api/tasks/{id}/project
        // Assigns or unassigns a project on an existing task. Returns the updated task.
        // Send { projectId: null } to move the task back to Inbox.
        [HttpPatch("{id:int}/project")]
        public async Task<IActionResult> AssignProject(int id, [FromBody] AssignProjectRequest request)
        {
            var task = await _context.Tasks.FindAsync(id);

            if (task is null)
                return NotFound(new { message = $"Task {id} not found." });

            task.ProjectId = request.ProjectId;
            await _context.SaveChangesAsync();

            return Ok(task);
        }

        // PATCH /api/tasks/{id}/labels
        // Replaces the full set of labels on a task. Accepts an array of label IDs.
        // Sends back the updated task with labels included.
        // Send an empty array to remove all labels from the task.
        [HttpPatch("{id:int}/labels")]
        public async Task<IActionResult> SetLabels(int id, [FromBody] SetTaskLabelsRequest request)
        {
            // Load the task with its current labels so EF can track the relationship changes.
            var task = await _context.Tasks
                .Include(t => t.Labels)
                .FirstOrDefaultAsync(t => t.Id == id);

            if (task is null)
                return NotFound(new { message = $"Task {id} not found." });

            // Load the requested labels and reject the request if any IDs don't exist.
            // An empty array is valid - it clears all labels from the task.
            var newLabels = await _context.Labels
                .Where(l => request.LabelIds.Contains(l.Id))
                .ToListAsync();

            if (request.LabelIds.Length > 0)
            {
                var foundIds = newLabels.Select(l => l.Id).ToHashSet();
                var invalidIds = request.LabelIds.Where(id => !foundIds.Contains(id)).ToList();

                if (invalidIds.Any())
                    return BadRequest(new { message = $"Label IDs not found: {string.Join(", ", invalidIds)}." });
            }

            // Replace the current label collection. EF Core handles join table updates.
            task.Labels.Clear();
            foreach (var label in newLabels)
                task.Labels.Add(label);

            await _context.SaveChangesAsync();

            return Ok(task);
        }
    }

    // Request body shape for task creation.
    public record CreateTaskRequest(string Title, DateTime? Deadline, int? ProjectId);

    // Request body shape for toggling task completion.
    public record CompleteTaskRequest(bool IsCompleted);

    // Request body shape for assigning or unassigning a project on a task.
    public record AssignProjectRequest(int? ProjectId);

    // Request body shape for replacing a task's full label set.
    public record SetTaskLabelsRequest(int[] LabelIds);
}
