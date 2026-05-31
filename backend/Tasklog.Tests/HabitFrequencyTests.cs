using FluentAssertions;
using Tasklog.Api.Services;

namespace Tasklog.Tests;

// Unit tests for the pure HabitFrequency helper ("x times a week", #75). No DbContext - it is
// a plain function over check-in dates + an injected "today", like HabitStreak / ComputeDueStatus.
// Dates are built relative to WeekStart(Today) so the tests don't depend on which weekday the
// fixed "today" happens to be.
public class HabitFrequencyTests
{
    private static readonly DateTime Today = new(2026, 5, 28);
    private static readonly DateTime WeekStart = HabitFrequency.WeekStart(Today);

    // A date `weeks` weeks before the current week's Monday, plus `dayOffset` days into that week.
    private static DateTime Day(int weeks, int dayOffset) => WeekStart.AddDays(-7 * weeks + dayOffset);

    [Fact]
    public void WeekStart_IsAlwaysMonday()
    {
        HabitFrequency.WeekStart(Today).DayOfWeek.Should().Be(DayOfWeek.Monday);
        // Idempotent: the Monday of a Monday is itself.
        HabitFrequency.WeekStart(WeekStart).Should().Be(WeekStart);
    }

    [Fact]
    public void ThisWeekCount_CountsDistinctDaysInCurrentWeekOnly()
    {
        // Three days this week + one in the previous week (must not count).
        var dates = new[] { Day(0, 0), Day(0, 1), Day(0, 2), Day(1, 3) };
        HabitFrequency.ThisWeekCount(dates, Today).Should().Be(3);
    }

    [Fact]
    public void WeekStreak_Empty_IsZero()
    {
        HabitFrequency.WeekStreak(Array.Empty<DateTime>(), Today).Should().Be(0);
    }

    [Fact]
    public void WeekStreak_CountsConsecutiveWeeksWithAtLeastOneCheckIn()
    {
        // This week (1), last week (1), two weeks ago (0) -> streak breaks at the empty week.
        var dates = new[] { Day(0, 1), Day(1, 2) };
        HabitFrequency.WeekStreak(dates, Today).Should().Be(2);
    }

    [Fact]
    public void WeekStreak_CurrentWeekNotDoneYet_GraceFromCompletedWeeks()
    {
        // No check-in this week yet, but the previous two weeks each have one: the in-progress
        // current week doesn't break the run (grace, one period up from HabitStreak's).
        var dates = new[] { Day(1, 0), Day(2, 3) };
        HabitFrequency.WeekStreak(dates, Today).Should().Be(2);
    }

    [Fact]
    public void WeekStreak_NoRecentActivity_IsZero()
    {
        // Current and last week both empty -> nothing keeping it alive.
        var dates = new[] { Day(2, 0) };
        HabitFrequency.WeekStreak(dates, Today).Should().Be(0);
    }

    [Fact]
    public void RecentWeeks_ClassifiesMetPartialNone_NewestLast()
    {
        const int target = 3;
        // Two weeks ago: 3 check-ins (met). Last week: 1 (partial). This week: 0 (none).
        var dates = new[]
        {
            Day(2, 0), Day(2, 1), Day(2, 2), // met
            Day(1, 4),                        // partial
        };
        var weeks = HabitFrequency.RecentWeeks(dates, Today, target, 3);

        weeks.Should().HaveCount(3);
        weeks[0].Status.Should().Be("met");
        weeks[1].Status.Should().Be("partial");
        weeks[2].Status.Should().Be("none");
        // Oldest first, current week last.
        weeks[2].WeekStart.Should().Be(WeekStart);
        weeks[0].Count.Should().Be(3);
    }
}
