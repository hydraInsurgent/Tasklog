using FluentAssertions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Tasklog.Api.Controllers;
using Tasklog.Api.Data;
using Tasklog.Api.Models;

namespace Tasklog.Tests;

public class CheckInsControllerTests
{
    private static TasklogDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<TasklogDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new TasklogDbContext(options);
    }

    private static async Task<TaskModel> SeedHabit(TasklogDbContext context)
    {
        var task = new TaskModel { Title = "Meditate", CreatedAt = DateTime.Now, IsHabit = true };
        context.Tasks.Add(task);
        await context.SaveChangesAsync();
        return task;
    }

    [Fact]
    public async Task Create_NewDay_Returns201AndAddsRow()
    {
        using var context = CreateContext();
        var task = await SeedHabit(context);
        var controller = new CheckInsController(context);

        var result = await controller.Create(task.Id, new CheckInRequest(null));

        result.Should().BeOfType<CreatedAtActionResult>();
        (await context.CheckIns.CountAsync()).Should().Be(1);
    }

    [Fact]
    public async Task Create_SameDayTwice_IsIdempotent()
    {
        using var context = CreateContext();
        var task = await SeedHabit(context);
        var controller = new CheckInsController(context);

        await controller.Create(task.Id, new CheckInRequest(null));
        var second = await controller.Create(task.Id, new CheckInRequest(null));

        // Second call returns the existing check-in (200), not a new one.
        second.Should().BeOfType<OkObjectResult>();
        (await context.CheckIns.CountAsync()).Should().Be(1);
    }

    [Fact]
    public async Task Create_WithExplicitDate_UsesThatDay()
    {
        using var context = CreateContext();
        var task = await SeedHabit(context);
        var controller = new CheckInsController(context);

        await controller.Create(task.Id, new CheckInRequest(new DateTime(2026, 5, 20)));

        var row = await context.CheckIns.SingleAsync();
        row.CheckInDate.Should().Be(new DateTime(2026, 5, 20));
    }

    [Fact]
    public async Task Create_UnknownTask_Returns404()
    {
        using var context = CreateContext();
        var controller = new CheckInsController(context);

        var result = await controller.Create(999, new CheckInRequest(null));

        result.Should().BeOfType<NotFoundObjectResult>();
    }

    [Fact]
    public async Task Delete_RemovesTodaysCheckIn_Returns204()
    {
        using var context = CreateContext();
        var task = await SeedHabit(context);
        var controller = new CheckInsController(context);
        await controller.Create(task.Id, new CheckInRequest(null));

        var result = await controller.Delete(task.Id, null);

        result.Should().BeOfType<NoContentResult>();
        (await context.CheckIns.CountAsync()).Should().Be(0);
    }

    [Fact]
    public async Task Delete_WhenNoCheckIn_Returns404()
    {
        using var context = CreateContext();
        var task = await SeedHabit(context);
        var controller = new CheckInsController(context);

        var result = await controller.Delete(task.Id, null);

        result.Should().BeOfType<NotFoundObjectResult>();
    }

    [Fact]
    public async Task GetForTask_ListsCheckIns_NewestFirst()
    {
        using var context = CreateContext();
        var task = await SeedHabit(context);
        var controller = new CheckInsController(context);
        await controller.Create(task.Id, new CheckInRequest(new DateTime(2026, 5, 20)));
        await controller.Create(task.Id, new CheckInRequest(new DateTime(2026, 5, 22)));

        var result = await controller.GetForTask(task.Id);

        var ok = result.Should().BeOfType<OkObjectResult>().Subject;
        var list = ok.Value.Should().BeAssignableTo<IEnumerable<CheckIn>>().Subject.ToList();
        list.Should().HaveCount(2);
        list[0].CheckInDate.Should().Be(new DateTime(2026, 5, 22)); // newest first
    }

    [Fact]
    public async Task GetForTask_UnknownTask_Returns404()
    {
        using var context = CreateContext();
        var controller = new CheckInsController(context);

        var result = await controller.GetForTask(999);

        result.Should().BeOfType<NotFoundObjectResult>();
    }
}
