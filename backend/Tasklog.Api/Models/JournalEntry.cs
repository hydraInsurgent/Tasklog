using System.Text.Json.Serialization;

namespace Tasklog.Api.Models
{
    // One journal note instance: a template filled in for a calendar day. The unique
    // index on (TemplateId, EntryDate) makes "one entry per template per date" a database
    // guarantee - the API upserts rather than ever creating a second note for a day.
    public class JournalEntry
    {
        public int Id { get; set; }

        public int TemplateId { get; set; }

        // Back-nav for the FK. JsonIgnore: responses are projected records that carry
        // the template key instead of the full template row.
        [JsonIgnore]
        public JournalTemplate? Template { get; set; }

        // The day this entry belongs to (date-only, stored at local midnight - the same
        // convention as habit CheckIn.CheckInDate).
        public DateTime EntryDate { get; set; }

        // Section contents as a JSON object keyed by section key. Value shape depends on
        // the section kind (prose = string, list = string[], plan = bucketed task ids...)
        // - the client contract is frontend/src/lib/journal.ts and the renderer mirror is
        // Services/JournalMarkdown.cs. Plain TEXT, parsed with System.Text.Json.
        public string ContentJson { get; set; } = "{}";

        public DateTime CreatedAt { get; set; }

        public DateTime UpdatedAt { get; set; }
    }
}
