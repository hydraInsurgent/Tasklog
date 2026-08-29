using FluentAssertions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Tasklog.Api.Controllers;
using Tasklog.Api.Data;
using Tasklog.Api.Models;

namespace Tasklog.Tests;

// Tests for clients (#86) - the grouping level above projects. The behavior worth pinning
// is Delete: it un-groups the client's projects (ClientId -> null) rather than deleting them.
public class ClientsControllerTests
{
    private static TasklogDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<TasklogDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new TasklogDbContext(options);
    }

    [Fact]
    public async Task Create_WithValidName_ReturnsCreatedClient()
    {
        using var context = CreateContext();
        var controller = new ClientsController(context);

        var result = await controller.Create(new ClientNameRequest("Self", "#3B82F6"));

        var client = result.Should().BeOfType<CreatedAtActionResult>().Subject
            .Value.Should().BeOfType<Client>().Subject;
        client.Name.Should().Be("Self");
        client.Color.Should().Be("#3B82F6");
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public async Task Create_WithEmptyName_Returns400(string name)
    {
        using var context = CreateContext();
        var controller = new ClientsController(context);

        (await controller.Create(new ClientNameRequest(name))).Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task Create_WithInvalidColor_Returns400()
    {
        using var context = CreateContext();
        var controller = new ClientsController(context);

        (await controller.Create(new ClientNameRequest("Self", "blue"))).Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task Rename_WhenNotFound_Returns404()
    {
        using var context = CreateContext();
        var controller = new ClientsController(context);

        (await controller.Rename(999, new ClientNameRequest("X"))).Should().BeOfType<NotFoundObjectResult>();
    }

    [Fact]
    public async Task Delete_UngroupsProjects_WithoutDeletingThem()
    {
        using var context = CreateContext();
        var client = new Client { Name = "Self", CreatedAt = DateTime.UtcNow };
        context.Clients.Add(client);
        await context.SaveChangesAsync();
        context.Projects.AddRange(
            new Project { Name = "Routines", CreatedAt = DateTime.UtcNow, ClientId = client.Id },
            new Project { Name = "Food", CreatedAt = DateTime.UtcNow, ClientId = client.Id });
        await context.SaveChangesAsync();
        var controller = new ClientsController(context);

        var result = await controller.Delete(client.Id);

        result.Should().BeOfType<NoContentResult>();
        context.Clients.Should().BeEmpty();
        // Projects survive, just un-grouped.
        var projects = await context.Projects.ToListAsync();
        projects.Should().HaveCount(2);
        projects.Should().OnlyContain(p => p.ClientId == null);
    }

    [Fact]
    public async Task Delete_WhenNotFound_Returns404()
    {
        using var context = CreateContext();
        var controller = new ClientsController(context);

        (await controller.Delete(999)).Should().BeOfType<NotFoundObjectResult>();
    }
}
