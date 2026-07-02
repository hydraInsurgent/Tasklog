using System.Text.Json;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Tasklog.Api.Controllers;
using Tasklog.Api.Data;
using Tasklog.Api.Models;

namespace Tasklog.Tests;

public class JournalControllerTests
{
    private static TasklogDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<TasklogDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new TasklogDbContext(options);
    }

    // The controller reads templates from the table Program.cs seeds at startup;
    // tests seed the same code definitions directly.
    private static async Task SeedTemplates(TasklogDbContext context)
    {
        foreach (var def in Tasklog.Api.Services.JournalTemplates.Definitions)
        {
            context.JournalTemplates.Add(new JournalTemplate
            {
                Key = def.Key,
                Name = def.Name,
                Periodicity = def.Periodicity,
                SectionsJson = def.SectionsJson,
                SortOrder = def.SortOrder,
                CreatedAt = DateTime.Now,
            });
        }
        await context.SaveChangesAsync();
    }

    private static JsonElement Body(string json) => JsonDocument.Parse(json).RootElement.Clone();

    [Fact]
    public async Task Templates_ReturnsAllInSortOrder()
    {
        using var context = CreateContext();
        await SeedTemplates(context);
        var controller = new JournalController(context);

        var result = await controller.Templates();

        var ok = result.Should().BeOfType<OkObjectResult>().Subject;
        var list = (ok.Value as System.Collections.IEnumerable)!.Cast<object>().ToList();
        list.Should().HaveCount(3);
    }

    [Fact]
    public async Task Upsert_NewDay_CreatesEntry()
    {
        using var context = CreateContext();
        await SeedTemplates(context);
        var controller = new JournalController(context);

        var result = await controller.Upsert("daily", new DateTime(2026, 7, 2),
            Body("""{ "content": { "mind_dump": "DSA pehle" } }"""));

        result.Should().BeOfType<OkObjectResult>();
        var entry = await context.JournalEntries.SingleAsync();
        entry.EntryDate.Should().Be(new DateTime(2026, 7, 2));
        entry.ContentJson.Should().Contain("DSA pehle");
    }

    [Fact]
    public async Task Upsert_SameDayTwice_ReplacesContentWithoutDuplicating()
    {
        using var context = CreateContext();
        await SeedTemplates(context);
        var controller = new JournalController(context);
        var day = new DateTime(2026, 7, 2);

        await controller.Upsert("daily", day, Body("""{ "content": { "mind_dump": "first" } }"""));
        await controller.Upsert("daily", day, Body("""{ "content": { "mind_dump": "second" } }"""));

        var entry = await context.JournalEntries.SingleAsync();
        entry.ContentJson.Should().Contain("second").And.NotContain("first");
    }

    [Fact]
    public async Task Upsert_UnknownTemplate_Returns404()
    {
        using var context = CreateContext();
        await SeedTemplates(context);
        var controller = new JournalController(context);

        var result = await controller.Upsert("dreams", DateTime.Today, Body("""{ "content": {} }"""));

        result.Should().BeOfType<NotFoundObjectResult>();
    }

    [Fact]
    public async Task Upsert_NonObjectContent_Returns400()
    {
        using var context = CreateContext();
        await SeedTemplates(context);
        var controller = new JournalController(context);

        var result = await controller.Upsert("daily", DateTime.Today, Body("""{ "content": "just a string" }"""));

        result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task Entries_ReturnsOnlyThatDay()
    {
        using var context = CreateContext();
        await SeedTemplates(context);
        var controller = new JournalController(context);
        await controller.Upsert("daily", new DateTime(2026, 7, 1), Body("""{ "content": { "mind_dump": "yesterday" } }"""));
        await controller.Upsert("daily", new DateTime(2026, 7, 2), Body("""{ "content": { "mind_dump": "today" } }"""));
        await controller.Upsert("gratitude", new DateTime(2026, 7, 2), Body("""{ "content": { "items": ["walk"] } }"""));

        var result = await controller.Entries(new DateTime(2026, 7, 2));

        var ok = result.Should().BeOfType<OkObjectResult>().Subject;
        var list = (ok.Value as System.Collections.IEnumerable)!.Cast<object>().ToList();
        list.Should().HaveCount(2);
    }

    [Fact]
    public async Task EntryDates_ReturnsDistinctDaysInRange()
    {
        using var context = CreateContext();
        await SeedTemplates(context);
        var controller = new JournalController(context);
        await controller.Upsert("daily", new DateTime(2026, 7, 2), Body("""{ "content": {} }"""));
        await controller.Upsert("gratitude", new DateTime(2026, 7, 2), Body("""{ "content": {} }"""));
        await controller.Upsert("daily", new DateTime(2026, 7, 5), Body("""{ "content": {} }"""));
        await controller.Upsert("daily", new DateTime(2026, 8, 1), Body("""{ "content": {} }"""));

        var result = await controller.EntryDates(new DateTime(2026, 7, 1), new DateTime(2026, 8, 1));

        var ok = result.Should().BeOfType<OkObjectResult>().Subject;
        ok.Value.Should().BeEquivalentTo(new List<string> { "2026-07-02", "2026-07-05" });
    }

    [Fact]
    public async Task ExportDay_ReturnsMarkdownFile()
    {
        using var context = CreateContext();
        await SeedTemplates(context);
        var controller = new JournalController(context);
        await controller.Upsert("daily", new DateTime(2026, 7, 2),
            Body("""{ "content": { "whats_going_on": "workable morning" } }"""));

        var result = await controller.ExportDay(new DateTime(2026, 7, 2));

        var file = result.Should().BeOfType<FileContentResult>().Subject;
        file.ContentType.Should().Be("text/markdown");
        file.FileDownloadName.Should().Be("2026-07-02.md");
        System.Text.Encoding.UTF8.GetString(file.FileContents).Should().Contain("workable morning");
    }

    [Fact]
    public async Task ExportDay_IncludesUnplannedCompletedTasks()
    {
        using var context = CreateContext();
        await SeedTemplates(context);
        var day = new DateTime(2026, 7, 2);
        var planned = new TaskModel { Title = "DSA daily", CreatedAt = DateTime.Now, IsCompleted = true, CompletedAt = day.AddHours(9) };
        var unplanned = new TaskModel { Title = "Fixed deploy script", CreatedAt = DateTime.Now, IsCompleted = true, CompletedAt = day.AddHours(14) };
        context.Tasks.AddRange(planned, unplanned);
        await context.SaveChangesAsync();

        var controller = new JournalController(context);
        await controller.Upsert("daily", day, Body($$"""
            { "content": { "todays_plan": { "buckets": { "non_negotiable": [{{planned.Id}}], "if_energy": [], "easy_wins": [] } } } }
            """));

        var result = await controller.ExportDay(day);

        var md = System.Text.Encoding.UTF8.GetString(((FileContentResult)result).FileContents);
        md.Should().Contain("- [x] DSA daily");
        md.Should().Contain("Unplanned, got done");
        md.Should().Contain("- [x] Fixed deploy script");
    }
}
