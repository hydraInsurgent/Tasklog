using System.Text.Json;
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

    private static JsonElement Json(string json)
    {
        using var doc = JsonDocument.Parse(json);
        return doc.RootElement.Clone();
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

        var result = await controller.Update(project.Id, Json("{\"name\":\"New Name\"}"));

        var ok = result.Should().BeOfType<OkObjectResult>().Subject;
        var updated = ok.Value.Should().BeOfType<Project>().Subject;
        updated.Name.Should().Be("New Name");
    }

    [Fact]
    public async Task Rename_WhenProjectNotFound_Returns404()
    {
        using var context = CreateContext();
        var controller = new ProjectsController(context);

        var result = await controller.Update(999, Json("{\"name\":\"New Name\"}"));

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

        var result = await controller.Update(project.Id, Json($"{{\"name\":\"{name}\"}}"));

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

    // --- Color (#77) ---

    [Fact]
    public async Task Create_WithValidColor_StoresIt()
    {
        using var context = CreateContext();
        var controller = new ProjectsController(context);

        var result = await controller.Create(new ProjectNameRequest("Work", "#3B82F6"));

        var project = result.Should().BeOfType<CreatedAtActionResult>().Subject
            .Value.Should().BeOfType<Project>().Subject;
        project.Color.Should().Be("#3B82F6");
    }

    [Theory]
    [InlineData("blue")]
    [InlineData("#FFF")]
    [InlineData("#1234ZZ")]
    public async Task Create_WithInvalidColor_Returns400(string color)
    {
        using var context = CreateContext();
        var controller = new ProjectsController(context);

        var result = await controller.Create(new ProjectNameRequest("Work", color));

        result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task Rename_WithColor_UpdatesColor()
    {
        using var context = CreateContext();
        var project = new Project { Name = "Work", CreatedAt = DateTime.UtcNow };
        context.Projects.Add(project);
        await context.SaveChangesAsync();
        var controller = new ProjectsController(context);

        await controller.Update(project.Id, Json("{\"name\":\"Work\",\"color\":\"#22C55E\"}"));

        (await context.Projects.FindAsync(project.Id))!.Color.Should().Be("#22C55E");
    }

    // --- Client grouping + ordering (#86) ---

    [Fact]
    public async Task Create_AssignsIncrementingPosition()
    {
        using var context = CreateContext();
        var controller = new ProjectsController(context);

        var first = (await controller.Create(new ProjectNameRequest("A")) as CreatedAtActionResult)!.Value as Project;
        var second = (await controller.Create(new ProjectNameRequest("B")) as CreatedAtActionResult)!.Value as Project;

        first!.Position.Should().Be(0);
        second!.Position.Should().Be(1);
    }

    [Fact]
    public async Task Create_WithUnknownClient_Returns400()
    {
        using var context = CreateContext();
        var controller = new ProjectsController(context);

        var result = await controller.Create(new ProjectNameRequest("Work", ClientId: 999));

        result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task Update_SetsThenClearsClient()
    {
        using var context = CreateContext();
        var client = new Client { Name = "Self", CreatedAt = DateTime.UtcNow };
        context.Clients.Add(client);
        var project = new Project { Name = "Routines", CreatedAt = DateTime.UtcNow };
        context.Projects.Add(project);
        await context.SaveChangesAsync();
        var controller = new ProjectsController(context);

        await controller.Update(project.Id, Json($"{{\"clientId\":{client.Id}}}"));
        (await context.Projects.FindAsync(project.Id))!.ClientId.Should().Be(client.Id);

        await controller.Update(project.Id, Json("{\"clientId\":null}"));
        (await context.Projects.FindAsync(project.Id))!.ClientId.Should().BeNull();
    }

    [Fact]
    public async Task Reorder_RewritesPositions()
    {
        using var context = CreateContext();
        var a = new Project { Name = "A", CreatedAt = DateTime.UtcNow, Position = 0 };
        var b = new Project { Name = "B", CreatedAt = DateTime.UtcNow, Position = 1 };
        var c = new Project { Name = "C", CreatedAt = DateTime.UtcNow, Position = 2 };
        context.Projects.AddRange(a, b, c);
        await context.SaveChangesAsync();
        var controller = new ProjectsController(context);

        // New order: C, A, B
        var result = await controller.Reorder(new ReorderRequest(new[] { c.Id, a.Id, b.Id }));

        result.Should().BeOfType<OkObjectResult>();
        (await context.Projects.FindAsync(c.Id))!.Position.Should().Be(0);
        (await context.Projects.FindAsync(a.Id))!.Position.Should().Be(1);
        (await context.Projects.FindAsync(b.Id))!.Position.Should().Be(2);
    }

    [Fact]
    public async Task Reorder_WithIncompleteIdSet_Returns400()
    {
        using var context = CreateContext();
        var a = new Project { Name = "A", CreatedAt = DateTime.UtcNow };
        var b = new Project { Name = "B", CreatedAt = DateTime.UtcNow };
        context.Projects.AddRange(a, b);
        await context.SaveChangesAsync();
        var controller = new ProjectsController(context);

        var result = await controller.Reorder(new ReorderRequest(new[] { a.Id }));

        result.Should().BeOfType<BadRequestObjectResult>();
    }
}
