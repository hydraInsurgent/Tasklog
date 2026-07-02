using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Tasklog.Api.Data;
using Tasklog.Api.Models;
using Tasklog.Api.Services;

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

            // The web list opts into the full subtask rows so it can render the inline
            // checklist under each task; MCP's list_tasks does not, and gets the cheap
            // counts only (stitched below).
            if (filter.IncludeSubtasks == true)
                query = query.Include(t => t.Subtasks.OrderBy(s => s.Position));

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

            // Populate the subtask progress counts. When the rows were loaded (web list),
            // count them in memory; otherwise (MCP) run one lightweight grouped count query
            // over the returned ids so the counts are present without loading the full rows.
            if (filter.IncludeSubtasks == true)
            {
                foreach (var t in tasks)
                {
                    t.SubtaskCount = t.Subtasks.Count;
                    t.CompletedSubtaskCount = t.Subtasks.Count(s => s.IsCompleted);
                }
            }
            else if (tasks.Count > 0)
            {
                var taskIds = tasks.Select(t => t.Id).ToList();
                var counts = await _context.Subtasks
                    .Where(s => taskIds.Contains(s.TaskId))
                    .GroupBy(s => s.TaskId)
                    .Select(g => new
                    {
                        TaskId = g.Key,
                        Total = g.Count(),
                        Completed = g.Count(s => s.IsCompleted),
                    })
                    .ToListAsync();
                var countByTask = counts.ToDictionary(c => c.TaskId);
                foreach (var t in tasks)
                {
                    if (countByTask.TryGetValue(t.Id, out var c))
                    {
                        t.SubtaskCount = c.Total;
                        t.CompletedSubtaskCount = c.Completed;
                    }
                }
            }

            return Ok(tasks);
        }

        // GET /api/tasks/{id}
        // Returns a single task by ID, or 404 if not found.
        // Labels are eagerly loaded alongside the task.
        [HttpGet("{id:int}")]
        public async Task<IActionResult> GetById(int id)
        {
            // FindAsync does not support Include, so we use FirstOrDefaultAsync here.
            // Comments are loaded only here (the single-task view), not in GetAll,
            // to keep list payloads small. Newest comment first.
            var task = await _context.Tasks
                .Include(t => t.Labels)
                .Include(t => t.Comments.OrderByDescending(c => c.CreatedAt))
                .Include(t => t.Subtasks.OrderBy(s => s.Position))
                .FirstOrDefaultAsync(t => t.Id == id);

            if (task is null)
                return NotFound(new { message = $"Task {id} not found." });

            // Counts come from the collection loaded above (the single-task view is the one
            // place we load full subtask rows). The list path stitches them from a query instead.
            task.SubtaskCount = task.Subtasks.Count;
            task.CompletedSubtaskCount = task.Subtasks.Count(s => s.IsCompleted);

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

            var isHabit = request.IsHabit ?? false;

            // WeeklyTarget is the "x times a week" habit frequency. It is habits-only, on the
            // 1-7 scale, and mutually exclusive with a specific-days Recurrence (a habit is
            // scheduled one way or the other - see the two-mode model in #75).
            if (request.WeeklyTarget is int wt)
            {
                if (!isHabit)
                    return BadRequest(new { message = "Only a habit can have a weekly frequency target." });
                if (wt < 1 || wt > 7)
                    return BadRequest(new { message = "Weekly target must be between 1 and 7." });
                if (!string.IsNullOrWhiteSpace(request.Recurrence))
                    return BadRequest(new { message = "A habit is scheduled on specific days OR a weekly target, not both." });
            }

            // Recurrence is optional. It must be a rule the core can expand; we store the
            // canonical serialized form and stamp a fresh SeriesId so future occurrences link.
            // A recurring TASK requires a deadline (the anchor the rule advances from on
            // completion), but a HABIT does not: its recurrence is only ever read as a
            // day-pattern (OccursOn) and it never spawns, so it can carry a schedule with no
            // deadline (#75).
            string? recurrence = null;
            Guid? seriesId = null;
            if (!string.IsNullOrWhiteSpace(request.Recurrence))
            {
                if (request.Deadline is null && !isHabit)
                    return BadRequest(new { message = "A recurring task needs a deadline to repeat from." });
                if (!RecurrenceRule.TryParse(request.Recurrence, out var rule, out var ruleError))
                    return BadRequest(new { message = ruleError });
                recurrence = rule!.Serialize();
                seriesId = Guid.NewGuid();
            }

            var task = new TaskModel
            {
                Title = request.Title.Trim(),
                Description = description,
                Deadline = request.Deadline,
                CreatedAt = DateTime.Now,
                // Null means the task goes to Inbox (uncategorized).
                ProjectId = request.ProjectId,
                Priority = priority,
                Recurrence = recurrence,
                SeriesId = seriesId,
                IsHabit = isHabit,
                WeeklyTarget = request.WeeklyTarget
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

            // isHabit: present + bool toggles whether the task is a habit. Absent leaves it.
            // Processed BEFORE recurrence/weeklyTarget so the effective habit state is known
            // when the deadline gate is evaluated below. Turning a habit off also clears its
            // weekly frequency target (a non-habit cannot be a frequency habit).
            if (body.TryGetProperty("isHabit", out var habitEl))
            {
                if (habitEl.ValueKind != JsonValueKind.True && habitEl.ValueKind != JsonValueKind.False)
                    return BadRequest(new { message = "isHabit must be a boolean." });
                task.IsHabit = habitEl.GetBoolean();
                if (!task.IsHabit) task.WeeklyTarget = null;
            }

            // A habit is scheduled on specific days (recurrence) OR a weekly target, never
            // both - reject a PATCH that tries to set both modes in one request.
            var settingRecurrence = body.TryGetProperty("recurrence", out var recurrenceEl)
                && recurrenceEl.ValueKind == JsonValueKind.String;
            var settingWeeklyTarget = body.TryGetProperty("weeklyTarget", out var weeklyEl)
                && weeklyEl.ValueKind == JsonValueKind.Number;
            if (settingRecurrence && settingWeeklyTarget)
                return BadRequest(new { message = "A habit is scheduled on specific days OR a weekly target, not both." });

            // recurrence: present + null clears it (task stops repeating; SeriesId nulled);
            // present + string sets/replaces it (validated). A recurring TASK requires a
            // deadline (possibly set in this same PATCH); a HABIT does not - it can carry a
            // deadline-free schedule (#75). Setting a recurrence clears any weekly target
            // (the two modes are mutually exclusive). Absent leaves it unchanged.
            if (body.TryGetProperty("recurrence", out recurrenceEl))
            {
                if (recurrenceEl.ValueKind == JsonValueKind.Null)
                {
                    task.Recurrence = null;
                    task.SeriesId = null;
                }
                else if (recurrenceEl.ValueKind == JsonValueKind.String)
                {
                    if (task.Deadline is null && !task.IsHabit)
                        return BadRequest(new { message = "A recurring task needs a deadline to repeat from." });
                    if (!RecurrenceRule.TryParse(recurrenceEl.GetString(), out var rule, out var ruleError))
                        return BadRequest(new { message = ruleError });
                    task.Recurrence = rule!.Serialize();
                    task.SeriesId ??= Guid.NewGuid();
                    task.WeeklyTarget = null;
                }
                else
                {
                    return BadRequest(new { message = "Recurrence must be an RRULE string or null." });
                }
            }

            // weeklyTarget: present + null clears it; present + number (1-7) sets the "x times
            // a week" frequency (habits only) and clears any specific-days recurrence. Absent
            // leaves it unchanged.
            if (body.TryGetProperty("weeklyTarget", out weeklyEl))
            {
                if (weeklyEl.ValueKind == JsonValueKind.Null)
                {
                    task.WeeklyTarget = null;
                }
                else if (weeklyEl.ValueKind == JsonValueKind.Number && weeklyEl.TryGetInt32(out var wt))
                {
                    if (wt < 1 || wt > 7)
                        return BadRequest(new { message = "Weekly target must be between 1 and 7." });
                    if (!task.IsHabit)
                        return BadRequest(new { message = "Only a habit can have a weekly frequency target." });
                    task.WeeklyTarget = wt;
                    task.Recurrence = null;
                    task.SeriesId = null;
                }
                else
                {
                    return BadRequest(new { message = "Weekly target must be a number (1-7) or null." });
                }
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
        // Marks a task as complete or incomplete. Returns the (completed) task.
        //
        // Recurring tasks: completing an open recurring occurrence keeps it as a completed
        // history row AND spawns the next occurrence (deadline advanced per the rule, the
        // task's fields carried forward under the same SeriesId), and logs a completion
        // comment on the row just finished. This is the only spawn path - both the web
        // checkbox and the MCP set_task_completion tool route through here. Bulk-complete
        // deliberately does NOT spawn (a documented core limitation).
        [HttpPatch("{id:int}/complete")]
        public async Task<IActionResult> Complete(int id, [FromBody] CompleteTaskRequest request)
        {
            // Load labels + subtasks too: a spawned occurrence carries the same labels, and
            // subtask completion/pull-out is resolved on this open -> completed transition.
            var task = await _context.Tasks
                .Include(t => t.Labels)
                .Include(t => t.Subtasks)
                .FirstOrDefaultAsync(t => t.Id == id);

            if (task is null)
                return NotFound(new { message = $"Task {id} not found." });

            // Only spawn on a genuine open -> completed transition, so re-completing an
            // already-completed task (or reopening it) never creates duplicate occurrences.
            var transitioningToComplete = request.IsCompleted && !task.IsCompleted;

            // Snapshot the subtask "template" (title + order) BEFORE any mutation below, so a
            // recurring task's next occurrence gets a fresh unchecked copy regardless of what
            // completeAll/pullOut does to this occurrence's rows. Deadlines are intentionally
            // dropped on the copy - a subtask deadline is tied to this occurrence; carrying a
            // past date onto the next one would render it instantly overdue.
            var subtaskTemplate = task.Subtasks
                .OrderBy(s => s.Position)
                .Select(s => new { s.Title, s.Position })
                .ToList();

            // Resolve open subtasks when the parent is being completed. completeAll (default)
            // ticks them; pullOut graduates each open subtask into a standalone task in the
            // parent's project (keeping its title/deadline, with a back-reference comment) and
            // detaches it from the parent.
            if (transitioningToComplete)
            {
                var openSubtasks = task.Subtasks.Where(s => !s.IsCompleted).ToList();
                if (openSubtasks.Count > 0)
                {
                    if (string.Equals(request.SubtaskMode, "pullOut", StringComparison.OrdinalIgnoreCase))
                    {
                        foreach (var s in openSubtasks)
                        {
                            var standalone = new TaskModel
                            {
                                Title = s.Title,
                                Deadline = s.Deadline,
                                CreatedAt = DateTime.Now,
                                ProjectId = task.ProjectId,
                            };
                            standalone.Comments.Add(new TaskComment
                            {
                                Body = $"Pulled out of \"{task.Title}\" on {DateTime.Now:yyyy-MM-dd}.",
                                CreatedAt = DateTime.Now,
                            });
                            _context.Tasks.Add(standalone);
                            _context.Subtasks.Remove(s);
                        }
                    }
                    else
                    {
                        // completeAll (also the default when no mode is supplied): tick them all.
                        foreach (var s in openSubtasks)
                            s.IsCompleted = true;
                    }
                }
            }

            task.IsCompleted = request.IsCompleted;
            // Record when the task was completed; clear it if marked incomplete again.
            task.CompletedAt = request.IsCompleted ? DateTime.Now : null;

            if (transitioningToComplete
                && task.Deadline is DateTime deadline
                && task.Recurrence is not null
                && RecurrenceRule.TryParse(task.Recurrence, out var rule, out _))
            {
                var next = rule!.NextDeadline(deadline);

                // End conditions (UNTIL / COUNT) are evaluated against how many occurrences
                // the series already has (this one included): completing occurrence #k sees
                // exactly k rows, so COUNT=n spawns while k < n, yielding n occurrences total.
                var seriesCount = task.SeriesId is Guid sid
                    ? await _context.Tasks.CountAsync(t => t.SeriesId == sid)
                    : 1;

                if (rule.ShouldSpawn(next, seriesCount))
                {
                    // The next open occurrence: a fresh row carrying the series' identity and
                    // fields. Completion state and comments are intentionally NOT carried -
                    // each occurrence tracks its own. Labels are shared (same Label entities).
                    var nextOccurrence = new TaskModel
                    {
                        Title = task.Title,
                        Description = task.Description,
                        Deadline = next,
                        CreatedAt = DateTime.Now,
                        ProjectId = task.ProjectId,
                        Priority = task.Priority,
                        Recurrence = task.Recurrence,
                        SeriesId = task.SeriesId
                    };
                    foreach (var label in task.Labels)
                        nextOccurrence.Labels.Add(label);

                    // Carry the subtask checklist to the next occurrence, reset to unchecked
                    // (a repeatable checklist). Title + order are preserved from the snapshot;
                    // per-occurrence deadlines are not carried (see the snapshot comment above).
                    foreach (var st in subtaskTemplate)
                        nextOccurrence.Subtasks.Add(new Subtask
                        {
                            Title = st.Title,
                            Position = st.Position,
                            IsCompleted = false,
                            CreatedAt = DateTime.Now,
                        });

                    _context.Tasks.Add(nextOccurrence);

                    // Log the completion on the row just finished - the seam habit-tracking
                    // (v2.17.0) reads from. Show a time only when the deadline carries one.
                    task.Comments.Add(new TaskComment
                    {
                        Body = $"Completed {DateTime.Now:yyyy-MM-dd}, next occurrence due {FormatOccurrenceDate(next)}.",
                        CreatedAt = DateTime.Now
                    });
                }
                else
                {
                    // End condition reached (UNTIL passed or COUNT met): the series stops here.
                    task.Comments.Add(new TaskComment
                    {
                        Body = $"Completed {DateTime.Now:yyyy-MM-dd} - recurrence series complete.",
                        CreatedAt = DateTime.Now
                    });
                }
            }

            await _context.SaveChangesAsync();

            return Ok(task);
        }

        // Format a spawned occurrence's deadline for the completion comment: date only for
        // a date-only (midnight) deadline, date + HH:mm when it carries a time of day.
        private static string FormatOccurrenceDate(DateTime when) =>
            when.TimeOfDay == TimeSpan.Zero ? when.ToString("yyyy-MM-dd") : when.ToString("yyyy-MM-dd HH:mm");

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
    // Description is optional free text (null/blank = none); Recurrence is an optional
    // RRULE-shaped string (requires a Deadline to anchor the repeat, UNLESS the task is a
    // habit); WeeklyTarget is an optional "x times a week" frequency (1-7, habits only,
    // mutually exclusive with Recurrence).
    public record CreateTaskRequest(string Title, DateTime? Deadline, int? ProjectId, int? Priority = null, string? Description = null, string? Recurrence = null, bool? IsHabit = null, int? WeeklyTarget = null);

    // Request body shape for toggling task completion. SubtaskMode (optional) decides what
    // happens to a completed parent's still-open subtasks: "completeAll" (default) ticks them,
    // "pullOut" graduates them into standalone tasks. Ignored when reopening or when the task
    // has no open subtasks.
    public record CompleteTaskRequest(bool IsCompleted, string? SubtaskMode = null);

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
        int? Limit = null,
        // When true, dated incomplete subtasks are projected into the result as their own
        // synthetic task-shaped rows (the web list uses this; MCP's list_tasks does not).
        bool? IncludeSubtasks = null);
}
