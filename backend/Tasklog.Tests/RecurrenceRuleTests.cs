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

    // These stay rejected after v2.15.0 (COUNT/UNTIL/nth-weekday/negative-monthday/INTERVAL>1
    // moved to the accepted set - see Parse_Advanced_RoundTrips / Parse_Advanced_RejectsInvalid).
    [Theory]
    [InlineData("FREQ=YEARLY", "FREQ")]                       // unsupported frequency
    [InlineData("FREQ=HOURLY", "FREQ")]
    [InlineData("FREQ=MONTHLY;BYSETPOS=1;BYDAY=MO", "")]      // BYSETPOS unsupported
    [InlineData("FREQ=WEEKLY;BYDAY=3TH", "")]                 // nth-weekday only valid MONTHLY
    [InlineData("FREQ=MONTHLY;BYMONTHDAY=0", "BYMONTHDAY")]
    [InlineData("FREQ=MONTHLY;BYMONTHDAY=32", "BYMONTHDAY")]
    [InlineData("FREQ=WEEKLY", "BYDAY")]                      // weekly needs BYDAY
    [InlineData("FREQ=MONTHLY", "")]                          // monthly needs a day rule
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

    // --- v2.15.0: advanced grammar round-trips ---

    [Theory]
    [InlineData("FREQ=MONTHLY;BYDAY=3TH", "FREQ=MONTHLY;BYDAY=3TH")]       // nth-weekday
    [InlineData("FREQ=MONTHLY;BYDAY=-1FR", "FREQ=MONTHLY;BYDAY=-1FR")]     // last weekday
    [InlineData("FREQ=MONTHLY;BYMONTHDAY=-1", "FREQ=MONTHLY;BYMONTHDAY=-1")] // from month end
    [InlineData("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO", "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO")]
    [InlineData("FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=1", "FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=1")]
    [InlineData("FREQ=DAILY;UNTIL=20261231", "FREQ=DAILY;UNTIL=20261231")]
    [InlineData("FREQ=DAILY;COUNT=5", "FREQ=DAILY;COUNT=5")]
    public void Parse_Advanced_RoundTrips(string input, string expected)
    {
        RecurrenceRule.TryParse(input, out var rule, out var error).Should().BeTrue(error);
        rule!.Serialize().Should().Be(expected);
    }

    [Fact]
    public void Parse_UntilIso_NormalizesToBasicDate()
    {
        RecurrenceRule.TryParse("FREQ=DAILY;UNTIL=2026-12-31", out var rule, out _).Should().BeTrue();
        rule!.Serialize().Should().Be("FREQ=DAILY;UNTIL=20261231");
    }

    // --- v2.15.0: NextDeadline for the advanced forms ---

    [Fact]
    public void NextDeadline_MonthlyNthWeekday_LandsOnThatOccurrence()
    {
        // 3rd Thursday of the following month (May 2026 -> June 2026).
        RecurrenceRule.TryParse("FREQ=MONTHLY;BYDAY=3TH", out var rule, out _);
        var next = rule!.NextDeadline(new DateTime(2026, 5, 27));
        next.Month.Should().Be(6);
        next.DayOfWeek.Should().Be(DayOfWeek.Thursday);
        next.Day.Should().BeInRange(15, 21); // the 3rd weekday of a month always falls here
    }

    [Fact]
    public void NextDeadline_MonthlyLastWeekday_LandsOnLastOccurrence()
    {
        RecurrenceRule.TryParse("FREQ=MONTHLY;BYDAY=-1FR", out var rule, out _);
        var next = rule!.NextDeadline(new DateTime(2026, 5, 27));
        next.DayOfWeek.Should().Be(DayOfWeek.Friday);
        // Last occurrence => no later same-weekday in the month.
        next.AddDays(7).Month.Should().NotBe(next.Month);
    }

    [Fact]
    public void NextDeadline_MonthlyFromEnd_LandsOnLastDay()
    {
        RecurrenceRule.TryParse("FREQ=MONTHLY;BYMONTHDAY=-1", out var rule, out _);
        var next = rule!.NextDeadline(new DateTime(2026, 5, 15));
        next.Should().Be(new DateTime(2026, 6, 30)); // June has 30 days
    }

    [Fact]
    public void NextDeadline_WeeklyEveryOther_SingleDay_AdvancesTwoWeeks()
    {
        // Anchor on a real Monday so the every-other-week skip is exercised.
        var monday = new DateTime(2026, 6, 1);
        while (monday.DayOfWeek != DayOfWeek.Monday) monday = monday.AddDays(1);
        RecurrenceRule.TryParse("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO", out var rule, out _);
        rule!.NextDeadline(monday).Should().Be(monday.AddDays(14));
    }

    [Fact]
    public void NextDeadline_WeeklyEveryOther_MultiDay_StaysInActiveWeek()
    {
        // From a Monday with BYDAY=MO,WE the next is the same week's Wednesday (+2),
        // not skipped - the interval only skips whole weeks, not days within the active one.
        var monday = new DateTime(2026, 6, 1);
        while (monday.DayOfWeek != DayOfWeek.Monday) monday = monday.AddDays(1);
        RecurrenceRule.TryParse("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE", out var rule, out _);
        rule!.NextDeadline(monday).Should().Be(monday.AddDays(2));
    }

    [Fact]
    public void NextDeadline_MonthlyEveryThreeMonths_AddsThreeMonths()
    {
        RecurrenceRule.TryParse("FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=15", out var rule, out _);
        rule!.NextDeadline(new DateTime(2026, 1, 15)).Should().Be(new DateTime(2026, 4, 15));
    }

    // --- v2.15.0: validation of the new grammar ---

    [Theory]
    [InlineData("FREQ=MONTHLY;BYDAY=3TH,1MO")]          // more than one ordinaled weekday
    [InlineData("FREQ=MONTHLY;BYDAY=5TH")]              // ordinal out of {1..4,-1}
    [InlineData("FREQ=MONTHLY;BYDAY=0FR")]
    [InlineData("FREQ=MONTHLY;BYDAY=-2MO")]
    [InlineData("FREQ=MONTHLY;BYDAY=MO")]               // monthly BYDAY needs an ordinal
    [InlineData("FREQ=WEEKLY;BYDAY=3TH")]               // nth-weekday only valid MONTHLY
    [InlineData("FREQ=MONTHLY;BYMONTHDAY=-29")]         // beyond the supported negative range
    [InlineData("FREQ=MONTHLY;BYMONTHDAY=15;BYDAY=3TH")] // both day rules
    [InlineData("FREQ=MONTHLY")]                        // neither day rule
    [InlineData("FREQ=DAILY;UNTIL=20261231;COUNT=5")]   // mutually exclusive
    [InlineData("FREQ=DAILY;UNTIL=nonsense")]
    [InlineData("FREQ=DAILY;COUNT=0")]
    public void Parse_Advanced_RejectsInvalid(string input)
    {
        RecurrenceRule.TryParse(input, out var rule, out var error).Should().BeFalse($"'{input}' should be rejected");
        rule.Should().BeNull();
        error.Should().NotBeNullOrWhiteSpace();
    }

    // --- v2.15.0: ShouldSpawn end-condition gate ---

    [Fact]
    public void ShouldSpawn_NoEndCondition_AlwaysTrue()
    {
        RecurrenceRule.TryParse("FREQ=DAILY", out var rule, out _);
        rule!.ShouldSpawn(new DateTime(2030, 1, 1), 999).Should().BeTrue();
    }

    [Fact]
    public void ShouldSpawn_Until_StopsOncePast()
    {
        RecurrenceRule.TryParse("FREQ=DAILY;UNTIL=20260601", out var rule, out _);
        rule!.ShouldSpawn(new DateTime(2026, 5, 30), 1).Should().BeTrue();
        rule.ShouldSpawn(new DateTime(2026, 6, 1), 1).Should().BeTrue();   // inclusive
        rule.ShouldSpawn(new DateTime(2026, 6, 2), 1).Should().BeFalse();
    }

    [Fact]
    public void ShouldSpawn_Count_StopsWhenReached()
    {
        RecurrenceRule.TryParse("FREQ=DAILY;COUNT=3", out var rule, out _);
        rule!.ShouldSpawn(new DateTime(2026, 6, 1), 2).Should().BeTrue();  // 2 exist -> spawn the 3rd
        rule.ShouldSpawn(new DateTime(2026, 6, 1), 3).Should().BeFalse();  // 3 exist -> stop
    }
}
