using System.Text.Json;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Tasklog.Api.Controllers;
using Tasklog.Api.Data;

namespace Tasklog.Tests;

// Daily companion sessions (#87): one per day (get-or-create), transcript saved
// verbatim, SDK resume cursor kept via present-key semantics.
public class CompanionSessionsControllerTests
{
    private static TasklogDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<TasklogDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new TasklogDbContext(options);
    }

    private static JsonElement Body(string json) =>
        JsonDocument.Parse(json).RootElement.Clone();

    [Fact]
    public async Task Today_WithNoSession_Returns204()
    {
        using var context = CreateContext();
        var controller = new CompanionSessionsController(context);

        var result = await controller.Today();

        result.Should().BeOfType<NoContentResult>(); // reads never auto-create
    }

    [Fact]
    public async Task Create_Twice_ReturnsTheSameDailySession()
    {
        using var context = CreateContext();
        var controller = new CompanionSessionsController(context);

        var first = await controller.Create();
        var second = await controller.Create();

        first.Should().BeOfType<CreatedAtActionResult>();
        second.Should().BeOfType<OkObjectResult>(); // idempotent get-or-create
        context.CompanionSessions.Count().Should().Be(1);
        context.CompanionSessions.Single().SessionDate.Should().Be(DateTime.Today);
    }

    [Fact]
    public async Task Save_StoresTranscriptVerbatim_AndSdkSessionId()
    {
        using var context = CreateContext();
        var controller = new CompanionSessionsController(context);
        await controller.Create();
        var id = context.CompanionSessions.Single().Id;

        var result = await controller.Save(id, Body(
            """{"messages":[{"role":"user","content":"hey","at":"2026-09-05T10:00:00"}],"sdkSessionId":"abc-123"}"""));

        result.Should().BeOfType<OkObjectResult>();
        var row = context.CompanionSessions.Single();
        row.MessagesJson.Should().Contain("\"hey\"");
        row.SdkSessionId.Should().Be("abc-123");

        // Present-key: a save WITHOUT sdkSessionId keeps the stored cursor.
        await controller.Save(id, Body("""{"messages":[]}"""));
        context.CompanionSessions.Single().SdkSessionId.Should().Be("abc-123");
    }

    [Fact]
    public async Task Save_NonArrayMessages_Returns400()
    {
        using var context = CreateContext();
        var controller = new CompanionSessionsController(context);
        await controller.Create();
        var id = context.CompanionSessions.Single().Id;

        var result = await controller.Save(id, Body("""{"messages":"not an array"}"""));

        result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task Save_UnknownSession_Returns404()
    {
        using var context = CreateContext();
        var controller = new CompanionSessionsController(context);

        var result = await controller.Save(999, Body("""{"messages":[]}"""));

        result.Should().BeOfType<NotFoundObjectResult>();
    }

    // ---- history view (#87 calendar) ----

    [Fact]
    public async Task ByDate_ReturnsThatDaysSession_Or204()
    {
        using var context = CreateContext();
        var yesterday = DateTime.Today.AddDays(-1);
        context.CompanionSessions.Add(new Tasklog.Api.Models.CompanionSession
        {
            SessionDate = yesterday,
            MessagesJson = """[{"role":"user","content":"old words","at":"x"}]""",
            CreatedAt = DateTime.Now,
            UpdatedAt = DateTime.Now,
        });
        await context.SaveChangesAsync();
        var controller = new CompanionSessionsController(context);

        var hit = await controller.ByDate(yesterday);
        var miss = await controller.ByDate(yesterday.AddDays(-5));

        hit.Should().BeOfType<OkObjectResult>();
        miss.Should().BeOfType<NoContentResult>();
    }

    [Fact]
    public async Task SessionDates_ReturnsDaysWithConversations()
    {
        using var context = CreateContext();
        var d1 = DateTime.Today.AddDays(-2);
        var d2 = DateTime.Today;
        foreach (var d in new[] { d1, d2 })
            context.CompanionSessions.Add(new Tasklog.Api.Models.CompanionSession
            {
                SessionDate = d, CreatedAt = DateTime.Now, UpdatedAt = DateTime.Now,
            });
        await context.SaveChangesAsync();
        var controller = new CompanionSessionsController(context);

        var result = await controller.SessionDates(d1.AddDays(-1), d2.AddDays(1));

        var ok = result.Should().BeOfType<OkObjectResult>().Subject;
        var dates = (ok.Value as List<string>)!;
        dates.Should().Equal(d1.ToString("yyyy-MM-dd"), d2.ToString("yyyy-MM-dd"));
    }

    [Fact]
    public async Task SessionDates_RangeOver400Days_Returns400()
    {
        using var context = CreateContext();
        var controller = new CompanionSessionsController(context);

        var result = await controller.SessionDates(DateTime.Today.AddDays(-500), DateTime.Today);

        result.Should().BeOfType<BadRequestObjectResult>();
    }
}
