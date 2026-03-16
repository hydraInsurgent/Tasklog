using System.Text.Json.Serialization;

namespace Tasklog.Api.Models
{
    public class Label
    {
        public int Id { get; set; }
        public required string Name { get; set; }
        // Index into the 10-color VIBGYOR palette defined in the frontend (0-9).
        // 0=Red, 1=Orange, 2=Amber, 3=Yellow, 4=Green, 5=Teal, 6=Blue, 7=Indigo, 8=Violet, 9=Pink.
        public int ColorIndex { get; set; }
        public DateTime CreatedAt { get; set; }

        // Navigation property - tasks that carry this label.
        public ICollection<TaskModel> Tasks { get; set; } = new List<TaskModel>();
    }
}
