-- Tasklog Sample Data Seed Script
-- This script is idempotent: it clears existing data before inserting.
-- Run against a copy of the production database to preserve schema and migrations.

-- Disable foreign key checks during seed
PRAGMA foreign_keys = OFF;

-- Clear existing data (order matters for foreign keys)
DELETE FROM LabelTaskModel;
DELETE FROM Tasks;
DELETE FROM Labels;
DELETE FROM Projects;

-- Reset autoincrement counters
DELETE FROM sqlite_sequence WHERE name IN ('Projects', 'Tasks', 'Labels');

-- Enable foreign key checks
PRAGMA foreign_keys = ON;

-- ============================================================
-- Projects
-- ============================================================
INSERT INTO Projects (Id, Name, CreatedAt) VALUES
  (1, 'Work',     '2026-03-01T09:00:00.0000000'),
  (2, 'Personal', '2026-03-01T09:00:00.0000000'),
  (3, 'Learning', '2026-03-02T10:30:00.0000000');

-- ============================================================
-- Labels
-- ============================================================
INSERT INTO Labels (Id, Name, ColorIndex, CreatedAt) VALUES
  (1, 'Urgent',    0, '2026-03-01T09:00:00.0000000'),
  (2, 'Quick Win', 3, '2026-03-01T09:00:00.0000000'),
  (3, 'Research',  5, '2026-03-02T10:30:00.0000000'),
  (4, 'Follow Up', 7, '2026-03-02T10:30:00.0000000');

-- ============================================================
-- Tasks
-- ============================================================
INSERT INTO Tasks (Id, Title, Deadline, CreatedAt, IsCompleted, CompletedAt, ProjectId) VALUES
  -- Work tasks
  (1,  'Review Q1 budget report',     '2026-04-05T00:00:00.0000000', '2026-03-03T08:15:00.0000000', 1, '2026-03-05T14:30:00.0000000', 1),
  (2,  'Reply to Sarah''s email',      NULL,                          '2026-03-05T09:00:00.0000000', 0, NULL,                          1),
  (3,  'Prepare sprint demo slides',  '2026-04-10T00:00:00.0000000', '2026-03-07T11:00:00.0000000', 0, NULL,                          1),
  (4,  'Submit expense report',       '2026-04-15T00:00:00.0000000', '2026-03-08T13:45:00.0000000', 1, '2026-03-10T16:00:00.0000000', 1),

  -- Personal tasks
  (5,  'Book dentist appointment',     NULL,                          '2026-03-04T10:00:00.0000000', 0, NULL,                          2),
  (6,  'Update portfolio website',    '2026-04-20T00:00:00.0000000', '2026-03-06T15:30:00.0000000', 0, NULL,                          2),
  (7,  'Set up home office desk',      NULL,                          '2026-03-02T12:00:00.0000000', 1, '2026-03-04T18:00:00.0000000', 2),
  (8,  'Plan weekend hiking trip',    '2026-04-12T00:00:00.0000000', '2026-03-10T09:30:00.0000000', 0, NULL,                          2),

  -- Learning tasks
  (9,  'Read chapter 5 of Clean Architecture', '2026-04-08T00:00:00.0000000', '2026-03-05T14:00:00.0000000', 0, NULL, 3),
  (10, 'Watch TypeScript advanced patterns video', NULL,              '2026-03-09T11:15:00.0000000', 0, NULL,                          3),
  (11, 'Fix login page CSS bug',       NULL,                          '2026-03-11T16:45:00.0000000', 0, NULL,                          3),

  -- Inbox (no project)
  (12, 'Buy groceries for the week',   NULL,                          '2026-03-12T08:00:00.0000000', 0, NULL,                          NULL);

-- ============================================================
-- Label-Task associations (many-to-many)
-- ============================================================
INSERT INTO LabelTaskModel (LabelsId, TasksId) VALUES
  (1, 1),   -- "Review Q1 budget report"    -> Urgent
  (1, 3),   -- "Prepare sprint demo slides" -> Urgent
  (2, 2),   -- "Reply to Sarah's email"     -> Quick Win
  (4, 2),   -- "Reply to Sarah's email"     -> Follow Up
  (3, 9),   -- "Read chapter 5..."          -> Research
  (3, 10),  -- "Watch TypeScript..."        -> Research
  (2, 12),  -- "Buy groceries..."           -> Quick Win
  (4, 4);   -- "Submit expense report"      -> Follow Up
