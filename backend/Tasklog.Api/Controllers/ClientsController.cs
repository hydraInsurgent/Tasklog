using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Tasklog.Api.Data;
using Tasklog.Api.Models;

namespace Tasklog.Api.Controllers
{
    // Clients (#86) - the grouping level above projects. Mirrors ProjectsController almost
    // exactly (name + optional color). The one deliberate difference is Delete: deleting a
    // client does NOT delete its projects (unlike a project deleting its tasks) - it just
    // un-groups them (ClientId -> null), so no projects or tasks are ever lost with a client.
    [ApiController]
    [Route("api/clients")]
    public class ClientsController : ControllerBase
    {
        private readonly TasklogDbContext _context;

        public ClientsController(TasklogDbContext context)
        {
            _context = context;
        }

        // GET /api/clients - all clients, ordered alphabetically by name.
        [HttpGet]
        public async Task<IActionResult> GetAll()
        {
            var clients = await _context.Clients
                .OrderBy(c => c.Name)
                .ToListAsync();

            return Ok(clients);
        }

        // POST /api/clients - create a client. Expects { name, color? }.
        [HttpPost]
        public async Task<IActionResult> Create([FromBody] ClientNameRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.Name))
                return BadRequest(new { message = "Client name is required." });
            if (!IsValidColor(request.Color))
                return BadRequest(new { message = "Color must be a #RRGGBB hex string." });

            var client = new Client
            {
                Name = request.Name.Trim(),
                Color = request.Color,
                CreatedAt = DateTime.UtcNow
            };

            _context.Clients.Add(client);
            await _context.SaveChangesAsync();

            return CreatedAtAction(nameof(GetAll), new { id = client.Id }, client);
        }

        // PATCH /api/clients/{id} - rename/recolor. Expects { name, color? }.
        [HttpPatch("{id:int}")]
        public async Task<IActionResult> Rename(int id, [FromBody] ClientNameRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.Name))
                return BadRequest(new { message = "Client name is required." });
            if (!IsValidColor(request.Color))
                return BadRequest(new { message = "Color must be a #RRGGBB hex string." });

            var client = await _context.Clients.FindAsync(id);
            if (client is null)
                return NotFound(new { message = $"Client {id} not found." });

            client.Name = request.Name.Trim();
            // Color is optional; a provided value sets it, null leaves it unchanged
            // (same convention as ProjectsController.Rename).
            if (request.Color is not null) client.Color = request.Color;
            await _context.SaveChangesAsync();

            return Ok(client);
        }

        // DELETE /api/clients/{id} - delete a client and UN-GROUP its projects (ClientId ->
        // null). Projects and their tasks survive. 204 on success, 404 if not found.
        [HttpDelete("{id:int}")]
        public async Task<IActionResult> Delete(int id)
        {
            var client = await _context.Clients.FindAsync(id);
            if (client is null)
                return NotFound(new { message = $"Client {id} not found." });

            // Explicitly un-group the projects (the FK is also SET NULL, but doing it here
            // keeps the intent obvious and mirrors ProjectsController's explicit cascade).
            var projects = await _context.Projects
                .Where(p => p.ClientId == id)
                .ToListAsync();
            foreach (var p in projects) p.ClientId = null;

            _context.Clients.Remove(client);
            await _context.SaveChangesAsync();

            return NoContent();
        }

        // A color is valid when null (no color) or a "#RRGGBB" hex string.
        private static bool IsValidColor(string? color) =>
            color is null || Regex.IsMatch(color, "^#[0-9a-fA-F]{6}$");
    }

    // Request body for client create and rename. Color is optional ("#RRGGBB" or null).
    public record ClientNameRequest(string Name, string? Color = null);
}
