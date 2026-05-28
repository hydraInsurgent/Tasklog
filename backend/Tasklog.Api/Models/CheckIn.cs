using System.Text.Json.Serialization;

namespace Tasklog.Api.Models
{
    // A single day's check-in on a habit task. One row per (task, day) - the unique index
    // on (TaskId, CheckInDate) makes "done today" idempotent. Cascade-deleted with the task.
    public class CheckIn
    {
        public int Id { get; set; }

        // The day this habit was checked in (date-only, stored at local midnight). Streak
        // logic works off the date component; the time is not meaningful.
        public DateTime CheckInDate { get; set; }

        // When the check-in row was created (audit; distinct from the day it represents).
        public DateTime CreatedAt { get; set; }

        public int TaskId { get; set; }

        // Back-nav for the cascade FK. JsonIgnore to avoid a Task -> CheckIns -> Task cycle.
        [JsonIgnore]
        public TaskModel? Task { get; set; }
    }
}
