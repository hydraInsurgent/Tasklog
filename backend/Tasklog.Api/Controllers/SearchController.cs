using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Tasklog.Api.Data;
using Tasklog.Api.Services;

namespace Tasklog.Api.Controllers
{
    // Semantic task search (#87) - the retrieval seam the companion's grounding tool
    // calls. Semantic-first: embed the query, brute-force cosine over the stored task
    // vectors, return the top-k WITH scores; the caller (an LLM) judges the candidates -
    // we never auto-match on a threshold. Degrades to keyword LIKE when Ollama is
    // unreachable or no vectors exist, so the endpoint always answers.
    //
    // POST (not GET) because the future shape sends richer context; the body is the API.
    [ApiController]
    [Route("api/search")]
    public class SearchController : ControllerBase
    {
        private readonly TasklogDbContext _context;
        private readonly EmbeddingService _embeddings;

        public SearchController(TasklogDbContext context, EmbeddingService embeddings)
        {
            _context = context;
            _embeddings = embeddings;
        }

        // POST /api/search/tasks  { query, limit? } - top-k OPEN tasks most relevant to
        // the query. Response notes how it matched ("semantic" | "keyword") so callers
        // and tests can see which path ran.
        [HttpPost("tasks")]
        public async Task<IActionResult> Tasks([FromBody] SearchRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.Query))
                return BadRequest(new { message = "query is required." });
            var limit = request.Limit ?? 8;
            if (limit is < 1 or > 25)
                return BadRequest(new { message = "limit must be between 1 and 25." });

            // Only open tasks: search grounds "what should I do / does this exist" -
            // completed work is not a duplicate-candidate. Deleted tasks leave orphan
            // vectors behind, but they can never surface (this projection is the gate).
            var openTasks = await _context.Tasks
                .Where(t => !t.IsCompleted)
                .Include(t => t.Project)
                .Select(t => new { t.Id, t.Title, t.ProjectId, ProjectName = t.Project != null ? t.Project.Name : null, t.Deadline })
                .ToListAsync();

            var queryVector = await _embeddings.EmbedAsync(request.Query.Trim());
            if (queryVector is not null)
            {
                var vectors = await _context.Embeddings
                    .Where(e => e.EntityType == "task" && e.Model == EmbeddingService.ModelName)
                    .ToDictionaryAsync(e => e.EntityId, e => e.Vector);

                if (vectors.Count > 0)
                {
                    var ranked = openTasks
                        .Where(t => vectors.ContainsKey(t.Id))
                        .Select(t => new
                        {
                            t.Id, t.Title, t.ProjectId, t.ProjectName, t.Deadline,
                            Score = Math.Round(EmbeddingService.Cosine(queryVector, EmbeddingService.FromBytes(vectors[t.Id])), 4),
                        })
                        .OrderByDescending(t => t.Score)
                        .Take(limit)
                        .ToList();
                    return Ok(new { matchedBy = "semantic", results = ranked });
                }
            }

            // Degraded path: substring match on the title. Honest about being keyword.
            var needle = request.Query.Trim().ToLower();
            var fallback = openTasks
                .Where(t => t.Title.ToLower().Contains(needle))
                .Take(limit)
                .Select(t => new { t.Id, t.Title, t.ProjectId, t.ProjectName, t.Deadline, Score = 0.0 })
                .ToList();
            return Ok(new { matchedBy = "keyword", results = fallback });
        }
    }

    public record SearchRequest(string? Query, int? Limit);
}
