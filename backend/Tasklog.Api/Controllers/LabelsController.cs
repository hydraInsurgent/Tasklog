using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Tasklog.Api.Data;
using Tasklog.Api.Models;

namespace Tasklog.Api.Controllers
{
    [ApiController]
    [Route("api/labels")]
    public class LabelsController : ControllerBase
    {
        private readonly TasklogDbContext _context;

        public LabelsController(TasklogDbContext context)
        {
            _context = context;
        }

        // GET /api/labels
        // Returns all labels ordered alphabetically by name.
        [HttpGet]
        public async Task<IActionResult> GetAll()
        {
            var labels = await _context.Labels
                .OrderBy(l => l.Name)
                .ToListAsync();

            return Ok(labels);
        }

        // POST /api/labels
        // Creates a new label. Expects { name: string, colorIndex: int }.
        [HttpPost]
        public async Task<IActionResult> Create([FromBody] CreateLabelRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.Name))
                return BadRequest(new { message = "Label name is required." });

            if (request.ColorIndex < 0 || request.ColorIndex > 9)
                return BadRequest(new { message = "ColorIndex must be between 0 and 9." });

            var label = new Label
            {
                Name = request.Name.Trim(),
                ColorIndex = request.ColorIndex,
                CreatedAt = DateTime.UtcNow
            };

            _context.Labels.Add(label);
            await _context.SaveChangesAsync();

            return CreatedAtAction(nameof(GetAll), new { id = label.Id }, label);
        }

        // PATCH /api/labels/{id}
        // Updates a label's name and/or color. Returns the updated label.
        [HttpPatch("{id:int}")]
        public async Task<IActionResult> Update(int id, [FromBody] UpdateLabelRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.Name))
                return BadRequest(new { message = "Label name is required." });

            if (request.ColorIndex < 0 || request.ColorIndex > 9)
                return BadRequest(new { message = "ColorIndex must be between 0 and 9." });

            var label = await _context.Labels.FindAsync(id);

            if (label is null)
                return NotFound(new { message = $"Label {id} not found." });

            label.Name = request.Name.Trim();
            label.ColorIndex = request.ColorIndex;
            await _context.SaveChangesAsync();

            return Ok(label);
        }

        // DELETE /api/labels/{id}
        // Deletes a label. The join table entries are cascade-deleted by the database,
        // so this safely unlinks the label from all tasks without deleting those tasks.
        // Returns 204 No Content on success, 404 if not found.
        [HttpDelete("{id:int}")]
        public async Task<IActionResult> Delete(int id)
        {
            var label = await _context.Labels.FindAsync(id);

            if (label is null)
                return NotFound(new { message = $"Label {id} not found." });

            _context.Labels.Remove(label);
            await _context.SaveChangesAsync();

            return NoContent();
        }
    }

    // Request body for label creation.
    public record CreateLabelRequest(string Name, int ColorIndex);

    // Request body for label update (name and/or color).
    public record UpdateLabelRequest(string Name, int ColorIndex);
}
