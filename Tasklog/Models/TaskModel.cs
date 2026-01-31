namespace Tasklog.Models
{
    public class TaskModel
    {
        public int Id { get; set; }
        public string Title { get; set; }
        public DateTime? Deadline { get; set; }
        public DateTime CreatedAt { get; set; }
    }
}
