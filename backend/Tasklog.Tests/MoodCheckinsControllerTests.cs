using FluentAssertions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Tasklog.Api.Controllers;
using Tasklog.Api.Data;
using Tasklog.Api.Models;

namespace Tasklog.Tests;

public class MoodCheckinsControllerTests
{
    private static TasklogDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<TasklogDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new TasklogDbContext(options);
    }

    [Fact]
    public async Task Create_Valid_Returns201AndStoresWordsAsJson()
    {
        using var context = CreateContext();
        var controller = new MoodCheckinsController(context);

        var result = await controller.Create(new MoodCheckinRequest(new[] { "hopeful", " charged " }, 8, 310, null));

        result.Should().BeOfType<CreatedAtActionResult>();
        var row = await context.MoodCheckins.SingleAsync();
        row.WordsJson.Should().Be("""["hopeful","charged"]"""); // trimmed, blank-filtered
        row.Energy.Should().Be(8);
        row.MocLevel.Should().Be(310);
    }

    [Fact]
    public async Task Create_NoWords_Returns400()
    {
        using var context = CreateContext();
        var controller = new MoodCheckinsController(context);

        var result = await controller.Create(new MoodCheckinRequest(new[] { "  " }, 5, null, null));

        result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Theory]
    [InlineData(-1)]
    [InlineData(11)]
    public async Task Create_EnergyOutOfRange_Returns400(int energy)
    {
        using var context = CreateContext();
        var controller = new MoodCheckinsController(context);

        var result = await controller.Create(new MoodCheckinRequest(new[] { "flat" }, energy, null, null));

        result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task Create_MocLevelBelowScale_Returns400()
    {
        using var context = CreateContext();
        var controller = new MoodCheckinsController(context);

        var result = await controller.Create(new MoodCheckinRequest(new[] { "hollow" }, 3, 5, null));

        result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task List_ReturnsOnlyThatDayOldestFirst()
    {
        using var context = CreateContext();
        var day = new DateTime(2026, 7, 2);
        context.MoodCheckins.AddRange(
            new MoodCheckin { CheckinAt = day.AddHours(21), WordsJson = """["drained"]""", Energy = 2, CreatedAt = DateTime.Now },
            new MoodCheckin { CheckinAt = day.AddHours(7), WordsJson = """["hopeful"]""", Energy = 8, CreatedAt = DateTime.Now },
            new MoodCheckin { CheckinAt = day.AddDays(1).AddHours(8), WordsJson = """["fresh"]""", Energy = 9, CreatedAt = DateTime.Now });
        await context.SaveChangesAsync();
        var controller = new MoodCheckinsController(context);

        var result = await controller.List(day);

        var ok = result.Should().BeOfType<OkObjectResult>().Subject;
        var list = (ok.Value as System.Collections.IEnumerable)!.Cast<object>().ToList();
        list.Should().HaveCount(2);
        // Oldest first: the arc reads left to right.
        list[0].GetType().GetProperty("Energy")!.GetValue(list[0]).Should().Be(8);
    }

    [Fact]
    public async Task Delete_RemovesRow()
    {
        using var context = CreateContext();
        var row = new MoodCheckin { CheckinAt = DateTime.Now, WordsJson = """["oops"]""", Energy = 5, CreatedAt = DateTime.Now };
        context.MoodCheckins.Add(row);
        await context.SaveChangesAsync();
        var controller = new MoodCheckinsController(context);

        var result = await controller.Delete(row.Id);

        result.Should().BeOfType<NoContentResult>();
        (await context.MoodCheckins.CountAsync()).Should().Be(0);
    }

    [Fact]
    public async Task Delete_Missing_Returns404()
    {
        using var context = CreateContext();
        var controller = new MoodCheckinsController(context);

        var result = await controller.Delete(999);

        result.Should().BeOfType<NotFoundObjectResult>();
    }
}
