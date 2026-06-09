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

        // Navigation property - tasks that belong to this project.
        public ICollection<TaskModel> Tasks { get; set; } = new List<TaskModel>();
    }
}
