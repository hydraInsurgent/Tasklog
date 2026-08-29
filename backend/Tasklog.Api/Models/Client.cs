using System.Text.Json.Serialization;

namespace Tasklog.Api.Models
{
    // A grouping level ABOVE Project (#86) - the user's "client" concept from Toggl: a
    // life area (Family, Self, Leisure, Work) that owns projects. Purely organizational,
    // and mirrors the Project shape (name + optional color). A project's ClientId is
    // nullable (Ungrouped); deleting a client SET-NULLs its projects' ClientId rather than
    // cascading, so no projects or tasks are ever lost with the client (see DbContext).
    public class Client
    {
        public int Id { get; set; }
        public required string Name { get; set; }
        public DateTime CreatedAt { get; set; }

        // Optional display color, a "#RRGGBB" hex string. Null = no color. Same convention
        // and validation as Project.Color.
        public string? Color { get; set; }

        // Projects grouped under this client. [JsonIgnore] so a client response never drags
        // its projects along (they are read via /api/projects) and to avoid a
        // Client -> Projects -> Client serialization cycle. The nav exists for the SET-NULL
        // FK and for grouping queries.
        [JsonIgnore]
        public ICollection<Project> Projects { get; set; } = new List<Project>();
    }
}
