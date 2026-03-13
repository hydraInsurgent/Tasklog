namespace Tasklog.Api.Models
{
    public class Project
    {
        public int Id { get; set; }
        public required string Name { get; set; }
        public DateTime CreatedAt { get; set; }

        // Navigation property - tasks that belong to this project.
        public ICollection<TaskModel> Tasks { get; set; } = new List<TaskModel>();
    }
}
