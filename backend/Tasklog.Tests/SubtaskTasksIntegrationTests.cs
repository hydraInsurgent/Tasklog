using FluentAssertions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Tasklog.Api.Controllers;
using Tasklog.Api.Data;
using Tasklog.Api.Models;

namespace Tasklog.Tests;

// Covers how subtasks flow through TasksController: the list counts + projection, and the
// parent-completion modes (completeAll / pullOut) plus the recurrence reset-copy.
public class SubtaskTasksIntegrationTests
{
    private static TasklogDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<TasklogDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new TasklogDbContext(options);
    }

    private static async Task<TaskModel> SeedTaskWithSubtasks(TasklogDbContext context, params Subtask[] subtasks)
    {
        var task = new TaskModel { Title = "Parent", CreatedAt = DateTime.Now };
        context.Tasks.Add(task);
        await context.SaveChangesAsync();
        foreach (var s in subtasks) s.TaskId = task.Id;
        context.Subtasks.AddRange(subtasks);
        await context.SaveChangesAsync();
        return task;
    }

    private static List<TaskModel> Ok(IActionResult result) =>
        (result as OkObjectResult)!.Value as List<TaskModel> ?? new List<TaskModel>();

    // A filter that only sets IncludeSubtasks (everything else default/null).
    private static TaskFilterQuery Filter(bool? includeSubtasks = null, bool? completed = null) =>
        new(null, null, null, null, null, completed, null, IncludeSubtasks: includeSubtasks);

    [Fact]
    public async Task GetAll_PopulatesSubtaskCounts()
    {
        using var context = CreateContext();
        await SeedTaskWithSubtasks(context,
            new Subtask { Title = "a", Position = 0, IsCompleted = true, CreatedAt = DateTime.Now },
            new Subtask { Title = "b", Position = 1, IsCompleted = false, CreatedAt = DateTime.Now });
        var controller = new TasksController(context);

        var tasks = Ok(await controller.GetAll(Filter()));

        var parent = tasks.Single(t => !t.IsSubtask);
        parent.SubtaskCount.Should().Be(2);
        parent.CompletedSubtaskCount.Should().Be(1);
    }

    [Fact]
    public async Task GetAll_WithIncludeSubtasks_ProjectsDatedIncompleteSubtaskAsRow()
    {
        using var context = CreateContext();
        var parent = await SeedTaskWithSubtasks(context,
            new Subtask { Title = "dated open", Position = 0, Deadline = new DateTime(2026, 9, 1), CreatedAt = DateTime.Now },
            new Subtask { Title = "undated open", Position = 1, CreatedAt = DateTime.Now },
            new Subtask { Title = "dated done", Position = 2, Deadline = new DateTime(2026, 9, 2), IsCompleted = true, CreatedAt = DateTime.Now });
        var controller = new TasksController(context);

        var tasks = Ok(await controller.GetAll(Filter(includeSubtasks: true)));

        // Only the dated + incomplete subtask is projected as its own row.
        var projected = tasks.Where(t => t.IsSubtask).ToList();
        projected.Should().HaveCount(1);
        projected[0].Title.Should().Be("dated open");
        projected[0].ParentTaskId.Should().Be(parent.Id);
        projected[0].ParentTitle.Should().Be("Parent");
    }

    [Fact]
    public async Task GetAll_WithoutIncludeSubtasks_DoesNotProject()
    {
        using var context = CreateContext();
        await SeedTaskWithSubtasks(context,
            new Subtask { Title = "dated open", Position = 0, Deadline = new DateTime(2026, 9, 1), CreatedAt = DateTime.Now });
        var controller = new TasksController(context);

        var tasks = Ok(await controller.GetAll(Filter(includeSubtasks: null)));

        tasks.Any(t => t.IsSubtask).Should().BeFalse();
        // Counts are still populated via the grouped query.
        tasks.Single().SubtaskCount.Should().Be(1);
    }

    [Fact]
    public async Task GetAll_CompletedFilter_SkipsProjection()
    {
        using var context = CreateContext();
        await SeedTaskWithSubtasks(context,
            new Subtask { Title = "dated open", Position = 0, Deadline = new DateTime(2026, 9, 1), CreatedAt = DateTime.Now });
        var controller = new TasksController(context);

        // Asking only for completed tasks must not inject the (incomplete) projected subtask rows.
        var tasks = Ok(await controller.GetAll(Filter(includeSubtasks: true, completed: true)));

        tasks.Any(t => t.IsSubtask).Should().BeFalse();
    }

    [Fact]
    public async Task GetAll_Projection_RespectsParentProjectFilter()
    {
        using var context = CreateContext();
        var projA = new Project { Name = "A", CreatedAt = DateTime.Now };
        var projB = new Project { Name = "B", CreatedAt = DateTime.Now };
        context.Projects.AddRange(projA, projB);
        await context.SaveChangesAsync();
        var inA = new TaskModel { Title = "in A", ProjectId = projA.Id, CreatedAt = DateTime.Now };
        var inB = new TaskModel { Title = "in B", ProjectId = projB.Id, CreatedAt = DateTime.Now };
        context.Tasks.AddRange(inA, inB);
        await context.SaveChangesAsync();
        context.Subtasks.AddRange(
            new Subtask { TaskId = inA.Id, Title = "sub A", Position = 0, Deadline = new DateTime(2026, 9, 1), CreatedAt = DateTime.Now },
            new Subtask { TaskId = inB.Id, Title = "sub B", Position = 0, Deadline = new DateTime(2026, 9, 1), CreatedAt = DateTime.Now });
        await context.SaveChangesAsync();
        var controller = new TasksController(context);

        // Filtering to project A must project only A's subtask (the projection follows the
        // parents that survived the filter).
        var filter = new TaskFilterQuery(new[] { projA.Id }, null, null, null, null, null, null, IncludeSubtasks: true);
        var tasks = Ok(await controller.GetAll(filter));

        var projected = tasks.Where(t => t.IsSubtask).ToList();
        projected.Should().ContainSingle();
        projected[0].Title.Should().Be("sub A");
    }

    [Fact]
    public async Task Complete_CompleteAll_TicksAllOpenSubtasks()
    {
        using var context = CreateContext();
        var parent = await SeedTaskWithSubtasks(context,
            new Subtask { Title = "a", Position = 0, CreatedAt = DateTime.Now },
            new Subtask { Title = "b", Position = 1, CreatedAt = DateTime.Now });
        var controller = new TasksController(context);

        await controller.Complete(parent.Id, new CompleteTaskRequest(true, "completeAll"));

        (await context.Subtasks.Where(s => s.TaskId == parent.Id).AllAsync(s => s.IsCompleted)).Should().BeTrue();
    }

    [Fact]
    public async Task Complete_DefaultMode_TicksAllOpenSubtasks()
    {
        using var context = CreateContext();
        var parent = await SeedTaskWithSubtasks(context,
            new Subtask { Title = "a", Position = 0, CreatedAt = DateTime.Now });
        var controller = new TasksController(context);

        // No mode supplied -> completeAll is the default.
        await controller.Complete(parent.Id, new CompleteTaskRequest(true));

        (await context.Subtasks.SingleAsync(s => s.TaskId == parent.Id)).IsCompleted.Should().BeTrue();
    }

    [Fact]
    public async Task Complete_PullOut_CreatesStandaloneTasksAndDetaches()
    {
        using var context = CreateContext();
        var project = new Project { Name = "Work", CreatedAt = DateTime.Now };
        context.Projects.Add(project);
        await context.SaveChangesAsync();
        var parent = new TaskModel { Title = "Parent", ProjectId = project.Id, CreatedAt = DateTime.Now };
        context.Tasks.Add(parent);
        await context.SaveChangesAsync();
        context.Subtasks.AddRange(
            new Subtask { TaskId = parent.Id, Title = "open one", Position = 0, Deadline = new DateTime(2026, 9, 1), CreatedAt = DateTime.Now },
            new Subtask { TaskId = parent.Id, Title = "done one", Position = 1, IsCompleted = true, CreatedAt = DateTime.Now });
        await context.SaveChangesAsync();
        var controller = new TasksController(context);

        await controller.Complete(parent.Id, new CompleteTaskRequest(true, "pullOut"));

        // The one open subtask became a standalone task in the parent's project...
        var pulled = await context.Tasks.SingleAsync(t => t.Title == "open one");
        pulled.ProjectId.Should().Be(project.Id);
        pulled.Deadline.Should().Be(new DateTime(2026, 9, 1));
        // ...and was detached from the parent (the completed one stays).
        var remaining = await context.Subtasks.Where(s => s.TaskId == parent.Id).ToListAsync();
        remaining.Should().ContainSingle(s => s.Title == "done one");
        remaining.Should().NotContain(s => s.Title == "open one");
    }

    [Fact]
    public async Task Complete_RecurringParent_SpawnsNextOccurrenceWithResetSubtasks()
    {
        using var context = CreateContext();
        var parent = new TaskModel
        {
            Title = "Morning routine",
            Deadline = new DateTime(2026, 9, 1),
            Recurrence = "FREQ=DAILY",
            SeriesId = Guid.NewGuid(),
            CreatedAt = DateTime.Now,
        };
        context.Tasks.Add(parent);
        await context.SaveChangesAsync();
        context.Subtasks.AddRange(
            new Subtask { TaskId = parent.Id, Title = "wake", Position = 0, IsCompleted = true, CreatedAt = DateTime.Now },
            new Subtask { TaskId = parent.Id, Title = "stretch", Position = 1, CreatedAt = DateTime.Now });
        await context.SaveChangesAsync();
        var controller = new TasksController(context);

        await controller.Complete(parent.Id, new CompleteTaskRequest(true, "completeAll"));

        // A new occurrence exists with a fresh, all-unchecked copy of the checklist.
        var next = await context.Tasks
            .Include(t => t.Subtasks)
            .Where(t => t.SeriesId == parent.SeriesId && t.Id != parent.Id)
            .SingleAsync();
        next.Subtasks.Should().HaveCount(2);
        next.Subtasks.All(s => !s.IsCompleted).Should().BeTrue();
        next.Subtasks.Select(s => s.Title).Should().BeEquivalentTo(new[] { "wake", "stretch" });
    }
}
