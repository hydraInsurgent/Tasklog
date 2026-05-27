using System.Text.Json;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Tasklog.Api.Controllers;
using Tasklog.Api.Data;
using Tasklog.Api.Models;

namespace Tasklog.Tests;

public class TasksControllerTests
{
    private static TasklogDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<TasklogDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new TasklogDbContext(options);
    }

    // --- GetAll ---

    // No-filter call (the historical contract): every task back, newest first.
    private static TaskFilterQuery EmptyFilter() => new(null, null, null, null, null, null, null);

    [Fact]
    public async Task GetAll_ReturnsTasksOrderedNewestFirst()
    {
        using var context = CreateContext();
        context.Tasks.AddRange(
            new TaskModel { Title = "Older", CreatedAt = DateTime.Now.AddDays(-2) },
            new TaskModel { Title = "Newer", CreatedAt = DateTime.Now }
        );
        await context.SaveChangesAsync();
        var controller = new TasksController(context);

        var result = await controller.GetAll(EmptyFilter());

        var ok = result.Should().BeOfType<OkObjectResult>().Subject;
        var tasks = ok.Value.Should().BeAssignableTo<IEnumerable<TaskModel>>().Subject.ToList();
        tasks[0].Title.Should().Be("Newer");
        tasks[1].Title.Should().Be("Older");
    }

    // --- GetAll: filters ---

    [Fact]
    public async Task GetAll_FilterByProjectIds_ReturnsOnlyTasksInThoseProjects()
    {
        using var context = CreateContext();
        var work = new Project { Name = "Work", CreatedAt = DateTime.Now };
        var personal = new Project { Name = "Personal", CreatedAt = DateTime.Now };
        var other = new Project { Name = "Other", CreatedAt = DateTime.Now };
        context.Projects.AddRange(work, personal, other);
        await context.SaveChangesAsync();

        context.Tasks.AddRange(
            new TaskModel { Title = "Work task", CreatedAt = DateTime.Now, ProjectId = work.Id },
            new TaskModel { Title = "Personal task", CreatedAt = DateTime.Now, ProjectId = personal.Id },
            new TaskModel { Title = "Other task", CreatedAt = DateTime.Now, ProjectId = other.Id },
            new TaskModel { Title = "Inbox task", CreatedAt = DateTime.Now, ProjectId = null }
        );
        await context.SaveChangesAsync();

        var controller = new TasksController(context);
        var result = await controller.GetAll(EmptyFilter() with { ProjectIds = new[] { work.Id, personal.Id } });

        var tasks = ExtractTasks(result);
        tasks.Should().HaveCount(2);
        tasks.Select(t => t.Title).Should().BeEquivalentTo(new[] { "Work task", "Personal task" });
    }

    [Fact]
    public async Task GetAll_FilterByInbox_ReturnsOnlyTasksWithNoProject()
    {
        using var context = CreateContext();
        var work = new Project { Name = "Work", CreatedAt = DateTime.Now };
        context.Projects.Add(work);
        await context.SaveChangesAsync();

        context.Tasks.AddRange(
            new TaskModel { Title = "Work task", CreatedAt = DateTime.Now, ProjectId = work.Id },
            new TaskModel { Title = "Inbox task 1", CreatedAt = DateTime.Now, ProjectId = null },
            new TaskModel { Title = "Inbox task 2", CreatedAt = DateTime.Now, ProjectId = null }
        );
        await context.SaveChangesAsync();

        var controller = new TasksController(context);
        var result = await controller.GetAll(EmptyFilter() with { Inbox = true });

        var tasks = ExtractTasks(result);
        tasks.Should().HaveCount(2);
        tasks.Should().OnlyContain(t => t.ProjectId == null);
    }

    [Fact]
    public async Task GetAll_FilterByInboxAndProjectIds_Returns400()
    {
        using var context = CreateContext();
        var controller = new TasksController(context);

        var result = await controller.GetAll(EmptyFilter() with { Inbox = true, ProjectIds = new[] { 1 } });

        result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task GetAll_FilterByLabelIds_ReturnsTasksWithAnyOfThoseLabels()
    {
        using var context = CreateContext();
        var urgent = new Label { Name = "urgent", ColorIndex = 0, CreatedAt = DateTime.Now };
        var today = new Label { Name = "today", ColorIndex = 1, CreatedAt = DateTime.Now };
        var other = new Label { Name = "other", ColorIndex = 2, CreatedAt = DateTime.Now };
        context.Labels.AddRange(urgent, today, other);
        await context.SaveChangesAsync();

        var t1 = new TaskModel { Title = "Urgent only", CreatedAt = DateTime.Now };
        t1.Labels.Add(urgent);
        var t2 = new TaskModel { Title = "Today only", CreatedAt = DateTime.Now };
        t2.Labels.Add(today);
        var t3 = new TaskModel { Title = "Other only", CreatedAt = DateTime.Now };
        t3.Labels.Add(other);
        var t4 = new TaskModel { Title = "No labels", CreatedAt = DateTime.Now };

        context.Tasks.AddRange(t1, t2, t3, t4);
        await context.SaveChangesAsync();

        var controller = new TasksController(context);
        var result = await controller.GetAll(EmptyFilter() with { LabelIds = new[] { urgent.Id, today.Id } });

        var tasks = ExtractTasks(result);
        tasks.Select(t => t.Title).Should().BeEquivalentTo(new[] { "Urgent only", "Today only" });
    }

    [Fact]
    public async Task GetAll_FilterByDueBefore_ExcludesTasksWithNoDeadline()
    {
        using var context = CreateContext();
        var cutoff = new DateTime(2026, 6, 1);
        context.Tasks.AddRange(
            new TaskModel { Title = "Past", CreatedAt = DateTime.Now, Deadline = new DateTime(2026, 1, 1) },
            new TaskModel { Title = "At cutoff", CreatedAt = DateTime.Now, Deadline = cutoff },
            new TaskModel { Title = "Future", CreatedAt = DateTime.Now, Deadline = new DateTime(2026, 12, 31) },
            new TaskModel { Title = "No deadline", CreatedAt = DateTime.Now, Deadline = null }
        );
        await context.SaveChangesAsync();

        var controller = new TasksController(context);
        var result = await controller.GetAll(EmptyFilter() with { DueBefore = cutoff });

        var tasks = ExtractTasks(result);
        tasks.Select(t => t.Title).Should().BeEquivalentTo(new[] { "Past", "At cutoff" });
    }

    [Fact]
    public async Task GetAll_FilterByDueAfter_ExcludesTasksWithNoDeadline()
    {
        using var context = CreateContext();
        var cutoff = new DateTime(2026, 6, 1);
        context.Tasks.AddRange(
            new TaskModel { Title = "Past", CreatedAt = DateTime.Now, Deadline = new DateTime(2026, 1, 1) },
            new TaskModel { Title = "At cutoff", CreatedAt = DateTime.Now, Deadline = cutoff },
            new TaskModel { Title = "Future", CreatedAt = DateTime.Now, Deadline = new DateTime(2026, 12, 31) },
            new TaskModel { Title = "No deadline", CreatedAt = DateTime.Now, Deadline = null }
        );
        await context.SaveChangesAsync();

        var controller = new TasksController(context);
        var result = await controller.GetAll(EmptyFilter() with { DueAfter = cutoff });

        var tasks = ExtractTasks(result);
        tasks.Select(t => t.Title).Should().BeEquivalentTo(new[] { "At cutoff", "Future" });
    }

    [Fact]
    public async Task GetAll_FilterByCompleted_True_ReturnsOnlyCompletedTasks()
    {
        using var context = CreateContext();
        context.Tasks.AddRange(
            new TaskModel { Title = "Done 1", CreatedAt = DateTime.Now, IsCompleted = true },
            new TaskModel { Title = "Done 2", CreatedAt = DateTime.Now, IsCompleted = true },
            new TaskModel { Title = "Pending", CreatedAt = DateTime.Now, IsCompleted = false }
        );
        await context.SaveChangesAsync();

        var controller = new TasksController(context);
        var result = await controller.GetAll(EmptyFilter() with { Completed = true });

        var tasks = ExtractTasks(result);
        tasks.Should().HaveCount(2);
        tasks.Should().OnlyContain(t => t.IsCompleted);
    }

    [Fact]
    public async Task GetAll_FilterByCompleted_False_ReturnsOnlyPendingTasks()
    {
        using var context = CreateContext();
        context.Tasks.AddRange(
            new TaskModel { Title = "Done", CreatedAt = DateTime.Now, IsCompleted = true },
            new TaskModel { Title = "Pending 1", CreatedAt = DateTime.Now, IsCompleted = false },
            new TaskModel { Title = "Pending 2", CreatedAt = DateTime.Now, IsCompleted = false }
        );
        await context.SaveChangesAsync();

        var controller = new TasksController(context);
        var result = await controller.GetAll(EmptyFilter() with { Completed = false });

        var tasks = ExtractTasks(result);
        tasks.Should().HaveCount(2);
        tasks.Should().OnlyContain(t => !t.IsCompleted);
    }

    [Fact]
    public async Task GetAll_FilterByText_CaseInsensitiveSubstringOnTitle()
    {
        using var context = CreateContext();
        context.Tasks.AddRange(
            new TaskModel { Title = "Review PR by Friday", CreatedAt = DateTime.Now },
            new TaskModel { Title = "Reply to email", CreatedAt = DateTime.Now },
            new TaskModel { Title = "Buy groceries", CreatedAt = DateTime.Now }
        );
        await context.SaveChangesAsync();

        var controller = new TasksController(context);

        // Lowercase query against mixed-case titles - should still match.
        var result = await controller.GetAll(EmptyFilter() with { Text = "review" });
        var tasks = ExtractTasks(result);
        tasks.Select(t => t.Title).Should().BeEquivalentTo(new[] { "Review PR by Friday" });
    }

    [Fact]
    public async Task GetAll_FilterByText_TrimsSurroundingWhitespace()
    {
        using var context = CreateContext();
        context.Tasks.AddRange(
            new TaskModel { Title = "Review PR by Friday", CreatedAt = DateTime.Now },
            new TaskModel { Title = "Buy groceries", CreatedAt = DateTime.Now }
        );
        await context.SaveChangesAsync();

        var controller = new TasksController(context);

        // Surrounding whitespace must not change the match (consistent with the
        // frontend and MCP layers, which also trim).
        var result = await controller.GetAll(EmptyFilter() with { Text = "  review  " });
        var tasks = ExtractTasks(result);
        tasks.Select(t => t.Title).Should().BeEquivalentTo(new[] { "Review PR by Friday" });
    }

    [Fact]
    public async Task GetAll_MultipleFilters_AndAcrossDimensions()
    {
        using var context = CreateContext();
        var work = new Project { Name = "Work", CreatedAt = DateTime.Now };
        var urgent = new Label { Name = "urgent", ColorIndex = 0, CreatedAt = DateTime.Now };
        context.Projects.Add(work);
        context.Labels.Add(urgent);
        await context.SaveChangesAsync();

        // The one task that matches everything: Work project + urgent label + future deadline + pending.
        var match = new TaskModel
        {
            Title = "The match",
            CreatedAt = DateTime.Now,
            ProjectId = work.Id,
            Deadline = new DateTime(2026, 8, 1),
            IsCompleted = false,
        };
        match.Labels.Add(urgent);

        // Various "almost matches" that fail one of the dimensions.
        var noLabel = new TaskModel { Title = "No label", CreatedAt = DateTime.Now, ProjectId = work.Id, Deadline = new DateTime(2026, 8, 1) };
        var wrongProject = new TaskModel { Title = "Other project", CreatedAt = DateTime.Now, Deadline = new DateTime(2026, 8, 1) };
        wrongProject.Labels.Add(urgent);
        var completed = new TaskModel { Title = "Completed", CreatedAt = DateTime.Now, ProjectId = work.Id, Deadline = new DateTime(2026, 8, 1), IsCompleted = true };
        completed.Labels.Add(urgent);

        context.Tasks.AddRange(match, noLabel, wrongProject, completed);
        await context.SaveChangesAsync();

        var controller = new TasksController(context);
        var result = await controller.GetAll(EmptyFilter() with
        {
            ProjectIds = new[] { work.Id },
            LabelIds = new[] { urgent.Id },
            DueAfter = new DateTime(2026, 7, 1),
            Completed = false,
        });

        var tasks = ExtractTasks(result);
        tasks.Select(t => t.Title).Should().BeEquivalentTo(new[] { "The match" });
    }

    // Helper to unwrap the OkObjectResult task list, keeps individual tests readable.
    private static List<TaskModel> ExtractTasks(IActionResult result)
    {
        var ok = result.Should().BeOfType<OkObjectResult>().Subject;
        return ok.Value.Should().BeAssignableTo<IEnumerable<TaskModel>>().Subject.ToList();
    }

    // --- GetById ---

    [Fact]
    public async Task GetById_WhenTaskExists_ReturnsOkWithTask()
    {
        using var context = CreateContext();
        var task = new TaskModel { Title = "My Task", CreatedAt = DateTime.Now };
        context.Tasks.Add(task);
        await context.SaveChangesAsync();
        var controller = new TasksController(context);

        var result = await controller.GetById(task.Id);

        var ok = result.Should().BeOfType<OkObjectResult>().Subject;
        ok.Value.Should().BeEquivalentTo(task);
    }

    [Fact]
    public async Task GetById_WhenTaskNotFound_Returns404()
    {
        using var context = CreateContext();
        var controller = new TasksController(context);

        var result = await controller.GetById(999);

        result.Should().BeOfType<NotFoundObjectResult>();
    }

    // --- Create ---

    [Fact]
    public async Task Create_WithValidTitle_ReturnsCreatedTask()
    {
        using var context = CreateContext();
        var controller = new TasksController(context);

        var result = await controller.Create(new CreateTaskRequest("Buy milk", null, null));

        var created = result.Should().BeOfType<CreatedAtActionResult>().Subject;
        var task = created.Value.Should().BeOfType<TaskModel>().Subject;
        task.Title.Should().Be("Buy milk");
        task.ProjectId.Should().BeNull();
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public async Task Create_WithEmptyOrWhitespaceTitle_ReturnsBadRequest(string title)
    {
        using var context = CreateContext();
        var controller = new TasksController(context);

        var result = await controller.Create(new CreateTaskRequest(title, null, null));

        result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task Create_TitleWithLeadingAndTrailingSpaces_IsTrimmed()
    {
        using var context = CreateContext();
        var controller = new TasksController(context);

        var result = await controller.Create(new CreateTaskRequest("  Buy milk  ", null, null));

        var created = result.Should().BeOfType<CreatedAtActionResult>().Subject;
        var task = created.Value.Should().BeOfType<TaskModel>().Subject;
        task.Title.Should().Be("Buy milk");
    }

    [Fact]
    public async Task Create_WithProjectId_AssignsProject()
    {
        using var context = CreateContext();
        var project = new Project { Name = "Work", CreatedAt = DateTime.UtcNow };
        context.Projects.Add(project);
        await context.SaveChangesAsync();
        var controller = new TasksController(context);

        var result = await controller.Create(new CreateTaskRequest("Write report", null, project.Id));

        var created = result.Should().BeOfType<CreatedAtActionResult>().Subject;
        var task = created.Value.Should().BeOfType<TaskModel>().Subject;
        task.ProjectId.Should().Be(project.Id);
    }

    // --- Update (partial PATCH via JsonElement) ---

    // Build a JsonElement from a JSON string. Clone() so it survives the
    // backing JsonDocument being disposed (RootElement alone would dangle).
    private static JsonElement Json(string json)
    {
        using var doc = JsonDocument.Parse(json);
        return doc.RootElement.Clone();
    }

    [Fact]
    public async Task Update_TitleOnly_ChangesTitleLeavesDeadline()
    {
        using var context = CreateContext();
        var deadline = new DateTime(2026, 8, 1);
        var task = new TaskModel { Title = "Old", CreatedAt = DateTime.Now, Deadline = deadline };
        context.Tasks.Add(task);
        await context.SaveChangesAsync();
        var controller = new TasksController(context);

        var result = await controller.Update(task.Id, Json("{\"title\":\"New title\"}"));

        var ok = result.Should().BeOfType<OkObjectResult>().Subject;
        var updated = ok.Value.Should().BeOfType<TaskModel>().Subject;
        updated.Title.Should().Be("New title");
        updated.Deadline.Should().Be(deadline); // unchanged - key was absent
    }

    [Fact]
    public async Task Update_TrimsTitle()
    {
        using var context = CreateContext();
        var task = new TaskModel { Title = "Old", CreatedAt = DateTime.Now };
        context.Tasks.Add(task);
        await context.SaveChangesAsync();
        var controller = new TasksController(context);

        await controller.Update(task.Id, Json("{\"title\":\"  Trimmed  \"}"));

        context.Tasks.Find(task.Id)!.Title.Should().Be("Trimmed");
    }

    [Fact]
    public async Task Update_DeadlineNull_ClearsDeadline()
    {
        using var context = CreateContext();
        var task = new TaskModel { Title = "T", CreatedAt = DateTime.Now, Deadline = new DateTime(2026, 8, 1) };
        context.Tasks.Add(task);
        await context.SaveChangesAsync();
        var controller = new TasksController(context);

        var result = await controller.Update(task.Id, Json("{\"deadline\":null}"));

        var ok = result.Should().BeOfType<OkObjectResult>().Subject;
        var updated = ok.Value.Should().BeOfType<TaskModel>().Subject;
        updated.Deadline.Should().BeNull();
        updated.Title.Should().Be("T"); // unchanged - key absent
    }

    [Fact]
    public async Task Update_DeadlineValue_SetsDeadline()
    {
        using var context = CreateContext();
        var task = new TaskModel { Title = "T", CreatedAt = DateTime.Now, Deadline = null };
        context.Tasks.Add(task);
        await context.SaveChangesAsync();
        var controller = new TasksController(context);

        await controller.Update(task.Id, Json("{\"deadline\":\"2026-12-31\"}"));

        context.Tasks.Find(task.Id)!.Deadline.Should().Be(new DateTime(2026, 12, 31));
    }

    [Fact]
    public async Task Update_BothFields_UpdatesBoth()
    {
        using var context = CreateContext();
        var task = new TaskModel { Title = "Old", CreatedAt = DateTime.Now, Deadline = null };
        context.Tasks.Add(task);
        await context.SaveChangesAsync();
        var controller = new TasksController(context);

        await controller.Update(task.Id, Json("{\"title\":\"New\",\"deadline\":\"2026-06-15\"}"));

        var saved = context.Tasks.Find(task.Id)!;
        saved.Title.Should().Be("New");
        saved.Deadline.Should().Be(new DateTime(2026, 6, 15));
    }

    [Fact]
    public async Task Update_EmptyBody_ChangesNothing()
    {
        using var context = CreateContext();
        var deadline = new DateTime(2026, 8, 1);
        var task = new TaskModel { Title = "Keep", CreatedAt = DateTime.Now, Deadline = deadline };
        context.Tasks.Add(task);
        await context.SaveChangesAsync();
        var controller = new TasksController(context);

        var result = await controller.Update(task.Id, Json("{}"));

        result.Should().BeOfType<OkObjectResult>();
        var saved = context.Tasks.Find(task.Id)!;
        saved.Title.Should().Be("Keep");
        saved.Deadline.Should().Be(deadline);
    }

    [Fact]
    public async Task Update_EmptyTitle_Returns400()
    {
        using var context = CreateContext();
        var task = new TaskModel { Title = "T", CreatedAt = DateTime.Now };
        context.Tasks.Add(task);
        await context.SaveChangesAsync();
        var controller = new TasksController(context);

        var result = await controller.Update(task.Id, Json("{\"title\":\"   \"}"));

        result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task Update_MalformedDeadline_Returns400()
    {
        using var context = CreateContext();
        var task = new TaskModel { Title = "T", CreatedAt = DateTime.Now };
        context.Tasks.Add(task);
        await context.SaveChangesAsync();
        var controller = new TasksController(context);

        var result = await controller.Update(task.Id, Json("{\"deadline\":\"not-a-date\"}"));

        result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task Update_UnknownId_Returns404()
    {
        using var context = CreateContext();
        var controller = new TasksController(context);

        var result = await controller.Update(999, Json("{\"title\":\"x\"}"));

        result.Should().BeOfType<NotFoundObjectResult>();
    }

    // --- Delete ---

    [Fact]
    public async Task Delete_WhenTaskExists_ReturnsNoContent()
    {
        using var context = CreateContext();
        var task = new TaskModel { Title = "To delete", CreatedAt = DateTime.Now };
        context.Tasks.Add(task);
        await context.SaveChangesAsync();
        var controller = new TasksController(context);

        var result = await controller.Delete(task.Id);

        result.Should().BeOfType<NoContentResult>();
        context.Tasks.Should().BeEmpty();
    }

    [Fact]
    public async Task Delete_WhenTaskNotFound_Returns404()
    {
        using var context = CreateContext();
        var controller = new TasksController(context);

        var result = await controller.Delete(999);

        result.Should().BeOfType<NotFoundObjectResult>();
    }

    // --- Complete ---

    [Fact]
    public async Task Complete_WhenMarkingAsComplete_SetsCompletedAt()
    {
        using var context = CreateContext();
        var task = new TaskModel { Title = "Do laundry", CreatedAt = DateTime.Now };
        context.Tasks.Add(task);
        await context.SaveChangesAsync();
        var controller = new TasksController(context);

        var result = await controller.Complete(task.Id, new CompleteTaskRequest(true));

        var ok = result.Should().BeOfType<OkObjectResult>().Subject;
        var updated = ok.Value.Should().BeOfType<TaskModel>().Subject;
        updated.IsCompleted.Should().BeTrue();
        updated.CompletedAt.Should().NotBeNull();
    }

    [Fact]
    public async Task Complete_WhenMarkingAsIncomplete_ClearsCompletedAt()
    {
        using var context = CreateContext();
        var task = new TaskModel { Title = "Do laundry", CreatedAt = DateTime.Now, IsCompleted = true, CompletedAt = DateTime.Now };
        context.Tasks.Add(task);
        await context.SaveChangesAsync();
        var controller = new TasksController(context);

        var result = await controller.Complete(task.Id, new CompleteTaskRequest(false));

        var ok = result.Should().BeOfType<OkObjectResult>().Subject;
        var updated = ok.Value.Should().BeOfType<TaskModel>().Subject;
        updated.IsCompleted.Should().BeFalse();
        updated.CompletedAt.Should().BeNull();
    }

    [Fact]
    public async Task Complete_WhenTaskNotFound_Returns404()
    {
        using var context = CreateContext();
        var controller = new TasksController(context);

        var result = await controller.Complete(999, new CompleteTaskRequest(true));

        result.Should().BeOfType<NotFoundObjectResult>();
    }

    // --- AssignProject ---

    [Fact]
    public async Task AssignProject_AssignsProjectToTask()
    {
        using var context = CreateContext();
        var task = new TaskModel { Title = "Inbox task", CreatedAt = DateTime.Now };
        var project = new Project { Name = "Work", CreatedAt = DateTime.UtcNow };
        context.Tasks.Add(task);
        context.Projects.Add(project);
        await context.SaveChangesAsync();
        var controller = new TasksController(context);

        var result = await controller.AssignProject(task.Id, new AssignProjectRequest(project.Id));

        var ok = result.Should().BeOfType<OkObjectResult>().Subject;
        var updated = ok.Value.Should().BeOfType<TaskModel>().Subject;
        updated.ProjectId.Should().Be(project.Id);
    }

    [Fact]
    public async Task AssignProject_WithNullProjectId_MovesTaskBackToInbox()
    {
        using var context = CreateContext();
        var project = new Project { Name = "Work", CreatedAt = DateTime.UtcNow };
        context.Projects.Add(project);
        await context.SaveChangesAsync();
        var task = new TaskModel { Title = "Work task", CreatedAt = DateTime.Now, ProjectId = project.Id };
        context.Tasks.Add(task);
        await context.SaveChangesAsync();
        var controller = new TasksController(context);

        var result = await controller.AssignProject(task.Id, new AssignProjectRequest(null));

        var ok = result.Should().BeOfType<OkObjectResult>().Subject;
        var updated = ok.Value.Should().BeOfType<TaskModel>().Subject;
        updated.ProjectId.Should().BeNull();
    }

    [Fact]
    public async Task AssignProject_WhenTaskNotFound_Returns404()
    {
        using var context = CreateContext();
        var controller = new TasksController(context);

        var result = await controller.AssignProject(999, new AssignProjectRequest(1));

        result.Should().BeOfType<NotFoundObjectResult>();
    }

    // --- Priority (#64) ---

    [Fact]
    public async Task Create_DefaultsPriorityTo4_WhenOmitted()
    {
        using var context = CreateContext();
        var controller = new TasksController(context);

        var result = await controller.Create(new CreateTaskRequest("No priority", null, null));

        var created = result.Should().BeOfType<CreatedAtActionResult>().Subject.Value.Should().BeOfType<TaskModel>().Subject;
        created.Priority.Should().Be(4);
    }

    [Fact]
    public async Task Create_SetsPriority_WhenProvided()
    {
        using var context = CreateContext();
        var controller = new TasksController(context);

        var result = await controller.Create(new CreateTaskRequest("Urgent", null, null, 1));

        var created = result.Should().BeOfType<CreatedAtActionResult>().Subject.Value.Should().BeOfType<TaskModel>().Subject;
        created.Priority.Should().Be(1);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(5)]
    public async Task Create_OutOfRangePriority_Returns400(int priority)
    {
        using var context = CreateContext();
        var controller = new TasksController(context);

        var result = await controller.Create(new CreateTaskRequest("Bad", null, null, priority));

        result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task Update_SetsPriority_WhenProvided()
    {
        using var context = CreateContext();
        var task = new TaskModel { Title = "T", CreatedAt = DateTime.Now, Priority = 4 };
        context.Tasks.Add(task);
        await context.SaveChangesAsync();
        var controller = new TasksController(context);

        var result = await controller.Update(task.Id, Json("{\"priority\": 2}"));

        var updated = result.Should().BeOfType<OkObjectResult>().Subject.Value.Should().BeOfType<TaskModel>().Subject;
        updated.Priority.Should().Be(2);
    }

    [Fact]
    public async Task Update_OmittedPriority_LeavesItUnchanged()
    {
        using var context = CreateContext();
        var task = new TaskModel { Title = "T", CreatedAt = DateTime.Now, Priority = 1 };
        context.Tasks.Add(task);
        await context.SaveChangesAsync();
        var controller = new TasksController(context);

        var result = await controller.Update(task.Id, Json("{\"title\": \"renamed\"}"));

        var updated = result.Should().BeOfType<OkObjectResult>().Subject.Value.Should().BeOfType<TaskModel>().Subject;
        updated.Priority.Should().Be(1);
    }

    [Theory]
    [InlineData("{\"priority\": 0}")]
    [InlineData("{\"priority\": 9}")]
    [InlineData("{\"priority\": -1}")]   // negative is below the P1-P4 range
    [InlineData("{\"priority\": 2.5}")]  // a float is not a valid priority (TryGetInt32 fails)
    [InlineData("{\"priority\": \"high\"}")]
    public async Task Update_BadPriority_Returns400(string json)
    {
        using var context = CreateContext();
        var task = new TaskModel { Title = "T", CreatedAt = DateTime.Now };
        context.Tasks.Add(task);
        await context.SaveChangesAsync();
        var controller = new TasksController(context);

        var result = await controller.Update(task.Id, Json(json));

        result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task GetAll_PrioritiesFilter_ReturnsMatchingTasks()
    {
        using var context = CreateContext();
        context.Tasks.AddRange(
            new TaskModel { Title = "p1", CreatedAt = DateTime.Now, Priority = 1 },
            new TaskModel { Title = "p2", CreatedAt = DateTime.Now, Priority = 2 },
            new TaskModel { Title = "p4", CreatedAt = DateTime.Now, Priority = 4 }
        );
        await context.SaveChangesAsync();
        var controller = new TasksController(context);

        // Single value.
        var single = await controller.GetAll(new TaskFilterQuery(null, null, null, null, null, null, null, new[] { 1 }));
        var onlyP1 = single.Should().BeOfType<OkObjectResult>().Subject.Value.Should().BeAssignableTo<IEnumerable<TaskModel>>().Subject;
        onlyP1.Should().OnlyContain(t => t.Priority == 1);

        // Multiple values - OR within.
        var multi = await controller.GetAll(new TaskFilterQuery(null, null, null, null, null, null, null, new[] { 1, 2 }));
        var p1OrP2 = multi.Should().BeOfType<OkObjectResult>().Subject.Value.Should().BeAssignableTo<IEnumerable<TaskModel>>().Subject;
        p1OrP2.Should().OnlyContain(t => t.Priority == 1 || t.Priority == 2);
        p1OrP2.Should().HaveCount(2);
    }

    // --- Bulk (POST /api/tasks/bulk) ---

    // Seeds three tasks and returns their ids alongside the controller + context.
    private static async Task<(TasksController controller, TasklogDbContext context, List<int> ids)> SeedThreeTasks()
    {
        var context = CreateContext();
        var tasks = new[]
        {
            new TaskModel { Title = "A", CreatedAt = DateTime.Now },
            new TaskModel { Title = "B", CreatedAt = DateTime.Now },
            new TaskModel { Title = "C", CreatedAt = DateTime.Now },
        };
        context.Tasks.AddRange(tasks);
        await context.SaveChangesAsync();
        return (new TasksController(context), context, tasks.Select(t => t.Id).ToList());
    }

    [Fact]
    public async Task Bulk_Complete_SetsIsCompletedAndCompletedAt_OnAll()
    {
        var (controller, context, ids) = await SeedThreeTasks();
        using var _ = context;

        var result = await controller.Bulk(new BulkTaskRequest("complete", ids, new BulkTaskData(true, null, null)));

        var tasks = result.Should().BeOfType<OkObjectResult>().Subject.Value.Should().BeAssignableTo<List<TaskModel>>().Subject;
        tasks.Should().HaveCount(3);
        tasks.Should().OnlyContain(t => t.IsCompleted && t.CompletedAt != null);
    }

    [Fact]
    public async Task Bulk_Complete_False_ClearsCompletedAt_OnAll()
    {
        var (controller, context, ids) = await SeedThreeTasks();
        using var _ = context;
        // Pre-complete them so the false path has something to clear.
        await controller.Bulk(new BulkTaskRequest("complete", ids, new BulkTaskData(true, null, null)));

        var result = await controller.Bulk(new BulkTaskRequest("complete", ids, new BulkTaskData(false, null, null)));

        var tasks = result.Should().BeOfType<OkObjectResult>().Subject.Value.Should().BeAssignableTo<List<TaskModel>>().Subject;
        tasks.Should().OnlyContain(t => !t.IsCompleted && t.CompletedAt == null);
    }

    [Fact]
    public async Task Bulk_Complete_MissingIsCompleted_Returns400()
    {
        var (controller, context, ids) = await SeedThreeTasks();
        using var _ = context;

        var result = await controller.Bulk(new BulkTaskRequest("complete", ids, new BulkTaskData(null, null, null)));

        result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task Bulk_AssignProject_MovesAll()
    {
        var (controller, context, ids) = await SeedThreeTasks();
        using var _ = context;
        var project = new Project { Name = "Work", CreatedAt = DateTime.UtcNow };
        context.Projects.Add(project);
        await context.SaveChangesAsync();

        var result = await controller.Bulk(new BulkTaskRequest("assignProject", ids, new BulkTaskData(null, project.Id, null)));

        var tasks = result.Should().BeOfType<OkObjectResult>().Subject.Value.Should().BeAssignableTo<List<TaskModel>>().Subject;
        tasks.Should().OnlyContain(t => t.ProjectId == project.Id);
    }

    [Fact]
    public async Task Bulk_AssignProject_NullMovesAllToInbox()
    {
        var (controller, context, ids) = await SeedThreeTasks();
        using var _ = context;

        var result = await controller.Bulk(new BulkTaskRequest("assignProject", ids, new BulkTaskData(null, null, null)));

        var tasks = result.Should().BeOfType<OkObjectResult>().Subject.Value.Should().BeAssignableTo<List<TaskModel>>().Subject;
        tasks.Should().OnlyContain(t => t.ProjectId == null);
    }

    [Fact]
    public async Task Bulk_AssignProject_MissingProject_Returns400()
    {
        var (controller, context, ids) = await SeedThreeTasks();
        using var _ = context;

        var result = await controller.Bulk(new BulkTaskRequest("assignProject", ids, new BulkTaskData(null, 999, null)));

        result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task Bulk_SetDeadline_SetsOnAll()
    {
        var (controller, context, ids) = await SeedThreeTasks();
        using var _ = context;

        var result = await controller.Bulk(new BulkTaskRequest("setDeadline", ids, new BulkTaskData(null, null, "2026-12-31")));

        var tasks = result.Should().BeOfType<OkObjectResult>().Subject.Value.Should().BeAssignableTo<List<TaskModel>>().Subject;
        tasks.Should().OnlyContain(t => t.Deadline == new DateTime(2026, 12, 31));
    }

    [Fact]
    public async Task Bulk_SetDeadline_NullClearsOnAll()
    {
        var (controller, context, ids) = await SeedThreeTasks();
        using var _ = context;
        await controller.Bulk(new BulkTaskRequest("setDeadline", ids, new BulkTaskData(null, null, "2026-12-31")));

        var result = await controller.Bulk(new BulkTaskRequest("setDeadline", ids, new BulkTaskData(null, null, null)));

        var tasks = result.Should().BeOfType<OkObjectResult>().Subject.Value.Should().BeAssignableTo<List<TaskModel>>().Subject;
        tasks.Should().OnlyContain(t => t.Deadline == null);
    }

    [Fact]
    public async Task Bulk_SetDeadline_BadDate_Returns400()
    {
        var (controller, context, ids) = await SeedThreeTasks();
        using var _ = context;

        var result = await controller.Bulk(new BulkTaskRequest("setDeadline", ids, new BulkTaskData(null, null, "not-a-date")));

        result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task Bulk_EmptyTaskIds_Returns400()
    {
        using var context = CreateContext();
        var controller = new TasksController(context);

        var result = await controller.Bulk(new BulkTaskRequest("complete", new List<int>(), new BulkTaskData(true, null, null)));

        result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task Bulk_TooManyTaskIds_Returns400()
    {
        using var context = CreateContext();
        var controller = new TasksController(context);
        // 501 ids exceeds the server-side cap of 500.
        var tooMany = Enumerable.Range(1, 501).ToList();

        var result = await controller.Bulk(new BulkTaskRequest("complete", tooMany, new BulkTaskData(true, null, null)));

        result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task Bulk_UnknownOperation_Returns400()
    {
        var (controller, context, ids) = await SeedThreeTasks();
        using var _ = context;

        var result = await controller.Bulk(new BulkTaskRequest("explode", ids, null));

        result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task Bulk_UnknownIds_AreSkipped_ReturnsOnlyExisting()
    {
        var (controller, context, ids) = await SeedThreeTasks();
        using var _ = context;
        // Two real ids + one that does not exist.
        var mixed = new List<int> { ids[0], ids[1], 999999 };

        var result = await controller.Bulk(new BulkTaskRequest("complete", mixed, new BulkTaskData(true, null, null)));

        var tasks = result.Should().BeOfType<OkObjectResult>().Subject.Value.Should().BeAssignableTo<List<TaskModel>>().Subject;
        tasks.Should().HaveCount(2);
        tasks.Select(t => t.Id).Should().BeEquivalentTo(new[] { ids[0], ids[1] });
    }

    // --- GetAll: createdAt range, sort, limit (#65) ---

    // Extracts the ordered task list from a GetAll OkObjectResult.
    private static List<TaskModel> Tasks(IActionResult result) =>
        result.Should().BeOfType<OkObjectResult>().Subject.Value
            .Should().BeAssignableTo<IEnumerable<TaskModel>>().Subject.ToList();

    [Fact]
    public async Task GetAll_CreatedAfter_ReturnsTasksCreatedOnOrAfter()
    {
        using var context = CreateContext();
        context.Tasks.AddRange(
            new TaskModel { Title = "old", CreatedAt = new DateTime(2026, 1, 1) },
            new TaskModel { Title = "new", CreatedAt = new DateTime(2026, 6, 1) }
        );
        await context.SaveChangesAsync();
        var controller = new TasksController(context);

        var result = await controller.GetAll(new TaskFilterQuery(null, null, null, null, null, null, null, CreatedAfter: new DateTime(2026, 3, 1)));

        Tasks(result).Should().ContainSingle().Which.Title.Should().Be("new");
    }

    [Fact]
    public async Task GetAll_CreatedBefore_ReturnsTasksCreatedOnOrBefore()
    {
        using var context = CreateContext();
        context.Tasks.AddRange(
            new TaskModel { Title = "old", CreatedAt = new DateTime(2026, 1, 1) },
            new TaskModel { Title = "new", CreatedAt = new DateTime(2026, 6, 1) }
        );
        await context.SaveChangesAsync();
        var controller = new TasksController(context);

        var result = await controller.GetAll(new TaskFilterQuery(null, null, null, null, null, null, null, CreatedBefore: new DateTime(2026, 3, 1)));

        Tasks(result).Should().ContainSingle().Which.Title.Should().Be("old");
    }

    [Fact]
    public async Task GetAll_SortDeadlineAsc_OrdersEarliestFirstNullsLast()
    {
        using var context = CreateContext();
        context.Tasks.AddRange(
            new TaskModel { Title = "none", CreatedAt = DateTime.Now, Deadline = null },
            new TaskModel { Title = "late", CreatedAt = DateTime.Now, Deadline = new DateTime(2026, 12, 31) },
            new TaskModel { Title = "early", CreatedAt = DateTime.Now, Deadline = new DateTime(2026, 6, 1) }
        );
        await context.SaveChangesAsync();
        var controller = new TasksController(context);

        var result = await controller.GetAll(new TaskFilterQuery(null, null, null, null, null, null, null, Sort: "deadline", Order: "asc"));

        Tasks(result).Select(t => t.Title).Should().Equal("early", "late", "none");
    }

    [Fact]
    public async Task GetAll_SortDeadlineDesc_OrdersLatestFirstNullsLast()
    {
        using var context = CreateContext();
        context.Tasks.AddRange(
            new TaskModel { Title = "none", CreatedAt = DateTime.Now, Deadline = null },
            new TaskModel { Title = "late", CreatedAt = DateTime.Now, Deadline = new DateTime(2026, 12, 31) },
            new TaskModel { Title = "early", CreatedAt = DateTime.Now, Deadline = new DateTime(2026, 6, 1) }
        );
        await context.SaveChangesAsync();
        var controller = new TasksController(context);

        var result = await controller.GetAll(new TaskFilterQuery(null, null, null, null, null, null, null, Sort: "deadline", Order: "desc"));

        // Nulls stay last even in descending order.
        Tasks(result).Select(t => t.Title).Should().Equal("late", "early", "none");
    }

    [Fact]
    public async Task GetAll_SortPriorityAsc_P1First()
    {
        using var context = CreateContext();
        context.Tasks.AddRange(
            new TaskModel { Title = "p4", CreatedAt = DateTime.Now, Priority = 4 },
            new TaskModel { Title = "p1", CreatedAt = DateTime.Now, Priority = 1 },
            new TaskModel { Title = "p2", CreatedAt = DateTime.Now, Priority = 2 }
        );
        await context.SaveChangesAsync();
        var controller = new TasksController(context);

        var result = await controller.GetAll(new TaskFilterQuery(null, null, null, null, null, null, null, Sort: "priority", Order: "asc"));

        Tasks(result).Select(t => t.Title).Should().Equal("p1", "p2", "p4");
    }

    [Fact]
    public async Task GetAll_SortPriorityDesc_P4First()
    {
        using var context = CreateContext();
        context.Tasks.AddRange(
            new TaskModel { Title = "p4", CreatedAt = DateTime.Now, Priority = 4 },
            new TaskModel { Title = "p1", CreatedAt = DateTime.Now, Priority = 1 }
        );
        await context.SaveChangesAsync();
        var controller = new TasksController(context);

        var result = await controller.GetAll(new TaskFilterQuery(null, null, null, null, null, null, null, Sort: "priority", Order: "desc"));

        Tasks(result).Select(t => t.Title).Should().Equal("p4", "p1");
    }

    [Fact]
    public async Task GetAll_SortCreatedAsc_OldestFirst()
    {
        using var context = CreateContext();
        context.Tasks.AddRange(
            new TaskModel { Title = "older", CreatedAt = new DateTime(2026, 1, 1) },
            new TaskModel { Title = "newer", CreatedAt = new DateTime(2026, 6, 1) }
        );
        await context.SaveChangesAsync();
        var controller = new TasksController(context);

        var result = await controller.GetAll(new TaskFilterQuery(null, null, null, null, null, null, null, Sort: "created", Order: "asc"));

        Tasks(result).Select(t => t.Title).Should().Equal("older", "newer");
    }

    [Fact]
    public async Task GetAll_Limit_CapsToMostRecentN()
    {
        using var context = CreateContext();
        context.Tasks.AddRange(
            new TaskModel { Title = "oldest", CreatedAt = new DateTime(2026, 1, 1) },
            new TaskModel { Title = "middle", CreatedAt = new DateTime(2026, 3, 1) },
            new TaskModel { Title = "newest", CreatedAt = new DateTime(2026, 6, 1) }
        );
        await context.SaveChangesAsync();
        var controller = new TasksController(context);

        // Default sort is created desc, so a limit of 2 returns the two newest.
        var result = await controller.GetAll(new TaskFilterQuery(null, null, null, null, null, null, null, Limit: 2));

        Tasks(result).Select(t => t.Title).Should().Equal("newest", "middle");
    }

    [Fact]
    public async Task GetAll_LimitBelowOne_Returns400()
    {
        using var context = CreateContext();
        var controller = new TasksController(context);

        var result = await controller.GetAll(new TaskFilterQuery(null, null, null, null, null, null, null, Limit: 0));

        result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task GetAll_DefaultCall_ReturnsAllNewestFirst()
    {
        using var context = CreateContext();
        context.Tasks.AddRange(
            new TaskModel { Title = "older", CreatedAt = new DateTime(2026, 1, 1) },
            new TaskModel { Title = "newer", CreatedAt = new DateTime(2026, 6, 1) }
        );
        await context.SaveChangesAsync();
        var controller = new TasksController(context);

        var result = await controller.GetAll(EmptyFilter());

        // Unchanged historical behaviour: every row, newest CreatedAt first.
        Tasks(result).Select(t => t.Title).Should().Equal("newer", "older");
    }

    // --- Agent ergonomics: bulk setPriority + name resolution (#66) ---

    [Fact]
    public async Task Bulk_SetPriority_SetsOnAll()
    {
        var (controller, context, ids) = await SeedThreeTasks();
        using var _ = context;

        var result = await controller.Bulk(new BulkTaskRequest("setPriority", ids, new BulkTaskData(null, null, null, Priority: 1)));

        var tasks = result.Should().BeOfType<OkObjectResult>().Subject.Value.Should().BeAssignableTo<List<TaskModel>>().Subject;
        tasks.Should().OnlyContain(t => t.Priority == 1);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(5)]
    public async Task Bulk_SetPriority_OutOfRange_Returns400(int priority)
    {
        var (controller, context, ids) = await SeedThreeTasks();
        using var _ = context;

        var result = await controller.Bulk(new BulkTaskRequest("setPriority", ids, new BulkTaskData(null, null, null, Priority: priority)));

        result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task Bulk_SetPriority_MissingPriority_Returns400()
    {
        var (controller, context, ids) = await SeedThreeTasks();
        using var _ = context;

        var result = await controller.Bulk(new BulkTaskRequest("setPriority", ids, new BulkTaskData(null, null, null)));

        result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task AssignProject_ByName_ResolvesToTheProject()
    {
        using var context = CreateContext();
        var project = new Project { Name = "Work", CreatedAt = DateTime.UtcNow };
        context.Projects.Add(project);
        var task = new TaskModel { Title = "t", CreatedAt = DateTime.Now };
        context.Tasks.Add(task);
        await context.SaveChangesAsync();
        var controller = new TasksController(context);

        // Case-insensitive match.
        var result = await controller.AssignProject(task.Id, new AssignProjectRequest(null, ProjectName: "work"));

        var updated = result.Should().BeOfType<OkObjectResult>().Subject.Value.Should().BeOfType<TaskModel>().Subject;
        updated.ProjectId.Should().Be(project.Id);
    }

    [Fact]
    public async Task AssignProject_ByName_Ambiguous_Returns400()
    {
        using var context = CreateContext();
        context.Projects.AddRange(
            new Project { Name = "Work", CreatedAt = DateTime.UtcNow },
            new Project { Name = "work", CreatedAt = DateTime.UtcNow }
        );
        var task = new TaskModel { Title = "t", CreatedAt = DateTime.Now };
        context.Tasks.Add(task);
        await context.SaveChangesAsync();
        var controller = new TasksController(context);

        var result = await controller.AssignProject(task.Id, new AssignProjectRequest(null, ProjectName: "Work"));

        result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task AssignProject_ByName_Missing_Returns400()
    {
        using var context = CreateContext();
        var task = new TaskModel { Title = "t", CreatedAt = DateTime.Now };
        context.Tasks.Add(task);
        await context.SaveChangesAsync();
        var controller = new TasksController(context);

        var result = await controller.AssignProject(task.Id, new AssignProjectRequest(null, ProjectName: "Nope"));

        result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task AssignProject_NameWinsOverId()
    {
        using var context = CreateContext();
        var work = new Project { Name = "Work", CreatedAt = DateTime.UtcNow };
        var home = new Project { Name = "Home", CreatedAt = DateTime.UtcNow };
        context.Projects.AddRange(work, home);
        var task = new TaskModel { Title = "t", CreatedAt = DateTime.Now };
        context.Tasks.Add(task);
        await context.SaveChangesAsync();
        var controller = new TasksController(context);

        // Pass a (wrong) id AND a name - the name should win.
        var result = await controller.AssignProject(task.Id, new AssignProjectRequest(home.Id, ProjectName: "Work"));

        var updated = result.Should().BeOfType<OkObjectResult>().Subject.Value.Should().BeOfType<TaskModel>().Subject;
        updated.ProjectId.Should().Be(work.Id);
    }

    [Fact]
    public async Task SetLabels_ByName_ResolvesAndApplies()
    {
        using var context = CreateContext();
        var urgent = new Label { Name = "urgent", ColorIndex = 0, CreatedAt = DateTime.UtcNow };
        context.Labels.Add(urgent);
        var task = new TaskModel { Title = "t", CreatedAt = DateTime.Now };
        context.Tasks.Add(task);
        await context.SaveChangesAsync();
        var controller = new TasksController(context);

        var result = await controller.SetLabels(task.Id, new SetTaskLabelsRequest(LabelNames: new[] { "URGENT" }));

        var updated = result.Should().BeOfType<OkObjectResult>().Subject.Value.Should().BeOfType<TaskModel>().Subject;
        updated.Labels.Select(l => l.Id).Should().Equal(urgent.Id);
    }

    [Fact]
    public async Task SetLabels_ByName_UnknownName_Returns400()
    {
        using var context = CreateContext();
        var task = new TaskModel { Title = "t", CreatedAt = DateTime.Now };
        context.Tasks.Add(task);
        await context.SaveChangesAsync();
        var controller = new TasksController(context);

        var result = await controller.SetLabels(task.Id, new SetTaskLabelsRequest(LabelNames: new[] { "ghost" }));

        result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task Bulk_AssignProject_ByName_Resolves()
    {
        var (controller, context, ids) = await SeedThreeTasks();
        using var _ = context;
        var project = new Project { Name = "Work", CreatedAt = DateTime.UtcNow };
        context.Projects.Add(project);
        await context.SaveChangesAsync();

        var result = await controller.Bulk(new BulkTaskRequest("assignProject", ids, new BulkTaskData(null, null, null, ProjectName: "Work")));

        var tasks = result.Should().BeOfType<OkObjectResult>().Subject.Value.Should().BeAssignableTo<List<TaskModel>>().Subject;
        tasks.Should().OnlyContain(t => t.ProjectId == project.Id);
    }
}
