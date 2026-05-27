using System.Text.Json.Serialization;

namespace Tasklog.Api.Models
{
    // A timestamped free-text note on a task. The foundation for the later
    // habit-tracking per-completion log (see proposal-recurring-and-habits.md).
    public class TaskComment
    {
        public int Id { get; set; }
        // Free-text body. Required, non-empty, capped at 2000 chars by the controller.
        public required string Body { get; set; }
        public DateTime CreatedAt { get; set; }

        // The task this comment belongs to. Cascade-deleted with the task.
        public int TaskId { get; set; }
        // Navigation back to the task. JsonIgnore prevents a Task -> Comments ->
        // Task -> ... serialization cycle (same pattern as Label.Tasks).
        [JsonIgnore]
        public TaskModel? Task { get; set; }
    }
}
