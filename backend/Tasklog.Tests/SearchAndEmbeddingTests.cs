using FluentAssertions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Tasklog.Api.Controllers;
using Tasklog.Api.Data;
using Tasklog.Api.Models;
using Tasklog.Api.Services;

namespace Tasklog.Tests;

// Semantic search (#87): the cosine/byte helpers are pure math (no Ollama), and
// the endpoint's LIKE fallback is what every Ollama-less host (tests included)
// exercises. The EmbeddingService here points at a dead port on purpose - its
// best-effort contract means that must behave exactly like "no Ollama".
public class SearchAndEmbeddingTests
{
    private static TasklogDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<TasklogDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new TasklogDbContext(options);
    }

    private static EmbeddingService DeadOllamaService(TasklogDbContext context)
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["Ollama:Url"] = "http://localhost:1" })
            .Build();
        return new EmbeddingService(new HttpClient(), context, config,
            NullLogger<EmbeddingService>.Instance);
    }

    // ---- pure vector math ----

    [Fact]
    public void Cosine_IdenticalVectors_IsOne()
    {
        var v = new float[] { 0.5f, -1.2f, 3.3f };
        EmbeddingService.Cosine(v, v).Should().BeApproximately(1.0, 1e-9);
    }

    [Fact]
    public void Cosine_OrthogonalVectors_IsZero()
    {
        EmbeddingService.Cosine(new float[] { 1, 0 }, new float[] { 0, 1 })
            .Should().BeApproximately(0.0, 1e-9);
    }

    [Fact]
    public void Cosine_MismatchedOrEmpty_IsZero()
    {
        EmbeddingService.Cosine(new float[] { 1, 2 }, new float[] { 1 }).Should().Be(0);
        EmbeddingService.Cosine(Array.Empty<float>(), Array.Empty<float>()).Should().Be(0);
    }

    [Fact]
    public void VectorBytes_RoundTripExactly()
    {
        var v = new float[] { 0.123f, -45.6f, 7.89e-3f };
        EmbeddingService.FromBytes(EmbeddingService.ToBytes(v)).Should().Equal(v);
    }

    [Fact]
    public void RankingByCosine_PrefersTheCloserVector()
    {
        var query = new float[] { 1, 0, 0 };
        var near = new float[] { 0.9f, 0.1f, 0 };
        var far = new float[] { 0, 0.2f, 1 };
        EmbeddingService.Cosine(query, near).Should().BeGreaterThan(
            EmbeddingService.Cosine(query, far));
    }

    // ---- endpoint fallback behavior (no vectors / no Ollama) ----

    [Fact]
    public async Task Search_EmptyQuery_Returns400()
    {
        using var context = CreateContext();
        var controller = new SearchController(context, DeadOllamaService(context));

        var result = await controller.Tasks(new SearchRequest("  ", null));

        result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task Search_NoOllama_FallsBackToKeyword()
    {
        using var context = CreateContext();
        context.Tasks.Add(new TaskModel { Title = "File the income tax return", CreatedAt = DateTime.Now });
        context.Tasks.Add(new TaskModel { Title = "Water the plants", CreatedAt = DateTime.Now });
        await context.SaveChangesAsync();
        var controller = new SearchController(context, DeadOllamaService(context));

        var result = await controller.Tasks(new SearchRequest("income tax", null));

        var ok = result.Should().BeOfType<OkObjectResult>().Subject;
        var json = System.Text.Json.JsonSerializer.Serialize(ok.Value);
        json.Should().Contain("\"keyword\"");           // honest about the degraded path
        json.Should().Contain("File the income tax return");
        json.Should().NotContain("Water the plants");
    }

    [Fact]
    public async Task Search_CompletedTasks_AreNeverCandidates()
    {
        using var context = CreateContext();
        context.Tasks.Add(new TaskModel { Title = "File the income tax return", IsCompleted = true, CreatedAt = DateTime.Now });
        await context.SaveChangesAsync();
        var controller = new SearchController(context, DeadOllamaService(context));

        var result = await controller.Tasks(new SearchRequest("income tax", null));

        var ok = result.Should().BeOfType<OkObjectResult>().Subject;
        System.Text.Json.JsonSerializer.Serialize(ok.Value)
            .Should().NotContain("income tax return");
    }

    [Fact]
    public async Task Search_LimitOutOfRange_Returns400()
    {
        using var context = CreateContext();
        var controller = new SearchController(context, DeadOllamaService(context));

        (await controller.Tasks(new SearchRequest("x", 0))).Should().BeOfType<BadRequestObjectResult>();
        (await controller.Tasks(new SearchRequest("x", 26))).Should().BeOfType<BadRequestObjectResult>();
    }
}
