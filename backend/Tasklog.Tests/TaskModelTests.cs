using FluentAssertions;
using Tasklog.Api.Models;

namespace Tasklog.Tests;

// Pure unit tests for the dueStatus bucket logic. ComputeDueStatus is separated from
// DateTime.Today so "today" can be injected and the buckets exercised deterministically.
// Anchor weekdays used below: 2026-06-03 = Wednesday, 2026-06-07 = Sunday, 2026-06-13 = Saturday.
public class TaskModelTests
{
    [Fact]
    public void ComputeDueStatus_NullDeadline_ReturnsNone()
    {
        TaskModel.ComputeDueStatus(null, new DateTime(2026, 6, 3)).Should().Be("none");
    }

    [Theory]
    // today is Wednesday 2026-06-03; upcoming Sunday is 2026-06-07.
    [InlineData("2026-06-02", "overdue")]   // yesterday
    [InlineData("2026-06-03", "today")]     // today
    [InlineData("2026-06-05", "this_week")] // Friday, same week
    [InlineData("2026-06-07", "this_week")] // upcoming Sunday (inclusive boundary)
    [InlineData("2026-06-08", "later")]     // Monday, next week
    [InlineData("2026-07-01", "later")]     // far future
    public void ComputeDueStatus_FromWednesday_BucketsCorrectly(string deadline, string expected)
    {
        var today = new DateTime(2026, 6, 3);
        TaskModel.ComputeDueStatus(DateTime.Parse(deadline), today).Should().Be(expected);
    }

    [Fact]
    public void ComputeDueStatus_OnSunday_TomorrowIsLater()
    {
        // today is Sunday 2026-06-07; the rest-of-week window is empty, so tomorrow is "later".
        var today = new DateTime(2026, 6, 7);
        TaskModel.ComputeDueStatus(new DateTime(2026, 6, 8), today).Should().Be("later");
    }

    [Fact]
    public void ComputeDueStatus_OnSaturday_SundayIsThisWeek()
    {
        // today is Saturday 2026-06-13; upcoming Sunday 2026-06-14 is still this week.
        var today = new DateTime(2026, 6, 13);
        TaskModel.ComputeDueStatus(new DateTime(2026, 6, 14), today).Should().Be("this_week");
        TaskModel.ComputeDueStatus(new DateTime(2026, 6, 15), today).Should().Be("later");
    }

    [Fact]
    public void ComputeDueStatus_ComparesDateOnly_IgnoringTimeOfDay()
    {
        // A deadline later in the same day as "now" is still "today" (date-only comparison).
        var today = new DateTime(2026, 6, 3, 9, 0, 0);
        TaskModel.ComputeDueStatus(new DateTime(2026, 6, 3, 23, 0, 0), today).Should().Be("today");
    }

    [Fact]
    public void DueStatus_Property_UsesComputeDueStatus()
    {
        // The instance getter wires ComputeDueStatus to DateTime.Today. A null deadline is
        // always "none" regardless of the date, which lets us assert without freezing the clock.
        var task = new TaskModel { Title = "x", Deadline = null };
        task.DueStatus.Should().Be("none");
    }
}
