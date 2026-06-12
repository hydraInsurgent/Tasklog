using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace Tasklog.Api.Models
{
    // A single tracked work interval on a task (#77). One row per start->stop:
    // EndedAt is null while the timer is running, set when it stops. Total time on a task
    // is the sum of its intervals. Timestamps are stored in LOCAL time (DateTime.Now), like
    // the rest of the app, so "which day" is just StartedAt.Date - no timezone conversion
    // for this single-user app. Cascade-deleted with the task.
    public class TimeEntry
    {
        public int Id { get; set; }

        public int TaskId { get; set; }

        // Back-nav for the cascade FK. JsonIgnore to avoid a Task -> TimeEntries -> Task cycle.
        [JsonIgnore]
        public TaskModel? Task { get; set; }

        // When tracking started. Always set.
        public DateTime StartedAt { get; set; }

        // When tracking stopped. Null = this interval is still running (the active timer).
        // At most one TimeEntry per the whole app has EndedAt == null (single running timer).
        public DateTime? EndedAt { get; set; }

        // When the row was created (audit; for a timer entry this equals StartedAt, for a
        // manual entry it is the moment it was logged).
        public DateTime CreatedAt { get; set; }

        // Read-only convenience: seconds elapsed. For a running entry it is measured to now,
        // so a client that doesn't tick still gets a sensible value. [NotMapped] => EF ignores
        // it; System.Text.Json still serializes the getter (mirrors DueStatus / IsRecurring).
        [NotMapped]
        public int DurationSeconds =>
            (int)Math.Max(0, ((EndedAt ?? DateTime.Now) - StartedAt).TotalSeconds);
    }
}
