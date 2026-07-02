using System.Text.Json;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Tasklog.Api.Controllers;
using Tasklog.Api.Data;
using Tasklog.Api.Models;

namespace Tasklog.Tests;

public class SubtasksControllerTests
{
    private static TasklogDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<TasklogDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new TasklogDbContext(options);
    }

    private static async Task<(SubtasksController controller, TasklogDbContext context, int taskId)> SeedTask()
    {
        var context = CreateContext();
        var task = new TaskModel { Title = "Parent", CreatedAt = DateTime.Now };
        context.Tasks.Add(task);
        await context.SaveChangesAsync();
        return (new SubtasksController(context), context, task.Id);
    }

    // Build a JsonElement from a JSON string for the PATCH body (present-key detection).
    private static JsonElement Json(string json)
    {
        using var doc = JsonDocument.Parse(json);
        return doc.RootElement.Clone();
    }

    [Fact]
    public async Task Create_AddsSubtask_Returns201_TrimmedAndPositioned()
    {
        var (controller, context, taskId) = await SeedTask();
        using var _ = context;

        var result = await controller.Create(taskId, new SubtasksController.CreateSubtaskRequest("  step one  "));

        var created = result.Should().BeOfType<CreatedAtActionResult>().Subject.Value.Should().BeOfType<Subtask>().Subject;
        created.Title.Should().Be("step one"); // trimmed
        created.TaskId.Should().Be(taskId);
        created.Position.Should().Be(0); // first item
        created.IsCompleted.Should().BeFalse();
    }

    [Fact]
    public async Task Create_AssignsIncrementingPositions()
    {
        var (controller, context, taskId) = await SeedTask();
        using var _ = context;

        await controller.Create(taskId, new SubtasksController.CreateSubtaskRequest("a"));
        await controller.Create(taskId, new SubtasksController.CreateSubtaskRequest("b"));
        var third = await controller.Create(taskId, new SubtasksController.CreateSubtaskRequest("c"));

        var created = (third as CreatedAtActionResult)!.Value as Subtask;
        created!.Position.Should().Be(2);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public async Task Create_BlankTitle_Returns400(string title)
    {
        var (controller, context, taskId) = await SeedTask();
        using var _ = context;

        var result = await controller.Create(taskId, new SubtasksController.CreateSubtaskRequest(title));

        result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task Create_UnknownTask_Returns404()
    {
        var (controller, context, _) = await SeedTask();
        using var _c = context;

        var result = await controller.Create(999, new SubtasksController.CreateSubtaskRequest("x"));

        result.Should().BeOfType<NotFoundObjectResult>();
    }

    [Fact]
    public async Task Update_TogglesCompletionAndDeadline()
    {
        var (controller, context, taskId) = await SeedTask();
        using var _ = context;
        var created = (await controller.Create(taskId, new SubtasksController.CreateSubtaskRequest("s")) as CreatedAtActionResult)!.Value as Subtask;

        var result = await controller.Update(taskId, created!.Id, Json("{\"isCompleted\":true,\"deadline\":\"2026-09-01\"}"));

        var updated = result.Should().BeOfType<OkObjectResult>().Subject.Value.Should().BeOfType<Subtask>().Subject;
        updated.IsCompleted.Should().BeTrue();
        updated.Deadline.Should().Be(new DateTime(2026, 9, 1));
    }

    [Fact]
    public async Task Update_NullDeadline_ClearsIt()
    {
        var (controller, context, taskId) = await SeedTask();
        using var _ = context;
        var created = (await controller.Create(taskId, new SubtasksController.CreateSubtaskRequest("s", new DateTime(2026, 9, 1))) as CreatedAtActionResult)!.Value as Subtask;

        var result = await controller.Update(taskId, created!.Id, Json("{\"deadline\":null}"));

        var updated = (result as OkObjectResult)!.Value as Subtask;
        updated!.Deadline.Should().BeNull();
    }

    [Fact]
    public async Task Update_OmittedKeys_LeaveFieldsUnchanged()
    {
        var (controller, context, taskId) = await SeedTask();
        using var _ = context;
        var created = (await controller.Create(taskId, new SubtasksController.CreateSubtaskRequest("keep")) as CreatedAtActionResult)!.Value as Subtask;

        // Body with only isCompleted - title must stay.
        var result = await controller.Update(taskId, created!.Id, Json("{\"isCompleted\":true}"));

        var updated = (result as OkObjectResult)!.Value as Subtask;
        updated!.Title.Should().Be("keep");
    }

    [Fact]
    public async Task Update_WrongParent_Returns404()
    {
        var (controller, context, taskId) = await SeedTask();
        using var _ = context;
        var created = (await controller.Create(taskId, new SubtasksController.CreateSubtaskRequest("s")) as CreatedAtActionResult)!.Value as Subtask;

        // Same subtask id but a different (non-owning) task id.
        var result = await controller.Update(taskId + 999, created!.Id, Json("{\"isCompleted\":true}"));

        result.Should().BeOfType<NotFoundObjectResult>();
    }

    [Fact]
    public async Task Delete_RemovesSubtask_Returns204()
    {
        var (controller, context, taskId) = await SeedTask();
        using var _ = context;
        var created = (await controller.Create(taskId, new SubtasksController.CreateSubtaskRequest("s")) as CreatedAtActionResult)!.Value as Subtask;

        var result = await controller.Delete(taskId, created!.Id);

        result.Should().BeOfType<NoContentResult>();
        (await context.Subtasks.CountAsync()).Should().Be(0);
    }

    [Fact]
    public async Task Reorder_RewritesPositions()
    {
        var (controller, context, taskId) = await SeedTask();
        using var _ = context;
        var a = (await controller.Create(taskId, new SubtasksController.CreateSubtaskRequest("a")) as CreatedAtActionResult)!.Value as Subtask;
        var b = (await controller.Create(taskId, new SubtasksController.CreateSubtaskRequest("b")) as CreatedAtActionResult)!.Value as Subtask;
        var c = (await controller.Create(taskId, new SubtasksController.CreateSubtaskRequest("c")) as CreatedAtActionResult)!.Value as Subtask;

        // Reverse the order.
        var result = await controller.Reorder(taskId, new SubtasksController.ReorderSubtasksRequest(new[] { c!.Id, b!.Id, a!.Id }));

        var list = ((result as OkObjectResult)!.Value as List<Subtask>)!;
        list.Select(s => s.Id).Should().ContainInOrder(c.Id, b.Id, a.Id);
        list.Single(s => s.Id == c.Id).Position.Should().Be(0);
        list.Single(s => s.Id == a.Id).Position.Should().Be(2);
    }

    [Fact]
    public async Task Search_ByText_FindsMatchAcrossTasksWithParentTitle()
    {
        var context = CreateContext();
        using var _ = context;
        var t1 = new TaskModel { Title = "Landing page", CreatedAt = DateTime.Now };
        var t2 = new TaskModel { Title = "Trip", CreatedAt = DateTime.Now };
        context.Tasks.AddRange(t1, t2);
        await context.SaveChangesAsync();
        context.Subtasks.AddRange(
            new Subtask { TaskId = t1.Id, Title = "Wire up the waitlist form", Position = 0, CreatedAt = DateTime.Now },
            new Subtask { TaskId = t1.Id, Title = "Write hero copy", Position = 1, CreatedAt = DateTime.Now },
            new Subtask { TaskId = t2.Id, Title = "Book flight", Position = 0, CreatedAt = DateTime.Now });
        await context.SaveChangesAsync();
        var controller = new SubtasksController(context);

        var result = await controller.Search(text: "waitlist", completed: null);

        var list = (result as OkObjectResult)!.Value as System.Collections.IEnumerable;
        var items = list!.Cast<object>().ToList();
        items.Should().ContainSingle();
        // The match carries the parent task's id + title (via an anonymous projection).
        var match = items[0];
        var type = match.GetType();
        type.GetProperty("Title")!.GetValue(match).Should().Be("Wire up the waitlist form");
        type.GetProperty("TaskId")!.GetValue(match).Should().Be(t1.Id);
        type.GetProperty("TaskTitle")!.GetValue(match).Should().Be("Landing page");
    }

    [Fact]
    public async Task Search_CompletedFilter_NarrowsResults()
    {
        var context = CreateContext();
        using var _ = context;
        var t = new TaskModel { Title = "T", CreatedAt = DateTime.Now };
        context.Tasks.Add(t);
        await context.SaveChangesAsync();
        context.Subtasks.AddRange(
            new Subtask { TaskId = t.Id, Title = "done one", Position = 0, IsCompleted = true, CreatedAt = DateTime.Now },
            new Subtask { TaskId = t.Id, Title = "open one", Position = 1, CreatedAt = DateTime.Now });
        await context.SaveChangesAsync();
        var controller = new SubtasksController(context);

        var open = ((await controller.Search(text: null, completed: false) as OkObjectResult)!.Value as System.Collections.IEnumerable)!.Cast<object>().ToList();
        open.Should().ContainSingle();
    }

    [Fact]
    public async Task Reorder_IdsNotAPermutation_Returns400()
    {
        var (controller, context, taskId) = await SeedTask();
        using var _ = context;
        var a = (await controller.Create(taskId, new SubtasksController.CreateSubtaskRequest("a")) as CreatedAtActionResult)!.Value as Subtask;
        await controller.Create(taskId, new SubtasksController.CreateSubtaskRequest("b"));

        // Missing one id (not a full permutation).
        var result = await controller.Reorder(taskId, new SubtasksController.ReorderSubtasksRequest(new[] { a!.Id }));

        result.Should().BeOfType<BadRequestObjectResult>();
    }
}
