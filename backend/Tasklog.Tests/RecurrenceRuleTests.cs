using FluentAssertions;
using Tasklog.Api.Services;

namespace Tasklog.Tests;

// Unit tests for the pure RecurrenceRule helper: parsing/validation of the supported
// RRULE subset and the clock-free NextDeadline expansion. No DbContext - the helper has
// no dependencies, mirroring the ComputeDueStatus testing approach.
public class RecurrenceRuleTests
{
    // --- Parse + Serialize round-trip (canonical form) ---

    [Theory]
    [InlineData("FREQ=DAILY", "FREQ=DAILY")]
    [InlineData("FREQ=DAILY;INTERVAL=3", "FREQ=DAILY;INTERVAL=3")]
    [InlineData("FREQ=WEEKLY;BYDAY=MO,WE,FR", "FREQ=WEEKLY;BYDAY=MO,WE,FR")]
    [InlineData("FREQ=MONTHLY;BYMONTHDAY=15", "FREQ=MONTHLY;BYMONTHDAY=15")]
    public void Parse_Then_Serialize_RoundTrips(string input, string expected)
    {
        RecurrenceRule.TryParse(input, out var rule, out var error).Should().BeTrue(error);
        rule!.Serialize().Should().Be(expected);
    }

    [Fact]
    public void Parse_NormalizesCasingAndWeekdayOrder()
    {
        // Lowercase keys/values and out-of-order weekdays normalize to canonical form.
        RecurrenceRule.TryParse("freq=weekly;byday=fr,mo,we", out var rule, out _).Should().BeTrue();
        rule!.Serialize().Should().Be("FREQ=WEEKLY;BYDAY=MO,WE,FR");
    }

    [Fact]
    public void Parse_DefaultsIntervalToOne()
    {
        RecurrenceRule.TryParse("FREQ=DAILY", out var rule, out _).Should().BeTrue();
        rule!.Interval.Should().Be(1);
    }

    // --- NextDeadline: daily / every-N-days ---

    [Fact]
    public void NextDeadline_Daily_AdvancesOneDay()
    {
        RecurrenceRule.TryParse("FREQ=DAILY", out var rule, out _);
        var next = rule!.NextDeadline(new DateTime(2026, 5, 27));
        next.Should().Be(new DateTime(2026, 5, 28));
    }

    [Fact]
    public void NextDeadline_EveryThreeDays_AdvancesThreeDays()
    {
        RecurrenceRule.TryParse("FREQ=DAILY;INTERVAL=3", out var rule, out _);
        var next = rule!.NextDeadline(new DateTime(2026, 5, 27));
        next.Should().Be(new DateTime(2026, 5, 30));
    }

    [Fact]
    public void NextDeadline_PreservesTimeOfDay()
    {
        RecurrenceRule.TryParse("FREQ=DAILY", out var rule, out _);
        var next = rule!.NextDeadline(new DateTime(2026, 5, 27, 15, 30, 0));
        next.Should().Be(new DateTime(2026, 5, 28, 15, 30, 0));
        next.TimeOfDay.Should().Be(new TimeSpan(15, 30, 0));
    }

    // --- NextDeadline: weekly ---

    [Fact]
    public void NextDeadline_WeeklySingleDay_LandsOnThatWeekday()
    {
        RecurrenceRule.TryParse("FREQ=WEEKLY;BYDAY=MO", out var rule, out _);
        var next = rule!.NextDeadline(new DateTime(2026, 5, 27)); // a Wednesday
        next.DayOfWeek.Should().Be(DayOfWeek.Monday);
        next.Should().BeAfter(new DateTime(2026, 5, 27));
        (next - new DateTime(2026, 5, 27)).TotalDays.Should().BeLessThanOrEqualTo(7);
    }

    [Fact]
    public void NextDeadline_WeeklyMultiDay_PicksSoonestMatchingDay()
    {
        RecurrenceRule.TryParse("FREQ=WEEKLY;BYDAY=MO,WE,FR", out var rule, out _);
        var current = new DateTime(2026, 5, 27); // Wednesday
        var next = rule!.NextDeadline(current);

        // Must be one of the configured weekdays and the very soonest such day.
        var configured = new[] { DayOfWeek.Monday, DayOfWeek.Wednesday, DayOfWeek.Friday };
        next.DayOfWeek.Should().BeOneOf(configured);
        for (var d = current.Date.AddDays(1); d < next.Date; d = d.AddDays(1))
            configured.Should().NotContain(d.DayOfWeek, "no earlier matching weekday should be skipped");
    }

    // --- NextDeadline: monthly ---

    [Fact]
    public void NextDeadline_Monthly_AdvancesOneMonthToSameDay()
    {
        RecurrenceRule.TryParse("FREQ=MONTHLY;BYMONTHDAY=15", out var rule, out _);
        var next = rule!.NextDeadline(new DateTime(2026, 1, 15));
        next.Should().Be(new DateTime(2026, 2, 15));
    }

    [Fact]
    public void NextDeadline_Monthly_ClampsToMonthEndForShortMonths()
    {
        // The 31st in a month that has no 31st (Feb) clamps to the last day.
        RecurrenceRule.TryParse("FREQ=MONTHLY;BYMONTHDAY=31", out var rule, out _);
        var next = rule!.NextDeadline(new DateTime(2026, 1, 31));
        next.Should().Be(new DateTime(2026, 2, 28)); // 2026 is not a leap year
    }

    [Fact]
    public void NextDeadline_Monthly_RollsOverYearAndKeepsTime()
    {
        RecurrenceRule.TryParse("FREQ=MONTHLY;BYMONTHDAY=15", out var rule, out _);
        var next = rule!.NextDeadline(new DateTime(2026, 12, 15, 9, 0, 0));
        next.Should().Be(new DateTime(2027, 1, 15, 9, 0, 0));
    }

    // --- Validation: rejects unsupported grammar with a clear error ---

    [Theory]
    [InlineData("FREQ=YEARLY", "FREQ")]                       // unsupported frequency
    [InlineData("FREQ=HOURLY", "FREQ")]
    [InlineData("FREQ=DAILY;COUNT=5", "COUNT")]               // end conditions deferred
    [InlineData("FREQ=DAILY;UNTIL=20261231", "UNTIL")]
    [InlineData("FREQ=MONTHLY;BYSETPOS=1;BYDAY=MO", "")]      // BYSETPOS unsupported
    [InlineData("FREQ=MONTHLY;BYDAY=3TH", "")]                // nth-weekday deferred
    [InlineData("FREQ=WEEKLY;BYDAY=3TH", "")]
    [InlineData("FREQ=MONTHLY;BYMONTHDAY=-1", "BYMONTHDAY")]  // from-end deferred
    [InlineData("FREQ=MONTHLY;BYMONTHDAY=0", "BYMONTHDAY")]
    [InlineData("FREQ=MONTHLY;BYMONTHDAY=32", "BYMONTHDAY")]
    [InlineData("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO", "INTERVAL")] // weekly interval>1 deferred
    [InlineData("FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=1", "INTERVAL")]
    [InlineData("FREQ=WEEKLY", "BYDAY")]                      // weekly needs BYDAY
    [InlineData("FREQ=MONTHLY", "BYMONTHDAY")]                // monthly needs BYMONTHDAY
    [InlineData("FREQ=WEEKLY;BYDAY=ZZ", "ZZ")]                // unknown weekday code
    [InlineData("INTERVAL=2", "FREQ")]                        // missing FREQ
    [InlineData("FREQ=DAILY;INTERVAL=0", "INTERVAL")]         // interval must be positive
    [InlineData("", "")]                                      // empty
    [InlineData("garbage", "")]                               // malformed (no =)
    public void Parse_RejectsUnsupportedOrInvalid(string input, string errorContains)
    {
        RecurrenceRule.TryParse(input, out var rule, out var error).Should().BeFalse($"'{input}' should be rejected");
        rule.Should().BeNull();
        error.Should().NotBeNullOrWhiteSpace();
        if (errorContains.Length > 0)
            error!.Should().Contain(errorContains);
    }

    [Fact]
    public void Parse_RejectsDailyWithByDay()
    {
        // Specific weekdays belong on FREQ=WEEKLY, not FREQ=DAILY.
        RecurrenceRule.TryParse("FREQ=DAILY;BYDAY=MO,TU", out _, out var error).Should().BeFalse();
        error.Should().Contain("WEEKLY");
    }
}
