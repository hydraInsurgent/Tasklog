using FluentAssertions;
using Tasklog.Api.Services;

namespace Tasklog.Tests;

// Unit tests for the pure HabitStreak helper. No DbContext - it's a plain function over
// dates + an injected "today", mirroring the ComputeDueStatus testing approach.
public class HabitStreakTests
{
    private static readonly DateTime Today = new(2026, 5, 28); // a fixed "today"

    private static DateTime[] Days(params int[] daysOfMay) =>
        daysOfMay.Select(d => new DateTime(2026, 5, d)).ToArray();

    [Fact]
    public void Empty_IsZero()
    {
        HabitStreak.CurrentStreak(Array.Empty<DateTime>(), Today).Should().Be(0);
    }

    [Fact]
    public void DoneTodayOnly_IsOne()
    {
        HabitStreak.CurrentStreak(Days(28), Today).Should().Be(1);
    }

    [Fact]
    public void ConsecutiveRunEndingToday_CountsAll()
    {
        HabitStreak.CurrentStreak(Days(28, 27, 26), Today).Should().Be(3);
    }

    [Fact]
    public void NotDoneTodayButYesterdayRun_SurvivesViaGrace()
    {
        // Haven't checked in today yet, but the run through yesterday still counts.
        HabitStreak.CurrentStreak(Days(27, 26), Today).Should().Be(2);
    }

    [Fact]
    public void GapBreaksTheStreak()
    {
        // Done today, but the 27th was missed -> only today counts.
        HabitStreak.CurrentStreak(Days(28, 26), Today).Should().Be(1);
    }

    [Fact]
    public void LastDoneTwoDaysAgo_IsZero()
    {
        // Neither today nor yesterday -> the run is broken.
        HabitStreak.CurrentStreak(Days(26, 25), Today).Should().Be(0);
    }

    [Fact]
    public void YesterdayOnly_IsOne()
    {
        HabitStreak.CurrentStreak(Days(27), Today).Should().Be(1);
    }

    [Fact]
    public void IgnoresTimeComponent_AndUnorderedInput()
    {
        var dates = new[]
        {
            new DateTime(2026, 5, 26, 9, 30, 0),
            new DateTime(2026, 5, 28, 23, 0, 0),
            new DateTime(2026, 5, 27, 6, 0, 0),
        };
        HabitStreak.CurrentStreak(dates, Today).Should().Be(3);
    }

    [Fact]
    public void DuplicateDays_DoNotInflate()
    {
        HabitStreak.CurrentStreak(Days(28, 28, 27), Today).Should().Be(2);
    }

    // --- Schedule-aware streaks (#73 Habits v2): recurrence as the habit's schedule ---

    // May 2026: 26th = Tue, 28th = Thu, 21st = Thu, 19th = Tue. "every Tue & Thu".
    private const string TueThu = "FREQ=WEEKLY;BYDAY=TU,TH";

    [Fact]
    public void Scheduled_SkippingNonScheduledDays_DoesNotBreakStreak()
    {
        // Today = Thu 28. Checked in Thu 28 + Tue 26 (the two scheduled days). The
        // un-scheduled Wed 27 is skipped, so the streak is 2, not broken.
        HabitStreak.CurrentStreak(Days(28, 26), Today, TueThu).Should().Be(2);
    }

    [Fact]
    public void Scheduled_MissedScheduledDay_BreaksStreak()
    {
        // Today = Thu 28 (done), but the prior scheduled day Tue 26 was missed -> 1.
        HabitStreak.CurrentStreak(Days(28, 21), Today, TueThu).Should().Be(1);
    }

    [Fact]
    public void Scheduled_NotDoneTodayButPriorScheduledRun_SurvivesViaGrace()
    {
        // Today = Thu 28, not checked in yet. Tue 26 + Thu 21 done -> the run through the
        // previous scheduled day survives -> 2 (today not counted as a miss yet).
        HabitStreak.CurrentStreak(Days(26, 21), Today, TueThu).Should().Be(2);
    }

    [Fact]
    public void Scheduled_DailyRuleMatchesPlainBehavior()
    {
        // A daily rule is equivalent to no rule (every day scheduled).
        HabitStreak.CurrentStreak(Days(28, 27, 26), Today, "FREQ=DAILY").Should().Be(3);
        HabitStreak.CurrentStreak(Days(28, 26), Today, "FREQ=DAILY").Should().Be(1); // 27 missed
    }

    [Fact]
    public void Scheduled_InvalidRuleFallsBackToDaily()
    {
        HabitStreak.CurrentStreak(Days(28, 27, 26), Today, "not-a-rule").Should().Be(3);
    }
}
