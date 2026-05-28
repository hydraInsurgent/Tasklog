using FluentAssertions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Tasklog.Api.Controllers;
using Tasklog.Api.Data;
using Tasklog.Api.Models;

namespace Tasklog.Tests;

public class HabitsControllerTests
{
    private static TasklogDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<TasklogDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new TasklogDbContext(options);
    }

    private static async Task<List<HabitResponse>> GetHabits(TasklogDbContext context)
    {
        var result = await new HabitsController(context).GetAll();
        var ok = result.Should().BeOfType<OkObjectResult>().Subject;
        return ok.Value.Should().BeAssignableTo<IEnumerable<HabitResponse>>().Subject.ToList();
    }

    [Fact]
    public async Task GetAll_ReturnsOnlyHabitTasks()
    {
        using var context = CreateContext();
        context.Tasks.AddRange(
            new TaskModel { Title = "Meditate", CreatedAt = DateTime.Now, IsHabit = true },
            new TaskModel { Title = "Buy milk", CreatedAt = DateTime.Now, IsHabit = false }
        );
        await context.SaveChangesAsync();

        var habits = await GetHabits(context);

        habits.Should().HaveCount(1);
        habits[0].Task.Title.Should().Be("Meditate");
    }

    [Fact]
    public async Task GetAll_NotCheckedInToday_StreakZero_DoneTodayFalse()
    {
        using var context = CreateContext();
        context.Tasks.Add(new TaskModel { Title = "Read", CreatedAt = DateTime.Now, IsHabit = true });
        await context.SaveChangesAsync();

        var habits = await GetHabits(context);

        habits[0].CurrentStreak.Should().Be(0);
        habits[0].DoneToday.Should().BeFalse();
    }

    [Fact]
    public async Task GetAll_CheckedInToday_StreakOne_DoneTodayTrue()
    {
        using var context = CreateContext();
        var task = new TaskModel { Title = "Read", CreatedAt = DateTime.Now, IsHabit = true };
        context.Tasks.Add(task);
        await context.SaveChangesAsync();
        context.CheckIns.Add(new CheckIn { TaskId = task.Id, CheckInDate = DateTime.Now.Date, CreatedAt = DateTime.Now });
        await context.SaveChangesAsync();

        var habits = await GetHabits(context);

        habits[0].CurrentStreak.Should().Be(1);
        habits[0].DoneToday.Should().BeTrue();
        habits[0].RecentCheckIns.Should().ContainSingle();
    }

    [Fact]
    public async Task GetAll_CountsConsecutiveRun()
    {
        using var context = CreateContext();
        var task = new TaskModel { Title = "Read", CreatedAt = DateTime.Now, IsHabit = true };
        context.Tasks.Add(task);
        await context.SaveChangesAsync();
        var today = DateTime.Now.Date;
        context.CheckIns.AddRange(
            new CheckIn { TaskId = task.Id, CheckInDate = today, CreatedAt = DateTime.Now },
            new CheckIn { TaskId = task.Id, CheckInDate = today.AddDays(-1), CreatedAt = DateTime.Now },
            new CheckIn { TaskId = task.Id, CheckInDate = today.AddDays(-2), CreatedAt = DateTime.Now }
        );
        await context.SaveChangesAsync();

        var habits = await GetHabits(context);

        habits[0].CurrentStreak.Should().Be(3);
    }

    [Fact]
    public async Task GetAll_NoHabits_ReturnsEmpty()
    {
        using var context = CreateContext();
        context.Tasks.Add(new TaskModel { Title = "Buy milk", CreatedAt = DateTime.Now, IsHabit = false });
        await context.SaveChangesAsync();

        var habits = await GetHabits(context);

        habits.Should().BeEmpty();
    }
}
