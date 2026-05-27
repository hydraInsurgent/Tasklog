using FluentAssertions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Tasklog.Api.Controllers;
using Tasklog.Api.Data;
using Tasklog.Api.Models;

namespace Tasklog.Tests;

public class CommentsControllerTests
{
    private static TasklogDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<TasklogDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new TasklogDbContext(options);
    }

    // Seeds one task and returns its id with a ready controller + context.
    private static async Task<(CommentsController controller, TasklogDbContext context, int taskId)> SeedTask()
    {
        var context = CreateContext();
        var task = new TaskModel { Title = "T", CreatedAt = DateTime.Now };
        context.Tasks.Add(task);
        await context.SaveChangesAsync();
        return (new CommentsController(context), context, task.Id);
    }

    [Fact]
    public async Task Create_AddsComment_Returns201()
    {
        var (controller, context, taskId) = await SeedTask();
        using var _ = context;

        var result = await controller.Create(taskId, new CommentsController.CreateCommentRequest("  hello  "));

        var created = result.Should().BeOfType<CreatedAtActionResult>().Subject.Value.Should().BeOfType<TaskComment>().Subject;
        created.Body.Should().Be("hello"); // trimmed
        created.TaskId.Should().Be(taskId);
        (await context.Comments.CountAsync()).Should().Be(1);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public async Task Create_EmptyOrWhitespaceBody_Returns400(string body)
    {
        var (controller, context, taskId) = await SeedTask();
        using var _ = context;

        var result = await controller.Create(taskId, new CommentsController.CreateCommentRequest(body));

        result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task Create_TooLong_Returns400()
    {
        var (controller, context, taskId) = await SeedTask();
        using var _ = context;

        var result = await controller.Create(taskId, new CommentsController.CreateCommentRequest(new string('x', 2001)));

        result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task Create_UnknownTask_Returns404()
    {
        using var context = CreateContext();
        var controller = new CommentsController(context);

        var result = await controller.Create(999, new CommentsController.CreateCommentRequest("hi"));

        result.Should().BeOfType<NotFoundObjectResult>();
    }

    [Fact]
    public async Task GetForTask_ListsNewestFirst()
    {
        var (controller, context, taskId) = await SeedTask();
        using var _ = context;
        context.Comments.AddRange(
            new TaskComment { TaskId = taskId, Body = "older", CreatedAt = new DateTime(2026, 1, 1) },
            new TaskComment { TaskId = taskId, Body = "newer", CreatedAt = new DateTime(2026, 6, 1) }
        );
        await context.SaveChangesAsync();

        var result = await controller.GetForTask(taskId);

        var comments = result.Should().BeOfType<OkObjectResult>().Subject.Value.Should().BeAssignableTo<IEnumerable<TaskComment>>().Subject.ToList();
        comments.Select(c => c.Body).Should().Equal("newer", "older");
    }

    [Fact]
    public async Task GetForTask_UnknownTask_Returns404()
    {
        using var context = CreateContext();
        var controller = new CommentsController(context);

        var result = await controller.GetForTask(999);

        result.Should().BeOfType<NotFoundObjectResult>();
    }

    [Fact]
    public async Task Delete_RemovesComment_Returns204()
    {
        var (controller, context, taskId) = await SeedTask();
        using var _ = context;
        var comment = new TaskComment { TaskId = taskId, Body = "bye", CreatedAt = DateTime.Now };
        context.Comments.Add(comment);
        await context.SaveChangesAsync();

        var result = await controller.Delete(taskId, comment.Id);

        result.Should().BeOfType<NoContentResult>();
        (await context.Comments.CountAsync()).Should().Be(0);
    }

    [Fact]
    public async Task Delete_UnknownComment_Returns404()
    {
        var (controller, context, taskId) = await SeedTask();
        using var _ = context;

        var result = await controller.Delete(taskId, 999);

        result.Should().BeOfType<NotFoundObjectResult>();
    }
}
