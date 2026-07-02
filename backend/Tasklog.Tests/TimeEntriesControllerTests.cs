using System.Text.Json;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Tasklog.Api.Controllers;
using Tasklog.Api.Data;
using Tasklog.Api.Models;

namespace Tasklog.Tests;

// Tests for the time-tracking endpoints (#77): start/stop with the single-running invariant,
// manual add, edit, delete, and the overlap range query.
public class TimeEntriesControllerTests
{
    private static TasklogDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<TasklogDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new TasklogDbContext(options);
    }

    private static async Task<int> SeedTask(TasklogDbContext ctx, string title = "T")
    {
        var t = new TaskModel { Title = title, CreatedAt = DateTime.Now };
        ctx.Tasks.Add(t);
        await ctx.SaveChangesAsync();
        return t.Id;
    }

    private static JsonElement Json(string json)
    {
        using var doc = JsonDocument.Parse(json);
        return doc.RootElement.Clone();
    }

    [Fact]
    public async Task Start_CreatesRunningEntry()
    {
        using var ctx = CreateContext();
        var taskId = await SeedTask(ctx);
        var controller = new TimeEntriesController(ctx);

        var result = await controller.Start(new StartRequest(taskId));

        var entry = result.Should().BeOfType<CreatedAtActionResult>().Subject
            .Value.Should().BeOfType<TimeEntryResponse>().Subject;
        entry.TaskId.Should().Be(taskId);
        entry.EndedAt.Should().BeNull();
        (await ctx.TimeEntries.CountAsync(e => e.EndedAt == null)).Should().Be(1);
    }

    [Fact]
    public async Task Start_AutoStopsThePreviousRunningTimer()
    {
        using var ctx = CreateContext();
        var a = await SeedTask(ctx, "A");
        var b = await SeedTask(ctx, "B");
        var controller = new TimeEntriesController(ctx);

        await controller.Start(new StartRequest(a));
        await controller.Start(new StartRequest(b));

        // Exactly one running, and it's on B; A's interval was closed.
        (await ctx.TimeEntries.CountAsync(e => e.EndedAt == null)).Should().Be(1);
        var running = await ctx.TimeEntries.SingleAsync(e => e.EndedAt == null);
        running.TaskId.Should().Be(b);
        (await ctx.TimeEntries.SingleAsync(e => e.TaskId == a)).EndedAt.Should().NotBeNull();
    }

    [Fact]
    public async Task Start_UnknownTask_Returns404()
    {
        using var ctx = CreateContext();
        var controller = new TimeEntriesController(ctx);
        (await controller.Start(new StartRequest(999))).Should().BeOfType<NotFoundObjectResult>();
    }

    [Fact]
    public async Task Stop_ClosesEntry_AndIsIdempotent()
    {
        using var ctx = CreateContext();
        var taskId = await SeedTask(ctx);
        var controller = new TimeEntriesController(ctx);
        var started = (await controller.Start(new StartRequest(taskId))
            as CreatedAtActionResult)!.Value as TimeEntryResponse;

        await controller.Stop(started!.Id);
        var firstEnd = (await ctx.TimeEntries.FindAsync(started.Id))!.EndedAt;
        firstEnd.Should().NotBeNull();

        // Stopping again leaves the end time unchanged.
        await controller.Stop(started.Id);
        (await ctx.TimeEntries.FindAsync(started.Id))!.EndedAt.Should().Be(firstEnd);
    }

    [Fact]
    public async Task AddManual_EndBeforeStart_Returns400()
    {
        using var ctx = CreateContext();
        var taskId = await SeedTask(ctx);
        var controller = new TimeEntriesController(ctx);

        var req = new ManualRequest(taskId, new DateTime(2026, 6, 8, 10, 0, 0), new DateTime(2026, 6, 8, 9, 0, 0));
        (await controller.AddManual(req)).Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task AddManual_Valid_CreatesClosedEntry()
    {
        using var ctx = CreateContext();
        var taskId = await SeedTask(ctx);
        var controller = new TimeEntriesController(ctx);

        var req = new ManualRequest(taskId, new DateTime(2026, 6, 8, 9, 0, 0), new DateTime(2026, 6, 8, 10, 30, 0));
        var entry = (await controller.AddManual(req) as CreatedAtActionResult)!.Value as TimeEntryResponse;

        entry!.EndedAt.Should().Be(new DateTime(2026, 6, 8, 10, 30, 0));
        entry.DurationSeconds.Should().Be(90 * 60);
    }

    [Fact]
    public async Task Update_EndBeforeStart_Returns400()
    {
        using var ctx = CreateContext();
        var taskId = await SeedTask(ctx);
        var entry = new TimeEntry { TaskId = taskId, StartedAt = new DateTime(2026, 6, 8, 9, 0, 0), EndedAt = new DateTime(2026, 6, 8, 10, 0, 0), CreatedAt = DateTime.Now };
        ctx.TimeEntries.Add(entry);
        await ctx.SaveChangesAsync();
        var controller = new TimeEntriesController(ctx);

        var result = await controller.Update(entry.Id, Json("{\"endedAt\":\"2026-06-08T08:00:00\"}"));
        result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task Update_Valid_ChangesBounds()
    {
        using var ctx = CreateContext();
        var taskId = await SeedTask(ctx);
        var entry = new TimeEntry { TaskId = taskId, StartedAt = new DateTime(2026, 6, 8, 9, 0, 0), EndedAt = new DateTime(2026, 6, 8, 10, 0, 0), CreatedAt = DateTime.Now };
        ctx.TimeEntries.Add(entry);
        await ctx.SaveChangesAsync();
        var controller = new TimeEntriesController(ctx);

        await controller.Update(entry.Id, Json("{\"endedAt\":\"2026-06-08T11:00:00\"}"));
        (await ctx.TimeEntries.FindAsync(entry.Id))!.EndedAt.Should().Be(new DateTime(2026, 6, 8, 11, 0, 0));
    }

    [Fact]
    public async Task Delete_RemovesEntry()
    {
        using var ctx = CreateContext();
        var taskId = await SeedTask(ctx);
        var entry = new TimeEntry { TaskId = taskId, StartedAt = DateTime.Now, EndedAt = DateTime.Now, CreatedAt = DateTime.Now };
        ctx.TimeEntries.Add(entry);
        await ctx.SaveChangesAsync();
        var controller = new TimeEntriesController(ctx);

        (await controller.Delete(entry.Id)).Should().BeOfType<NoContentResult>();
        (await ctx.TimeEntries.FindAsync(entry.Id)).Should().BeNull();
    }

    [Fact]
    public async Task List_IncludesAnEntryOverlappingTheWindow()
    {
        using var ctx = CreateContext();
        var taskId = await SeedTask(ctx);
        // Started before the window but ends inside it -> must be included.
        ctx.TimeEntries.Add(new TimeEntry
        {
            TaskId = taskId,
            StartedAt = new DateTime(2026, 6, 7, 23, 30, 0),
            EndedAt = new DateTime(2026, 6, 8, 0, 30, 0),
            CreatedAt = DateTime.Now,
        });
        await ctx.SaveChangesAsync();
        var controller = new TimeEntriesController(ctx);

        var ok = await controller.List(taskId: null, from: new DateTime(2026, 6, 8), to: new DateTime(2026, 6, 9)) as OkObjectResult;
        var list = ok!.Value as List<TimeEntryResponse>;
        list!.Should().HaveCount(1);
    }
}
