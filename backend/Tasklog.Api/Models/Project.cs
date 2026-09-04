namespace Tasklog.Api.Models
{
    public class Project
    {
        public int Id { get; set; }
        public required string Name { get; set; }
        public DateTime CreatedAt { get; set; }

        // Optional display color, a "#RRGGBB" hex string (#77). Null = no color (a neutral
        // default is used). Drives the time-tracking timeline block colors and a sidebar dot.
        public string? Color { get; set; }

        // The client (life area) this project is grouped under (#86). Null = Ungrouped.
        // SET-NULL on client delete, so a project outlives its client. The nav is serialized
        // (Client.Projects is [JsonIgnore], so there is no cycle) to give the sidebar the
        // client name/color alongside the project.
        public int? ClientId { get; set; }
        public Client? Client { get; set; }

        // Manual sort order within the sidebar (#86). Lower = higher in the list. Assigned
        // on create (max+1) and rewritten by the reorder endpoint - mirrors Subtask.Position.
        public int Position { get; set; }

        // Navigation property - tasks that belong to this project.
        public ICollection<TaskModel> Tasks { get; set; } = new List<TaskModel>();
    }
}
