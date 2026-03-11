namespace Tasklog.Api.Models
{
    public class TaskModel
    {
        public int Id { get; set; }
        public required string Title { get; set; }
        public DateTime? Deadline { get; set; }
        public DateTime CreatedAt { get; set; }
    }
}
