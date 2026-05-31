using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace Tasklog.Api.Models
{
    public class TaskModel
    {
        public int Id { get; set; }
        public required string Title { get; set; }
        // Optional free-text notes/context. Null = no description. Capped at 2000 chars
        // by the controller (the column itself is unconstrained TEXT).
        public string? Description { get; set; }
        public DateTime? Deadline { get; set; }
        public DateTime CreatedAt { get; set; }
        // Whether the task has been marked as complete by the user.
        // Defaults to false on creation.
        public bool IsCompleted { get; set; }
        // The date and time the task was marked complete. Null if not yet completed.
        // Cleared back to null if the task is marked incomplete again.
        public DateTime? CompletedAt { get; set; }
        // The project this task belongs to. Null means the task is in the Inbox (uncategorized).
        public int? ProjectId { get; set; }
        public Project? Project { get; set; }

        // Priority on the Todoist P1-P4 scale: 1 = Urgent, 2 = High, 3 = Medium, 4 = None.
        // P1 is the highest urgency (ascending sort = most urgent first). Non-null;
        // P4 is the default "no priority" state, so existing rows migrate to 4.
        public int Priority { get; set; } = 4;

        // Labels applied to this task. Many-to-many - a task can have multiple labels.
        public ICollection<Label> Labels { get; set; } = new List<Label>();

        // Timestamped comments on this task. Only loaded for the single-task GetById
        // (not the list) - see the controller. Cascade-deleted with the task.
        public ICollection<TaskComment> Comments { get; set; } = new List<TaskComment>();

        // Recurrence rule, RRULE-shaped (e.g. "FREQ=DAILY", "FREQ=WEEKLY;BYDAY=MO,WE").
        // Null = the task does not repeat. Parsed/advanced by the RecurrenceRule helper.
        // The grammar is validated on write so we never store a rule we cannot expand.
        public string? Recurrence { get; set; }

        // Links every occurrence of the same repeating task. Set when a task becomes
        // recurring (a fresh Guid) and carried onto each spawned occurrence, so a series'
        // history (completed occurrences + the open one) can be queried by SeriesId.
        // Null for non-recurring tasks.
        public Guid? SeriesId { get; set; }

        // Whether this task is a habit (tracked with daily check-ins on the Habits view).
        // Defaults to false; false is the CLR zero, so the migration default 0 is correct
        // and existing rows migrate to false without needing HasDefaultValue (unlike Priority).
        public bool IsHabit { get; set; }

        // Weekly frequency target for a habit ("x times a week"). Null = not a frequency
        // habit (the habit is scheduled on specific days via Recurrence, or is plain daily).
        // 1-7 = the target number of check-ins per calendar week (Mon-Sun). A frequency habit
        // and a specific-days recurrence are mutually exclusive: setting one clears the other
        // (enforced in the controller). Nullable int defaults to null (CLR zero is null), so
        // existing rows migrate to null with no HasDefaultValue needed - like IsHabit.
        public int? WeeklyTarget { get; set; }

        // Daily check-ins for this habit. [JsonIgnore] so they never bloat ordinary task
        // responses - they are loaded + projected only by the /api/habits endpoint. The nav
        // exists for the cascade FK and that query's .Include.
        [JsonIgnore]
        public ICollection<CheckIn> CheckIns { get; set; } = new List<CheckIn>();

        // Read-only convenience flag: whether this task repeats. [NotMapped] so EF ignores
        // it (it is derived from Recurrence) while System.Text.Json still serializes it,
        // mirroring DueStatus - clients get `isRecurring` on every task with no extra wiring.
        [NotMapped]
        public bool IsRecurring => Recurrence != null;

        // Read-only "due bucket" relative to now. [NotMapped] keeps EF Core from
        // treating it as a column (so it is always computed fresh, never stored);
        // System.Text.Json still serializes the getter, so every action that returns
        // a TaskModel includes dueStatus automatically with no per-action wiring.
        [NotMapped]
        public string DueStatus => ComputeDueStatus(Deadline, DateTime.Now);

        // Pure due-bucket computation, separated from DateTime.Now so it is unit-testable
        // with an injected "now". Deadlines may carry an optional time-of-day: a deadline
        // at exactly midnight is treated as "date-only" (overdue once the calendar day
        // passes - the historical behaviour), while a non-midnight time is "timed" (overdue
        // the moment it passes). today/this_week/later are always calendar-based on now's date.
        // Buckets: none / overdue / today / this_week (through the upcoming Sunday) / later.
        public static string ComputeDueStatus(DateTime? deadline, DateTime now)
        {
            if (deadline is null) return "none";
            var due = deadline.Value;
            var hasTime = due.TimeOfDay != TimeSpan.Zero;

            // Overdue: a timed deadline is past once its instant passes; a date-only
            // (midnight) deadline is past only once its whole calendar day has passed.
            if (hasTime ? due < now : due.Date < now.Date) return "overdue";

            var nowDate = now.Date;
            if (due.Date == nowDate) return "today";
            // Upcoming Sunday = end of the current week. DayOfWeek: Sunday = 0 .. Saturday = 6,
            // so on Sunday this is 0 days away and the this_week window is empty (tomorrow is later).
            var daysUntilSunday = (7 - (int)nowDate.DayOfWeek) % 7;
            var endOfWeek = nowDate.AddDays(daysUntilSunday);
            return due.Date <= endOfWeek ? "this_week" : "later";
        }
    }
}
