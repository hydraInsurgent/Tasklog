using Microsoft.EntityFrameworkCore;
using Tasklog.Models;

namespace Tasklog.Data
{
    public class TasklogDbContext: DbContext
    {
        public TasklogDbContext(DbContextOptions<TasklogDbContext> options):base(options) { }

        public DbSet<TaskModel> Tasks => Set<TaskModel>();
    }
}
