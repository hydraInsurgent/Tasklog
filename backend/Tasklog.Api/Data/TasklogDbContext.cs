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
        public DbSet<TaskComment> Comments => Set<TaskComment>();
        public DbSet<CheckIn> CheckIns => Set<CheckIn>();
        public DbSet<TimeEntry> TimeEntries => Set<TimeEntry>();
        public DbSet<Subtask> Subtasks => Set<Subtask>();
        public DbSet<JournalTemplate> JournalTemplates => Set<JournalTemplate>();
        public DbSet<JournalEntry> JournalEntries => Set<JournalEntry>();
        public DbSet<MoodCheckin> MoodCheckins => Set<MoodCheckin>();

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

            // A task's comments are deleted with the task (cascade via the FK).
            modelBuilder.Entity<TaskComment>()
                .HasOne(c => c.Task)
                .WithMany(t => t.Comments)
                .HasForeignKey(c => c.TaskId)
                .OnDelete(DeleteBehavior.Cascade);

            // A task's habit check-ins cascade-delete with the task. The unique index on
            // (TaskId, CheckInDate) enforces one check-in per habit per day, so "done today"
            // is idempotent at the database level.
            modelBuilder.Entity<CheckIn>()
                .HasOne(c => c.Task)
                .WithMany(t => t.CheckIns)
                .HasForeignKey(c => c.TaskId)
                .OnDelete(DeleteBehavior.Cascade);
            modelBuilder.Entity<CheckIn>()
                .HasIndex(c => new { c.TaskId, c.CheckInDate })
                .IsUnique();

            // Time-tracking intervals cascade-delete with the task. Index on EndedAt makes
            // "find the running timer" (EndedAt == null) cheap; index on TaskId speeds the
            // per-task totals + the timeline's date-range scan (#77).
            modelBuilder.Entity<TimeEntry>()
                .HasOne(e => e.Task)
                .WithMany(t => t.TimeEntries)
                .HasForeignKey(e => e.TaskId)
                .OnDelete(DeleteBehavior.Cascade);
            modelBuilder.Entity<TimeEntry>().HasIndex(e => e.EndedAt);
            modelBuilder.Entity<TimeEntry>().HasIndex(e => e.TaskId);

            // A task's subtasks cascade-delete with the task (#78). Index on TaskId speeds
            // the per-task load (GetById) and the list's subtask-count/projection queries.
            modelBuilder.Entity<Subtask>()
                .HasOne(s => s.Task)
                .WithMany(t => t.Subtasks)
                .HasForeignKey(s => s.TaskId)
                .OnDelete(DeleteBehavior.Cascade);
            modelBuilder.Entity<Subtask>().HasIndex(s => s.TaskId);

            // Journal (#79). Templates are code-defined and upserted by Key at startup,
            // so Key must be unique. One entry per template per date is a DB guarantee -
            // the API upserts against this index instead of ever creating a duplicate note.
            // Entries cascade-delete with their template.
            modelBuilder.Entity<JournalTemplate>()
                .HasIndex(t => t.Key)
                .IsUnique();
            modelBuilder.Entity<JournalEntry>()
                .HasOne(e => e.Template)
                .WithMany()
                .HasForeignKey(e => e.TemplateId)
                .OnDelete(DeleteBehavior.Cascade);
            modelBuilder.Entity<JournalEntry>()
                .HasIndex(e => new { e.TemplateId, e.EntryDate })
                .IsUnique();

            // Mood check-ins are queried by day; index the timestamp for the date-range scan.
            modelBuilder.Entity<MoodCheckin>().HasIndex(m => m.CheckinAt);
        }
    }
}
