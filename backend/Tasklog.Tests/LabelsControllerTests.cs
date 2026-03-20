using FluentAssertions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Tasklog.Api.Controllers;
using Tasklog.Api.Data;
using Tasklog.Api.Models;

namespace Tasklog.Tests;

public class LabelsControllerTests
{
    private static TasklogDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<TasklogDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new TasklogDbContext(options);
    }

    // --- GetAll ---

    [Fact]
    public async Task GetAll_ReturnsLabelsOrderedAlphabetically()
    {
        using var context = CreateContext();
        context.Labels.AddRange(
            new Label { Name = "Zebra", ColorIndex = 0, CreatedAt = DateTime.UtcNow },
            new Label { Name = "Alpha", ColorIndex = 1, CreatedAt = DateTime.UtcNow }
        );
        await context.SaveChangesAsync();
        var controller = new LabelsController(context);

        var result = await controller.GetAll();

        var ok = result.Should().BeOfType<OkObjectResult>().Subject;
        var labels = ok.Value.Should().BeAssignableTo<IEnumerable<Label>>().Subject.ToList();
        labels[0].Name.Should().Be("Alpha");
        labels[1].Name.Should().Be("Zebra");
    }

    // --- Create ---

    [Fact]
    public async Task Create_WithValidNameAndColorIndex_Returns201WithLabel()
    {
        using var context = CreateContext();
        var controller = new LabelsController(context);

        var result = await controller.Create(new CreateLabelRequest("Urgent", 3));

        var created = result.Should().BeOfType<CreatedAtActionResult>().Subject;
        created.StatusCode.Should().Be(201);
        var label = created.Value.Should().BeOfType<Label>().Subject;
        label.Name.Should().Be("Urgent");
        label.ColorIndex.Should().Be(3);
    }

    [Fact]
    public async Task Create_WithEmptyName_ReturnsBadRequest()
    {
        using var context = CreateContext();
        var controller = new LabelsController(context);

        var result = await controller.Create(new CreateLabelRequest("", 0));

        result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task Create_WithWhitespaceOnlyName_ReturnsBadRequest()
    {
        using var context = CreateContext();
        var controller = new LabelsController(context);

        var result = await controller.Create(new CreateLabelRequest("   ", 0));

        result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task Create_TrimsNameBeforeSaving()
    {
        using var context = CreateContext();
        var controller = new LabelsController(context);

        var result = await controller.Create(new CreateLabelRequest("  Bug  ", 2));

        var created = result.Should().BeOfType<CreatedAtActionResult>().Subject;
        var label = created.Value.Should().BeOfType<Label>().Subject;
        label.Name.Should().Be("Bug");
    }

    [Fact]
    public async Task Create_WithColorIndexBelowRange_ReturnsBadRequest()
    {
        using var context = CreateContext();
        var controller = new LabelsController(context);

        var result = await controller.Create(new CreateLabelRequest("Tag", -1));

        result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task Create_WithColorIndexAboveRange_ReturnsBadRequest()
    {
        using var context = CreateContext();
        var controller = new LabelsController(context);

        var result = await controller.Create(new CreateLabelRequest("Tag", 10));

        result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task Create_WhenNameAlreadyExists_Returns409()
    {
        using var context = CreateContext();
        context.Labels.Add(new Label { Name = "Feature", ColorIndex = 0, CreatedAt = DateTime.UtcNow });
        await context.SaveChangesAsync();
        var controller = new LabelsController(context);

        var result = await controller.Create(new CreateLabelRequest("Feature", 1));

        result.Should().BeOfType<ConflictObjectResult>();
    }

    [Fact]
    public async Task Create_WhenNameAlreadyExistsWithDifferentCasing_Returns409()
    {
        using var context = CreateContext();
        context.Labels.Add(new Label { Name = "Feature", ColorIndex = 0, CreatedAt = DateTime.UtcNow });
        await context.SaveChangesAsync();
        var controller = new LabelsController(context);

        var result = await controller.Create(new CreateLabelRequest("FEATURE", 1));

        result.Should().BeOfType<ConflictObjectResult>();
    }

    // --- Update ---

    [Fact]
    public async Task Update_UpdatesNameAndColor_ReturnsUpdatedLabel()
    {
        using var context = CreateContext();
        var label = new Label { Name = "Old Name", ColorIndex = 0, CreatedAt = DateTime.UtcNow };
        context.Labels.Add(label);
        await context.SaveChangesAsync();
        var controller = new LabelsController(context);

        var result = await controller.Update(label.Id, new UpdateLabelRequest("New Name", 5));

        var ok = result.Should().BeOfType<OkObjectResult>().Subject;
        var updated = ok.Value.Should().BeOfType<Label>().Subject;
        updated.Name.Should().Be("New Name");
        updated.ColorIndex.Should().Be(5);
    }

    [Fact]
    public async Task Update_WhenLabelNotFound_Returns404()
    {
        using var context = CreateContext();
        var controller = new LabelsController(context);

        var result = await controller.Update(999, new UpdateLabelRequest("Name", 0));

        result.Should().BeOfType<NotFoundObjectResult>();
    }

    [Fact]
    public async Task Update_WhenRenamingToExistingLabelName_Returns409()
    {
        using var context = CreateContext();
        context.Labels.AddRange(
            new Label { Name = "Alpha", ColorIndex = 0, CreatedAt = DateTime.UtcNow },
            new Label { Name = "Beta", ColorIndex = 1, CreatedAt = DateTime.UtcNow }
        );
        await context.SaveChangesAsync();
        var alpha = await context.Labels.FirstAsync(l => l.Name == "Alpha");
        var controller = new LabelsController(context);

        var result = await controller.Update(alpha.Id, new UpdateLabelRequest("Beta", 0));

        result.Should().BeOfType<ConflictObjectResult>();
    }

    [Fact]
    public async Task Update_WhenSavingWithSameName_DoesNotReturn409()
    {
        using var context = CreateContext();
        var label = new Label { Name = "Existing", ColorIndex = 0, CreatedAt = DateTime.UtcNow };
        context.Labels.Add(label);
        await context.SaveChangesAsync();
        var controller = new LabelsController(context);

        var result = await controller.Update(label.Id, new UpdateLabelRequest("Existing", 4));

        result.Should().BeOfType<OkObjectResult>();
    }

    // --- Delete ---

    [Fact]
    public async Task Delete_Returns204AndRemovesLabel()
    {
        using var context = CreateContext();
        var label = new Label { Name = "ToDelete", ColorIndex = 0, CreatedAt = DateTime.UtcNow };
        context.Labels.Add(label);
        await context.SaveChangesAsync();
        var controller = new LabelsController(context);

        var result = await controller.Delete(label.Id);

        result.Should().BeOfType<NoContentResult>();
        context.Labels.Should().BeEmpty();
    }

    [Fact]
    public async Task Delete_WhenLabelNotFound_Returns404()
    {
        using var context = CreateContext();
        var controller = new LabelsController(context);

        var result = await controller.Delete(999);

        result.Should().BeOfType<NotFoundObjectResult>();
    }
}
