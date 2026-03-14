using FluentAssertions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Tasklog.Api.Controllers;
using Tasklog.Api.Data;
using Tasklog.Api.Models;

namespace Tasklog.Tests;

public class ProjectsControllerTests
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
    public async Task GetAll_ReturnsProjectsOrderedAlphabetically()
    {
        using var context = CreateContext();
        context.Projects.AddRange(
            new Project { Name = "Zebra", CreatedAt = DateTime.UtcNow },
            new Project { Name = "Alpha", CreatedAt = DateTime.UtcNow }
        );
        await context.SaveChangesAsync();
        var controller = new ProjectsController(context);

        var result = await controller.GetAll();

        var ok = result.Should().BeOfType<OkObjectResult>().Subject;
        var projects = ok.Value.Should().BeAssignableTo<IEnumerable<Project>>().Subject.ToList();
        projects[0].Name.Should().Be("Alpha");
        projects[1].Name.Should().Be("Zebra");
    }

    // --- Create ---

    [Fact]
    public async Task Create_WithValidName_ReturnsCreatedProject()
    {
        using var context = CreateContext();
        var controller = new ProjectsController(context);

        var result = await controller.Create(new ProjectNameRequest("Work"));

        var created = result.Should().BeOfType<CreatedAtActionResult>().Subject;
        var project = created.Value.Should().BeOfType<Project>().Subject;
        project.Name.Should().Be("Work");
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public async Task Create_WithEmptyOrWhitespaceName_ReturnsBadRequest(string name)
    {
        using var context = CreateContext();
        var controller = new ProjectsController(context);

        var result = await controller.Create(new ProjectNameRequest(name));

        result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task Create_NameWithLeadingAndTrailingSpaces_IsTrimmed()
    {
        using var context = CreateContext();
        var controller = new ProjectsController(context);

        var result = await controller.Create(new ProjectNameRequest("  Work  "));

        var created = result.Should().BeOfType<CreatedAtActionResult>().Subject;
        var project = created.Value.Should().BeOfType<Project>().Subject;
        project.Name.Should().Be("Work");
    }

    // --- Rename ---

    [Fact]
    public async Task Rename_WhenProjectExists_UpdatesName()
    {
        using var context = CreateContext();
        var project = new Project { Name = "Old Name", CreatedAt = DateTime.UtcNow };
        context.Projects.Add(project);
        await context.SaveChangesAsync();
        var controller = new ProjectsController(context);

        var result = await controller.Rename(project.Id, new ProjectNameRequest("New Name"));

        var ok = result.Should().BeOfType<OkObjectResult>().Subject;
        var updated = ok.Value.Should().BeOfType<Project>().Subject;
        updated.Name.Should().Be("New Name");
    }

    [Fact]
    public async Task Rename_WhenProjectNotFound_Returns404()
    {
        using var context = CreateContext();
        var controller = new ProjectsController(context);

        var result = await controller.Rename(999, new ProjectNameRequest("New Name"));

        result.Should().BeOfType<NotFoundObjectResult>();
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public async Task Rename_WithEmptyOrWhitespaceName_ReturnsBadRequest(string name)
    {
        using var context = CreateContext();
        var project = new Project { Name = "Existing", CreatedAt = DateTime.UtcNow };
        context.Projects.Add(project);
        await context.SaveChangesAsync();
        var controller = new ProjectsController(context);

        var result = await controller.Rename(project.Id, new ProjectNameRequest(name));

        result.Should().BeOfType<BadRequestObjectResult>();
    }

    // --- Delete ---

    [Fact]
    public async Task Delete_WhenProjectExists_ReturnsNoContent()
    {
        using var context = CreateContext();
        var project = new Project { Name = "To delete", CreatedAt = DateTime.UtcNow };
        context.Projects.Add(project);
        await context.SaveChangesAsync();
        var controller = new ProjectsController(context);

        var result = await controller.Delete(project.Id);

        result.Should().BeOfType<NoContentResult>();
        context.Projects.Should().BeEmpty();
    }

    [Fact]
    public async Task Delete_WhenProjectNotFound_Returns404()
    {
        using var context = CreateContext();
        var controller = new ProjectsController(context);

        var result = await controller.Delete(999);

        result.Should().BeOfType<NotFoundObjectResult>();
    }

    [Fact]
    public async Task Delete_CascadeDeletesTasksBelongingToProject()
    {
        using var context = CreateContext();
        var project = new Project { Name = "Work", CreatedAt = DateTime.UtcNow };
        context.Projects.Add(project);
        await context.SaveChangesAsync();
        context.Tasks.AddRange(
            new TaskModel { Title = "Task A", CreatedAt = DateTime.Now, ProjectId = project.Id },
            new TaskModel { Title = "Task B", CreatedAt = DateTime.Now, ProjectId = project.Id }
        );
        // This task is in Inbox - should survive the delete.
        context.Tasks.Add(new TaskModel { Title = "Inbox task", CreatedAt = DateTime.Now, ProjectId = null });
        await context.SaveChangesAsync();
        var controller = new ProjectsController(context);

        await controller.Delete(project.Id);

        context.Tasks.Should().HaveCount(1);
        context.Tasks.Single().Title.Should().Be("Inbox task");
    }
}
