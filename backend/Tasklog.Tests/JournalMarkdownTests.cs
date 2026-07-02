using System.Text.Json;
using FluentAssertions;
using Tasklog.Api.Models;
using Tasklog.Api.Services;

namespace Tasklog.Tests;

// JournalMarkdown is a pure function: templates + parsed contents + check-ins in,
// markdown out. These tests pin the note's shape (frontmatter, sections, derived
// evening fields) so the export format cannot drift silently.
public class JournalMarkdownTests
{
    private static readonly DateTime Day = new(2026, 7, 2);

    private static List<JournalTemplate> Templates() =>
        JournalTemplates.Definitions.Select(d => new JournalTemplate
        {
            Key = d.Key,
            Name = d.Name,
            SectionsJson = d.SectionsJson,
            SortOrder = d.SortOrder,
        }).ToList();

    private static Dictionary<string, JsonElement> Content(string dailyJson) => new()
    {
        ["daily"] = JsonDocument.Parse(dailyJson).RootElement.Clone(),
    };

    private static JournalMarkdown.CheckinData Checkin(int hour, string word, int energy, int? moc) =>
        new(Day.AddHours(hour), new[] { word }, energy, moc);

    private static string Render(
        Dictionary<string, JsonElement>? content = null,
        List<JournalMarkdown.CheckinData>? checkins = null,
        Dictionary<int, JournalMarkdown.PlanTaskData>? planTasks = null,
        List<string>? unplanned = null) =>
        JournalMarkdown.Render(
            Day,
            Templates(),
            content ?? new Dictionary<string, JsonElement>(),
            checkins ?? new List<JournalMarkdown.CheckinData>(),
            planTasks ?? new Dictionary<int, JournalMarkdown.PlanTaskData>(),
            unplanned ?? new List<string>());

    [Fact]
    public void Render_Frontmatter_CarriesMoodAndEnergyShift()
    {
        var md = Render(checkins: new List<JournalMarkdown.CheckinData>
        {
            Checkin(7, "hopeful", 8, 310),
            Checkin(21, "drained", 2, 100),
        });

        md.Should().Contain("type: daily-note");
        md.Should().Contain("date: 2026-07-02");
        md.Should().Contain("mood: hopeful -> drained");
        md.Should().Contain("energy: 8 -> 2");
        md.Should().Contain("# Thursday, 2 July 2026");
        md.Should().Contain("[[2026-07-01|Yesterday]] | [[2026-07-03|Tomorrow]]");
    }

    [Fact]
    public void Render_ProseSection_BecomesBlockquote()
    {
        var md = Render(Content("""{ "whats_going_on": "Woke before the alarm.\nWorkable morning." }"""));

        md.Should().Contain("## What's going on");
        md.Should().Contain("> Woke before the alarm.");
        md.Should().Contain("> Workable morning.");
    }

    [Fact]
    public void Render_OptionalEmptySections_StaySilent()
    {
        var md = Render();

        // Journal + Daily review are optional ("earned depth only") - no heading when empty.
        md.Should().NotContain("## Journal");
        md.Should().NotContain("## Daily review");
        // Non-optional sections keep the note's shape even when empty.
        md.Should().Contain("## Mind dump");
        md.Should().Contain("## Evening review");
    }

    [Fact]
    public void Render_Plan_ChecksCompletedAndMarksDeleted()
    {
        var content = Content("""
            { "todays_plan": { "buckets": { "non_negotiable": [1, 99], "if_energy": [], "easy_wins": [] } } }
            """);
        var tasks = new Dictionary<int, JournalMarkdown.PlanTaskData>
        {
            [1] = new(1, "DSA daily problem", true),
        };

        var md = Render(content, planTasks: tasks, unplanned: new List<string> { "Brilliant problems x3" });

        md.Should().Contain("**Non-negotiable**");
        md.Should().Contain("- [x] DSA daily problem");
        md.Should().Contain("- [ ] (deleted task)"); // id 99 no longer exists
        md.Should().Contain("**Unplanned, got done**");
        md.Should().Contain("- [x] Brilliant problems x3");
    }

    [Fact]
    public void Render_MindItems_ClearedGetsStruckThrough()
    {
        var md = Render(Content("""
            { "front_of_mind": [ { "text": "Career Kit feedback", "cleared": false },
                                 { "text": "Blog publish", "cleared": true } ] }
            """));

        md.Should().Contain("- Career Kit feedback");
        md.Should().Contain("- ~~Blog publish~~ (cleared)");
    }

    [Fact]
    public void Render_Evening_DerivesShiftAndEodFromCheckins()
    {
        var md = Render(
            Content("""{ "evening_review": { "patternNoticed": "no anchor after DSA" } }"""),
            checkins: new List<JournalMarkdown.CheckinData> { Checkin(7, "charged", 9, 310), Checkin(22, "flat", 1, 100) });

        md.Should().Contain("**Emotion shift:** charged -> flat");
        md.Should().Contain("**Pattern noticed:** no anchor after DSA");
        md.Should().Contain("**Energy at end of day:** 1");
        md.Should().Contain("**One small adjustment:** --"); // unfilled fields render as --
    }

    [Fact]
    public void Render_SingleCheckin_ShiftPendsOnEvening()
    {
        var md = Render(checkins: new List<JournalMarkdown.CheckinData> { Checkin(7, "hopeful", 8, null) });

        md.Should().Contain("**Emotion shift:** hopeful -> (no evening check-in)");
        md.Should().Contain("**Energy at end of day:** --");
        // A check-in without wheel picks has no MoC level; the row omits it.
        md.Should().Contain("- 07:00 - hopeful - energy 8");
        md.Should().NotContain("MoC");
    }

    [Fact]
    public void Render_GratitudeAndAffirmations_RenderAsLists()
    {
        var content = new Dictionary<string, JsonElement>
        {
            ["gratitude"] = JsonDocument.Parse("""{ "items": ["Morning walk weather"] }""").RootElement.Clone(),
            ["affirmations"] = JsonDocument.Parse("""{ "items": ["I ship before I polish."] }""").RootElement.Clone(),
        };

        var md = JournalMarkdown.Render(Day, Templates(), content,
            new List<JournalMarkdown.CheckinData>(), new Dictionary<int, JournalMarkdown.PlanTaskData>(), new List<string>());

        md.Should().Contain("## Gratitude");
        md.Should().Contain("- Morning walk weather");
        md.Should().Contain("## Affirmations");
        md.Should().Contain("- I ship before I polish.");
    }
}
