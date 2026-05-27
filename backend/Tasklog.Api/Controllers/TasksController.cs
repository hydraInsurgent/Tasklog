using System.Text.Json;
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
        // Returns tasks ordered by creation date, newest first.
        // Labels are eagerly loaded so callers don't need a second request.
        //
        // All query parameters are optional. When omitted, the endpoint behaves
        // as before and returns every task. When provided, filters AND together
        // across dimensions; within projectIds/labelIds arrays the semantics are
        // OR (task matches if it has any of the given values).
        //
        // The new MCP `list_tasks` tool calls this endpoint with filter params
        // so claude.ai can answer natural queries like "what's due this week in
        // the Work project" with one round-trip instead of fetching everything
        // and filtering client-side.
        [HttpGet]
        public async Task<IActionResult> GetAll([FromQuery] TaskFilterQuery filter)
        {
            // inbox=true means "tasks with no project". Specifying both inbox
            // and a non-empty projectIds is contradictory; fail loudly so callers
            // notice rather than silently picking one.
            if (filter.Inbox == true && filter.ProjectIds is { Length: > 0 })
            {
                return BadRequest(new
                {
                    message = "Use either inbox=true or projectIds, not both.",
                });
            }

            IQueryable<TaskModel> query = _context.Tasks.Include(t => t.Labels);

            if (filter.Inbox == true)
            {
                query = query.Where(t => t.ProjectId == null);
            }
            else if (filter.ProjectIds is { Length: > 0 })
            {
                // OR-within: task matches if its ProjectId is in the supplied list.
                query = query.Where(t => t.ProjectId != null && filter.ProjectIds.Contains(t.ProjectId.Value));
            }

            if (filter.LabelIds is { Length: > 0 })
            {
                // OR-within across labels: task matches if it has ANY of the requested labels.
                query = query.Where(t => t.Labels.Any(l => filter.LabelIds.Contains(l.Id)));
            }

            if (filter.DueBefore.HasValue)
            {
                // Tasks with no deadline are excluded from deadline-range filters.
                // Inclusive: deadline <= dueBefore.
                query = query.Where(t => t.Deadline.HasValue && t.Deadline.Value <= filter.DueBefore.Value);
            }

            if (filter.DueAfter.HasValue)
            {
                query = query.Where(t => t.Deadline.HasValue && t.Deadline.Value >= filter.DueAfter.Value);
            }

            if (filter.Completed.HasValue)
            {
                query = query.Where(t => t.IsCompleted == filter.Completed.Value);
            }

            if (!string.IsNullOrWhiteSpace(filter.Text))
            {
                // Explicit lowercase both sides so the filter is case-insensitive
                // in both production (SQLite) and unit tests (EF Core InMemory).
                // InMemory uses C# string.Contains which is case-sensitive; lowering
                // both sides sidesteps that without losing the SQLite optimisation
                // (EF Core translates ToLower() to SQL LOWER()).
                // Trim before matching so surrounding whitespace doesn't change
                // the result. The frontend trims too; keeping all layers aligned.
                var lowered = filter.Text.Trim().ToLower();
                query = query.Where(t => t.Title.ToLower().Contains(lowered));
            }

            // priorities: OR within the list - a task matches if its priority is any of
            // the requested values (e.g. ?priorities=1&priorities=2 = P1 or P2).
            if (filter.Priorities is { Length: > 0 })
            {
                query = query.Where(t => filter.Priorities.Contains(t.Priority));
            }

            // createdAt range. Unlike Deadline (date-only), CreatedAt carries a time,
            // so "added today" = createdAfter=<today> (>= midnight today). Inclusive
            // bounds, mirroring DueBefore/DueAfter. CreatedAt is never null.
            if (filter.CreatedAfter.HasValue)
            {
                query = query.Where(t => t.CreatedAt >= filter.CreatedAfter.Value);
            }

            if (filter.CreatedBefore.HasValue)
            {
                query = query.Where(t => t.CreatedAt <= filter.CreatedBefore.Value);
            }

            // limit is a post-sort count cap. Reject nonsense up front.
            if (filter.Limit is < 1)
            {
                return BadRequest(new { message = "limit must be 1 or greater." });
            }

            // Sort: created | deadline | priority, asc | desc. Default created/desc
            // (the historical newest-first behaviour). Deadline sorts nulls-last in
            // both directions (the `== null` key orders non-null before null), and
            // every sort breaks ties on CreatedAt desc for stable ordering.
            var sortKey = filter.Sort?.ToLowerInvariant();
            var descending = !string.Equals(filter.Order, "asc", StringComparison.OrdinalIgnoreCase);
            IOrderedQueryable<TaskModel> ordered = sortKey switch
            {
                "deadline" => descending
                    ? query.OrderBy(t => t.Deadline == null).ThenByDescending(t => t.Deadline)
                    : query.OrderBy(t => t.Deadline == null).ThenBy(t => t.Deadline),
                "priority" => descending
                    ? query.OrderByDescending(t => t.Priority)
                    : query.OrderBy(t => t.Priority),
                // "created" and any unrecognised value fall back to created.
                _ => descending
                    ? query.OrderByDescending(t => t.CreatedAt)
                    : query.OrderBy(t => t.CreatedAt),
            };

            // Stable tiebreak so equal sort keys (e.g. same deadline/priority) have a
            // deterministic order. Skip it for the created sort - CreatedAt is already
            // the key there (and re-applying it would be redundant).
            IQueryable<TaskModel> sorted = sortKey is "deadline" or "priority"
                ? ordered.ThenByDescending(t => t.CreatedAt)
                : ordered;

            if (filter.Limit.HasValue)
            {
                sorted = sorted.Take(filter.Limit.Value);
            }

            var tasks = await sorted.ToListAsync();

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

            // Priority is optional on create; omitted defaults to 4 (P4 = none).
            // When provided it must be on the P1-P4 scale.
            var priority = request.Priority ?? 4;
            if (priority < 1 || priority > 4)
                return BadRequest(new { message = "Priority must be between 1 (P1) and 4 (P4)." });

            // Description is optional free text; normalise (trim, null when blank) and cap.
            var (description, descError) = NormalizeDescription(request.Description);
            if (descError is not null)
                return BadRequest(new { message = descError });

            var task = new TaskModel
            {
                Title = request.Title.Trim(),
                Description = description,
                Deadline = request.Deadline,
                CreatedAt = DateTime.Now,
                // Null means the task goes to Inbox (uncategorized).
                ProjectId = request.ProjectId,
                Priority = priority
            };

            _context.Tasks.Add(task);
            await _context.SaveChangesAsync();

            return CreatedAtAction(nameof(GetById), new { id = task.Id }, task);
        }

        // PATCH /api/tasks/{id}
        // Partial update of a task's core editable fields (title, deadline).
        // Present-key detection: a field absent from the body is left unchanged;
        // a field present with null clears it (deadline only); a present value sets it.
        //
        // We read the body as JsonElement rather than binding to a typed record
        // because a record collapses "field omitted" and "field set to null" into
        // the same null - and we need to tell them apart (omit = keep, null = clear).
        // This is the first use of JsonElement partial-PATCH in the codebase.
        [HttpPatch("{id:int}")]
        public async Task<IActionResult> Update(int id, [FromBody] JsonElement body)
        {
            var task = await _context.Tasks
                .Include(t => t.Labels)
                .FirstOrDefaultAsync(t => t.Id == id);

            if (task is null)
                return NotFound(new { message = $"Task {id} not found." });

            if (body.ValueKind != JsonValueKind.Object)
                return BadRequest(new { message = "Request body must be a JSON object." });

            // title: present must be a non-empty string; absent leaves it unchanged.
            if (body.TryGetProperty("title", out var titleEl))
            {
                if (titleEl.ValueKind != JsonValueKind.String || string.IsNullOrWhiteSpace(titleEl.GetString()))
                    return BadRequest(new { message = "Title must be a non-empty string." });
                task.Title = titleEl.GetString()!.Trim();
            }

            // description: present + null/blank clears it; present + string sets it
            // (trimmed, <= 2000 chars); a non-string/non-null is a bad request. Absent keeps.
            if (body.TryGetProperty("description", out var descEl))
            {
                if (descEl.ValueKind == JsonValueKind.Null)
                {
                    task.Description = null;
                }
                else if (descEl.ValueKind == JsonValueKind.String)
                {
                    var (description, descError) = NormalizeDescription(descEl.GetString());
                    if (descError is not null) return BadRequest(new { message = descError });
                    task.Description = description;
                }
                else
                {
                    return BadRequest(new { message = "Description must be a string or null." });
                }
            }

            // deadline: present + null clears it; present + ISO date string sets it;
            // anything else is a bad request. Absent leaves it unchanged.
            if (body.TryGetProperty("deadline", out var deadlineEl))
            {
                if (deadlineEl.ValueKind == JsonValueKind.Null)
                {
                    task.Deadline = null;
                }
                else if (deadlineEl.ValueKind == JsonValueKind.String && deadlineEl.TryGetDateTime(out var dl))
                {
                    task.Deadline = dl;
                }
                else
                {
                    return BadRequest(new { message = "Deadline must be an ISO 8601 date string or null." });
                }
            }

            // priority: present must be a number on the P1-P4 scale (1-4). There is no
            // "clear" - P4 is the no-priority state. Absent leaves it unchanged.
            if (body.TryGetProperty("priority", out var priorityEl))
            {
                if (priorityEl.ValueKind != JsonValueKind.Number || !priorityEl.TryGetInt32(out var p) || p < 1 || p > 4)
                    return BadRequest(new { message = "Priority must be a number between 1 (P1) and 4 (P4)." });
                task.Priority = p;
            }

            await _context.SaveChangesAsync();

            return Ok(task);
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

            // A projectName, when provided, wins over projectId and is resolved by name
            // (ambiguous/missing -> 400). Otherwise use projectId (null = Inbox).
            var projectId = request.ProjectId;
            if (!string.IsNullOrWhiteSpace(request.ProjectName))
            {
                var (resolvedId, error) = await ResolveProjectByName(request.ProjectName);
                if (error is not null) return BadRequest(new { message = error });
                projectId = resolvedId;
            }

            task.ProjectId = projectId;
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

            // labelNames, when provided, wins over labelIds and is resolved by name
            // (any unknown/ambiguous name -> 400). Otherwise use labelIds (null = empty
            // = clear all labels). The rest of the action works off this effective list.
            int[] labelIds;
            if (request.LabelNames is { Length: > 0 })
            {
                var (resolvedIds, error) = await ResolveLabelsByName(request.LabelNames);
                if (error is not null) return BadRequest(new { message = error });
                labelIds = resolvedIds!.ToArray();
            }
            else
            {
                labelIds = request.LabelIds ?? Array.Empty<int>();
            }

            // Load the requested labels and reject the request if any IDs don't exist.
            // An empty array is valid - it clears all labels from the task.
            var newLabels = await _context.Labels
                .Where(l => labelIds.Contains(l.Id))
                .ToListAsync();

            if (labelIds.Length > 0)
            {
                var foundIds = newLabels.Select(l => l.Id).ToHashSet();
                var invalidIds = labelIds.Where(lid => !foundIds.Contains(lid)).ToList();

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

        // POST /api/tasks/bulk
        // Applies one operation to a set of tasks in a single transaction. Supported
        // operations: "complete" (data.isCompleted), "assignProject" (data.projectId or
        // data.projectName; null projectId = Inbox), "setDeadline" (data.deadline, null =
        // clear, ISO string = set), "setPriority" (data.priority 1-4). No bulk delete -
        // deletion stays single-task. Non-existent ids are skipped; returns the affected
        // tasks (with labels). 400 on bad input.
        [HttpPost("bulk")]
        public async Task<IActionResult> Bulk([FromBody] BulkTaskRequest request)
        {
            if (request.TaskIds is null || request.TaskIds.Count == 0)
                return BadRequest(new { message = "taskIds must be a non-empty array." });

            // Cap the batch size server-side rather than trusting the client (the MCP
            // layer caps at 100, but a direct HTTP caller could send an unbounded list).
            const int maxBulk = 500;
            if (request.TaskIds.Count > maxBulk)
                return BadRequest(new { message = $"taskIds is limited to {maxBulk} per request." });

            // Load only the tasks that exist (unknown ids are silently skipped) with
            // their labels so the response is fully populated.
            var tasks = await _context.Tasks
                .Include(t => t.Labels)
                .Where(t => request.TaskIds.Contains(t.Id))
                .ToListAsync();

            var data = request.Data;

            switch (request.Operation)
            {
                case "complete":
                    if (data?.IsCompleted is not bool isCompleted)
                        return BadRequest(new { message = "data.isCompleted is required for the complete operation." });
                    foreach (var task in tasks)
                    {
                        task.IsCompleted = isCompleted;
                        // Match the single-task Complete action: stamp/clear CompletedAt.
                        task.CompletedAt = isCompleted ? DateTime.Now : null;
                    }
                    break;

                case "assignProject":
                    var projectId = data?.ProjectId;
                    // A projectName, when provided, wins over projectId and is resolved
                    // by name (ambiguous/missing -> 400).
                    if (!string.IsNullOrWhiteSpace(data?.ProjectName))
                    {
                        var (resolvedId, projErr) = await ResolveProjectByName(data.ProjectName);
                        if (projErr is not null) return BadRequest(new { message = projErr });
                        projectId = resolvedId;
                    }
                    // Validate the destination project exists (null = Inbox is always valid).
                    // Stricter than the single-task endpoint on purpose; bulk is higher-stakes.
                    else if (projectId is int pid && !await _context.Projects.AnyAsync(p => p.Id == pid))
                        return BadRequest(new { message = $"Project {pid} not found." });
                    foreach (var task in tasks)
                        task.ProjectId = projectId;
                    break;

                case "setPriority":
                    // Mirror the single-task priority validation (P1-P4).
                    if (data?.Priority is not int bulkPriority || bulkPriority < 1 || bulkPriority > 4)
                        return BadRequest(new { message = "data.priority must be between 1 (P1) and 4 (P4)." });
                    foreach (var task in tasks)
                        task.Priority = bulkPriority;
                    break;

                case "setDeadline":
                    DateTime? deadline = null;
                    // null/absent clears the deadline; a string must be a valid ISO date.
                    if (data?.Deadline is string raw)
                    {
                        if (!DateTime.TryParse(raw, out var parsed))
                            return BadRequest(new { message = "data.deadline must be an ISO 8601 date string or null." });
                        deadline = parsed;
                    }
                    foreach (var task in tasks)
                        task.Deadline = deadline;
                    break;

                default:
                    return BadRequest(new { message = $"Unknown operation '{request.Operation}'. Expected: complete, assignProject, setDeadline, setPriority." });
            }

            await _context.SaveChangesAsync();

            return Ok(tasks);
        }

        // Normalise a free-text description: trim, treat blank as null (no description),
        // and cap the length. Returns an error string (caller -> 400) when too long.
        private const int MaxDescriptionLength = 2000;
        private static (string? value, string? error) NormalizeDescription(string? raw)
        {
            if (string.IsNullOrWhiteSpace(raw)) return (null, null);
            var trimmed = raw.Trim();
            if (trimmed.Length > MaxDescriptionLength)
                return (null, $"Description must be {MaxDescriptionLength} characters or fewer.");
            return (trimmed, null);
        }

        // Resolve a project name to its id. Exact, case-insensitive match. Returns an
        // error string (not an id) when the name matches zero or more than one project,
        // so the caller can return a 400 - we never guess which project was meant.
        private async Task<(int? id, string? error)> ResolveProjectByName(string name)
        {
            var matches = await _context.Projects
                .Where(p => p.Name.ToLower() == name.ToLower())
                .Select(p => p.Id)
                .ToListAsync();
            return matches.Count switch
            {
                0 => (null, $"No project named '{name}'."),
                1 => (matches[0], null),
                _ => (null, $"Multiple projects named '{name}' - use a project id instead."),
            };
        }

        // Resolve a list of label names to ids (exact, case-insensitive). Any name that
        // matches zero or more than one label is an error (caller -> 400).
        private async Task<(List<int>? ids, string? error)> ResolveLabelsByName(string[] names)
        {
            var ids = new List<int>();
            foreach (var name in names)
            {
                var matches = await _context.Labels
                    .Where(l => l.Name.ToLower() == name.ToLower())
                    .Select(l => l.Id)
                    .ToListAsync();
                if (matches.Count == 0)
                    return (null, $"No label named '{name}'.");
                if (matches.Count > 1)
                    return (null, $"Multiple labels named '{name}' - use a label id instead.");
                ids.Add(matches[0]);
            }
            return (ids, null);
        }
    }

    // Request body shape for task creation. Priority is optional (defaults to 4 = none);
    // Description is optional free text (null/blank = none).
    public record CreateTaskRequest(string Title, DateTime? Deadline, int? ProjectId, int? Priority = null, string? Description = null);

    // Request body shape for toggling task completion.
    public record CompleteTaskRequest(bool IsCompleted);

    // Request body shape for assigning or unassigning a project on a task.
    // ProjectName, when provided, is resolved by name and wins over ProjectId.
    public record AssignProjectRequest(int? ProjectId, string? ProjectName = null);

    // Request body shape for replacing a task's full label set. LabelNames, when
    // provided, is resolved by name and wins over LabelIds. Empty/absent both clear.
    public record SetTaskLabelsRequest(int[]? LabelIds = null, string[]? LabelNames = null);

    // Request body shape for bulk operations. Operation is one of
    // "complete" / "assignProject" / "setDeadline". Data carries the per-operation
    // payload; Deadline is a string so it can be parsed and validated explicitly
    // (null = clear), mirroring the single-task PATCH.
    public record BulkTaskRequest(string Operation, List<int> TaskIds, BulkTaskData? Data);
    public record BulkTaskData(bool? IsCompleted, int? ProjectId, string? Deadline, int? Priority = null, string? ProjectName = null);

    // Query-string shape for filtering the task list. All fields optional.
    // [FromQuery] binds:
    //   projectIds  - repeated keys, e.g. "?projectIds=3&projectIds=5" - this is
    //                 what ASP.NET Core binds to int[]. Comma-separated
    //                 ("?projectIds=3,5") does NOT bind (it parses "3,5" as one
    //                 int and silently matches nothing). The MCP client serializes
    //                 arrays as repeated keys for this reason.
    //   labelIds    - same shape
    //   dueBefore / dueAfter - ISO 8601 dates (yyyy-MM-dd)
    //   completed / inbox    - "true" or "false"
    //   text                  - free substring for case-insensitive title match
    //   priorities            - repeated keys (P1-P4 values), OR within
    //   createdAfter/Before   - ISO datetime; inclusive range on CreatedAt
    //   sort / order          - created|deadline|priority + asc|desc (default created/desc)
    //   limit                 - cap the result to the first N after sorting
    public record TaskFilterQuery(
        int[]? ProjectIds,
        bool? Inbox,
        int[]? LabelIds,
        DateTime? DueBefore,
        DateTime? DueAfter,
        bool? Completed,
        string? Text,
        int[]? Priorities = null,
        DateTime? CreatedAfter = null,
        DateTime? CreatedBefore = null,
        string? Sort = null,
        string? Order = null,
        int? Limit = null);
}
