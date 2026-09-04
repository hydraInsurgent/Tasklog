using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace Tasklog.Api.Models
{
    // A single tracked work interval (#77; decoupled from tasks in #86). One row per
    // start->stop: EndedAt is null while the timer is running, set when it stops. Timestamps
    // are stored in LOCAL time (DateTime.Now), like the rest of the app, so "which day" is
    // just StartedAt.Date - no timezone conversion for this single-user app.
    //
    // As of #86 an entry is a first-class actual, NOT bound to a task: TaskId is optional
    // (null = a task-free entry like "Sleep" or "Gaming"), it carries its own free-text
    // Description and its own ProjectId (snapshot, defaulted from the task's project when
    // started on a task but independently editable). Deleting the linked task or project
    // SET-NULLs the link rather than deleting the entry, so logged time is never lost.
    public class TimeEntry
    {
        public int Id { get; set; }

        // The task this interval was tracked against, if any. Null = a task-free entry.
        public int? TaskId { get; set; }

        // Back-nav for the FK. JsonIgnore to avoid a Task -> TimeEntries -> Task cycle.
        [JsonIgnore]
        public TaskModel? Task { get; set; }

        // Free-text label for the entry (#86), e.g. "Rise and Shine". Null/blank for a
        // task-linked entry that just uses the task title. Capped at 500 chars by the controller.
        public string? Description { get; set; }

        // The project this entry is grouped under (#86). Own column (not derived from the
        // task) so a task-free entry can still be categorized, and so the link survives a
        // task delete. Null = Inbox/Ungrouped. SET-NULL on project delete.
        public int? ProjectId { get; set; }

        // Back-nav for the FK. JsonIgnore - the controller projects the entry to a response
        // record, so this nav is server-side only (mirrors Task above).
        [JsonIgnore]
        public Project? Project { get; set; }

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
