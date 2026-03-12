namespace Tasklog.Api.Models
{
    public class TaskModel
    {
        public int Id { get; set; }
        public required string Title { get; set; }
        public DateTime? Deadline { get; set; }
        public DateTime CreatedAt { get; set; }
        // Whether the task has been marked as complete by the user.
        // Defaults to false on creation.
        public bool IsCompleted { get; set; }
        // The date and time the task was marked complete. Null if not yet completed.
        // Cleared back to null if the task is marked incomplete again.
        public DateTime? CompletedAt { get; set; }
    }
}
