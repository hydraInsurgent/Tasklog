using Tasklog.Api.Models;

namespace Tasklog.Api.Services
{
    // Code-defined journal templates (v3.0 ships Daily, Gratitude, Affirmations - see
    // docs/plans/P79-ui-handover.md for where each section came from). Program.cs upserts
    // these into the JournalTemplates table by Key at startup, so editing a definition
    // here updates the row on next run without a migration.
    //
    // Section definition JSON shape: [{ "key", "title", "kind", "optional"? }] where kind is:
    //   checkins - derived from MoodCheckins, no stored content
    //   prose    - free text (string)
    //   projects - [{ "name", "focus" }]
    //   plan     - { "buckets": [{ "key", "title", "taskIds": [int] }] }
    //   mind     - transient list [{ "text", "cleared" }] (rendered as a rail widget)
    //   evening  - fixed sub-fields object (see Services/JournalContent.cs)
    //   list     - string[]
    public static class JournalTemplates
    {
        public static readonly IReadOnlyList<JournalTemplate> Definitions = new List<JournalTemplate>
        {
            new JournalTemplate
            {
                Key = "daily",
                Name = "Daily",
                Periodicity = "daily",
                SortOrder = 0,
                SectionsJson = """
                [
                  { "key": "checkins",       "title": "Check-ins",       "kind": "checkins" },
                  { "key": "whats_going_on", "title": "What's going on", "kind": "prose" },
                  { "key": "mind_dump",      "title": "Mind dump",       "kind": "prose" },
                  { "key": "projects_today", "title": "Projects today",  "kind": "projects" },
                  { "key": "todays_plan",    "title": "Today's plan",    "kind": "plan" },
                  { "key": "front_of_mind",  "title": "Front of mind",   "kind": "mind" },
                  { "key": "back_of_mind",   "title": "Back of mind",    "kind": "mind" },
                  { "key": "daily_review",   "title": "Daily review",    "kind": "prose", "optional": true },
                  { "key": "evening_review", "title": "Evening review",  "kind": "evening" },
                  { "key": "journal",        "title": "Journal",         "kind": "prose", "optional": true }
                ]
                """
            },
            new JournalTemplate
            {
                Key = "gratitude",
                Name = "Gratitude",
                Periodicity = "daily",
                SortOrder = 1,
                SectionsJson = """
                [
                  { "key": "items", "title": "Gratitude", "kind": "list" },
                  { "key": "note",  "title": "A line more", "kind": "prose", "optional": true }
                ]
                """
            },
            new JournalTemplate
            {
                Key = "affirmations",
                Name = "Affirmations",
                Periodicity = "daily",
                SortOrder = 2,
                SectionsJson = """
                [
                  { "key": "items", "title": "Affirmations", "kind": "list" }
                ]
                """
            }
        };
    }
}
