using System.Text.Json.Serialization;

namespace Tasklog.Api.Models
{
    // The Capture inbox (#87) - the generic ingest + trust + audit layer of the Living
    // Profile. Anything the AI (or later, MCP / manual entry / uploads) extracts from
    // free-form input lands here as a PROPOSED row first. Nothing enters a typed home
    // (Tasks today; MoodCheckins etc. in later minors) until the user confirms it - that
    // is the trust loop. The row survives after resolution as an audit trail of what was
    // proposed, kept, and dismissed.
    //
    // Type/Status/Source are strings, not enums: the type registry is meant to grow
    // (task -> mood -> mention -> expense...) without a migration per facet.
    public class Capture
    {
        public int Id { get; set; }

        // Registered capture type. v4.0 writes only "task"; the column is the whole
        // type registry's door.
        public string Type { get; set; } = "";

        // Trust-loop state: "proposed" -> "confirmed" | "dismissed".
        public string Status { get; set; } = "proposed";

        // Where this capture came from: "companion" today; anticipates "mcp" /
        // "claude.ai" / "manual" / "upload" (the two-doors parity design).
        public string Source { get; set; } = "companion";

        // The conversation this was proposed in, if any. SET NULL on session delete -
        // a confirmed capture's audit row outlives its source (the #86 precedent of
        // preserving history across deletes).
        public int? SessionId { get; set; }

        // Back-nav for the FK. JsonIgnore to avoid Session -> Captures -> Session cycles.
        [JsonIgnore]
        public CompanionSession? Session { get; set; }

        // Type-specific payload as JSON TEXT. For "task":
        // { title, projectId?, newProjectName?, deadline? }.
        // Opaque to SQL; the typed home is materialized from it on confirm.
        // PAIRED CONTRACT (change all together): the writer is
        // CapturesController.Confirm, the producer schemas are the zod tools in
        // frontend/src/app/api/companion/chat/route.ts, and the client type is
        // CaptureDto.payload in frontend/src/lib/api.ts.
        public string PayloadJson { get; set; } = "{}";

        // The words that triggered the proposal - a short quote from the user's own
        // message, shown on the card so trust is inspectable ("I got this from HERE").
        public string? Span { get; set; }

        // Model-reported confidence 0..1, if provided. Display-only.
        public double? Confidence { get; set; }

        // Set on confirm: which typed home the capture materialized into and the row id
        // there (e.g. "task" / 123). Generic on purpose - a later capture may confirm
        // into "complete-task" or "moodCheckin" without schema changes.
        public string? ConfirmedType { get; set; }

        public int? ConfirmedId { get; set; }

        public DateTime CreatedAt { get; set; }

        public DateTime UpdatedAt { get; set; }
    }
}
