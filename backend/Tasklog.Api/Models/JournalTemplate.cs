namespace Tasklog.Api.Models
{
    // A journal note type (Daily, Gratitude, Affirmations). Definitions live in code
    // (Services/JournalTemplates.cs) and are upserted into this table by Key at startup -
    // there is no template editor UI in v3.0, but the table keeps entries FK-clean and
    // leaves room for one later.
    public class JournalTemplate
    {
        public int Id { get; set; }

        // Stable machine identifier ("daily", "gratitude", "affirmations"). Unique.
        // Entries are addressed by this key in the API.
        public string Key { get; set; } = string.Empty;

        public string Name { get; set; } = string.Empty;

        // "daily" for all v3.0 templates. Exists so weekly templates can slot in later.
        public string Periodicity { get; set; } = "daily";

        // Ordered section definitions as a JSON array of { key, title, kind, optional? }.
        // Stored as plain TEXT and parsed with System.Text.Json - content is opaque to SQL
        // by design (the project's first JSON-as-TEXT columns; see plan Decision 1).
        public string SectionsJson { get; set; } = "[]";

        // Display order of templates on the journal page (Daily first).
        public int SortOrder { get; set; }

        public DateTime CreatedAt { get; set; }
    }
}
