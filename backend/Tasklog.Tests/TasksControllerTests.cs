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

        var result = await controller.GetAll();

        var ok = result.Should().BeOfType<OkObjectResult>().Subject;
        var tasks = ok.Value.Should().BeAssignableTo<IEnumerable<TaskModel>>().Subject.ToList();
        tasks[0].Title.Should().Be("Newer");
        tasks[1].Title.Should().Be("Older");
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
