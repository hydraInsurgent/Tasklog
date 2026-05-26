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
}
