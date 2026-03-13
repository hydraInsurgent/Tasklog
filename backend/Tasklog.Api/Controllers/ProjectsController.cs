using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Tasklog.Api.Data;
using Tasklog.Api.Models;

namespace Tasklog.Api.Controllers
{
    [ApiController]
    [Route("api/projects")]
    public class ProjectsController : ControllerBase
    {
        private readonly TasklogDbContext _context;

        public ProjectsController(TasklogDbContext context)
        {
            _context = context;
        }

        // GET /api/projects
        // Returns all projects ordered alphabetically by name.
        [HttpGet]
        public async Task<IActionResult> GetAll()
        {
            var projects = await _context.Projects
                .OrderBy(p => p.Name)
                .ToListAsync();

            return Ok(projects);
        }

        // POST /api/projects
        // Creates a new project. Expects { name: string }.
        [HttpPost]
        public async Task<IActionResult> Create([FromBody] ProjectNameRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.Name))
                return BadRequest(new { message = "Project name is required." });

            var project = new Project
            {
                Name = request.Name.Trim(),
                CreatedAt = DateTime.UtcNow
            };

            _context.Projects.Add(project);
            await _context.SaveChangesAsync();

            return CreatedAtAction(nameof(GetAll), new { id = project.Id }, project);
        }

        // PATCH /api/projects/{id}
        // Renames an existing project. Expects { name: string }.
        [HttpPatch("{id:int}")]
        public async Task<IActionResult> Rename(int id, [FromBody] ProjectNameRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.Name))
                return BadRequest(new { message = "Project name is required." });

            var project = await _context.Projects.FindAsync(id);

            if (project is null)
                return NotFound(new { message = $"Project {id} not found." });

            project.Name = request.Name.Trim();
            await _context.SaveChangesAsync();

            return Ok(project);
        }

        // DELETE /api/projects/{id}
        // Deletes a project and all tasks that belong to it (cascade delete).
        // Returns 204 No Content on success, 404 if not found.
        [HttpDelete("{id:int}")]
        public async Task<IActionResult> Delete(int id)
        {
            var project = await _context.Projects.FindAsync(id);

            if (project is null)
                return NotFound(new { message = $"Project {id} not found." });

            // Cascade: delete all tasks in this project first.
            var tasks = await _context.Tasks
                .Where(t => t.ProjectId == id)
                .ToListAsync();

            _context.Tasks.RemoveRange(tasks);
            _context.Projects.Remove(project);
            await _context.SaveChangesAsync();

            return NoContent();
        }
    }

    // Request body for project create and rename.
    public record ProjectNameRequest(string Name);
}
