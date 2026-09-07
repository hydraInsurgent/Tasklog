using System.Text.Json.Serialization;

namespace Tasklog.Api.Models
{
    // One companion conversation = one calendar day (#87). The unique index on SessionDate
    // makes "one session per day" a database guarantee (the JournalEntry precedent) - the
    // API get-or-creates today's row rather than ever opening a second thread for a day.
    //
    // The raw transcript is the SOURCE of the Living Profile: captures reference the session
    // they came from, and the v4.1 daily note will be derived from it. It is saved on every
    // turn, before/independently of any AI success, so the user's words are never lost.
    public class CompanionSession
    {
        public int Id { get; set; }

        // The day this conversation belongs to (date-only, stored at local midnight - the
        // same convention as JournalEntry.EntryDate and CheckIn.CheckInDate).
        public DateTime SessionDate { get; set; }

        // Full transcript as a JSON array of { role, content, at } objects. Plain TEXT,
        // opaque to SQL by design (the JournalEntry.ContentJson precedent). The client
        // owns the shape; the API stores and returns it verbatim.
        public string MessagesJson { get; set; } = "[]";

        // The Claude Agent SDK's own session id for this conversation. The companion route
        // passes it back as `resume` on every turn (per-turn query(), Decision 9 in P87)
        // so the SDK continues one coherent conversation across request-scoped calls.
        // Null until the first successful AI turn.
        public string? SdkSessionId { get; set; }

        public DateTime CreatedAt { get; set; }

        public DateTime UpdatedAt { get; set; }

        // Captures proposed during this session. JsonIgnore: session responses carry the
        // transcript; captures are listed via /api/captures?sessionId= instead.
        [JsonIgnore]
        public List<Capture> Captures { get; set; } = new();
    }
}
