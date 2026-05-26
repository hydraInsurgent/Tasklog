using Microsoft.EntityFrameworkCore;
using Tasklog.Api.Models;

namespace Tasklog.Api.Data
{
    public class TasklogDbContext : DbContext
    {
        public TasklogDbContext(DbContextOptions<TasklogDbContext> options) : base(options) { }

        public DbSet<TaskModel> Tasks => Set<TaskModel>();
        public DbSet<Project> Projects => Set<Project>();
        public DbSet<Label> Labels => Set<Label>();

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            // Configure the implicit many-to-many join table between tasks and labels.
            // EF Core creates a "LabelTaskModel" join table automatically from these nav properties.
            modelBuilder.Entity<TaskModel>()
                .HasMany(t => t.Labels)
                .WithMany(l => l.Tasks);

            // Priority defaults to 4 (P4 = none) at the DB level. This is what existing
            // rows migrate to - without it, EF would use the CLR default of 0, which is
            // outside the valid 1-4 range. New rows still set 4 via the model initializer.
            modelBuilder.Entity<TaskModel>()
                .Property(t => t.Priority)
                .HasDefaultValue(4);
        }
    }
}
