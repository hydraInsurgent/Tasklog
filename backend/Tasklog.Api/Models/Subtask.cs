using System.Text.Json.Serialization;

namespace Tasklog.Api.Models
{
    // A lightweight checklist item under a parent task: /api/tasks/{taskId}/subtasks.
    // Deliberately NOT a full self-referencing task - it carries only a title, a done
    // flag, a manual order, and an optional deadline. Project/labels are inherited from
    // the parent for filtering. Mirrors the TaskComment/CheckIn pattern: cascade-deleted
    // with the task, with a [JsonIgnore] back-nav to avoid a serialization cycle.
    public class Subtask
    {
        public int Id { get; set; }

        // The checklist line. Required, trimmed, capped by the controller (<= 500 chars).
        public required string Title { get; set; }

        // Whether this subtask has been ticked. Defaults false (the CLR zero, so existing
        // rows would migrate to false without a HasDefaultValue - like IsHabit).
        public bool IsCompleted { get; set; }

        // Manual sort order within the parent. Lower = higher in the list. Assigned on
        // create (max+1) and rewritten by the reorder endpoint.
        public int Position { get; set; }

        // Optional deadline. Null = no date (stays nested under the parent only). A dated,
        // incomplete subtask is also surfaced as its own card in the task list (see the
        // projection in TasksController.GetAll). Midnight = date-only, mirroring TaskModel.
        public DateTime? Deadline { get; set; }

        public DateTime CreatedAt { get; set; }

        // The task this subtask belongs to. Cascade-deleted with the task.
        public int TaskId { get; set; }

        // Back-nav for the cascade FK. JsonIgnore prevents a Task -> Subtasks -> Task cycle
        // (same pattern as TaskComment.Task and CheckIn.Task).
        [JsonIgnore]
        public TaskModel? Task { get; set; }
    }
}
