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
  (1, 'Work',     datetime('now', '-30 days')),
  (2, 'Personal', datetime('now', '-30 days')),
  (3, 'Learning', datetime('now', '-28 days'));

-- ============================================================
-- Labels
-- ============================================================
INSERT INTO Labels (Id, Name, ColorIndex, CreatedAt) VALUES
  (1, 'Urgent',    0, datetime('now', '-30 days')),
  (2, 'Quick Win', 3, datetime('now', '-30 days')),
  (3, 'Research',  5, datetime('now', '-28 days')),
  (4, 'Follow Up', 7, datetime('now', '-28 days'));

-- ============================================================
-- Tasks
-- ============================================================
INSERT INTO Tasks (Id, Title, Deadline, CreatedAt, IsCompleted, CompletedAt, ProjectId) VALUES
  -- Work tasks
  (1,  'Review Q1 budget report',              datetime('now', '+3 days'),   datetime('now', '-27 days'), 1, datetime('now', '-25 days'), 1),
  (2,  'Reply to Sarah''s email',              NULL,                         datetime('now', '-25 days'), 0, NULL,                        1),
  (3,  'Prepare sprint demo slides',           datetime('now', '+8 days'),   datetime('now', '-23 days'), 0, NULL,                        1),
  (4,  'Submit expense report',                datetime('now', '+14 days'),  datetime('now', '-22 days'), 1, datetime('now', '-20 days'), 1),
  (13, 'Chase invoice from contractor',        datetime('now', '-5 days'),   datetime('now', '-18 days'), 0, NULL,                        1),  -- overdue

  -- Personal tasks
  (5,  'Book dentist appointment',             NULL,                         datetime('now', '-26 days'), 0, NULL,                        2),
  (6,  'Update portfolio website',             datetime('now', '+18 days'),  datetime('now', '-24 days'), 0, NULL,                        2),
  (7,  'Set up home office desk',              NULL,                         datetime('now', '-29 days'), 1, datetime('now', '-27 days'), 2),
  (8,  'Plan weekend hiking trip',             datetime('now', '+10 days'),  datetime('now', '-21 days'), 0, NULL,                        2),
  (14, 'Renew car insurance',                  datetime('now', '-3 days'),   datetime('now', '-20 days'), 0, NULL,                        2),  -- overdue

  -- Learning tasks
  (9,  'Read chapter 5 of Clean Architecture',     datetime('now', '+6 days'),  datetime('now', '-26 days'), 0, NULL, 3),
  (10, 'Watch TypeScript advanced patterns video',  NULL,                        datetime('now', '-22 days'), 0, NULL, 3),
  (11, 'Fix login page CSS bug',                    datetime('now'),             datetime('now', '-20 days'), 0, NULL, 3),  -- due today

  -- Inbox (no project)
  (12, 'Buy groceries for the week',           NULL,                         datetime('now', '-19 days'), 0, NULL, NULL),
  (15, 'Find a good book for the flight',      NULL,                         datetime('now', '-10 days'), 0, NULL, NULL),
  (16, 'Call back the landlord',               datetime('now', '-1 days'),   datetime('now', '-8 days'),  0, NULL, NULL),  -- overdue, no project
  (17, 'Research standing desk options',       NULL,                         datetime('now', '-5 days'),  0, NULL, NULL);

-- ============================================================
-- Label-Task associations (many-to-many)
-- ============================================================
INSERT INTO LabelTaskModel (LabelsId, TasksId) VALUES
  (1, 1),   -- "Review Q1 budget report"       -> Urgent
  (1, 3),   -- "Prepare sprint demo slides"    -> Urgent
  (2, 2),   -- "Reply to Sarah's email"        -> Quick Win
  (4, 2),   -- "Reply to Sarah's email"        -> Follow Up
  (3, 9),   -- "Read chapter 5..."             -> Research
  (3, 10),  -- "Watch TypeScript..."           -> Research
  (2, 12),  -- "Buy groceries..."              -> Quick Win
  (4, 4),   -- "Submit expense report"         -> Follow Up
  (1, 13),  -- "Chase invoice..."              -> Urgent (overdue)
  (4, 13),  -- "Chase invoice..."              -> Follow Up
  (1, 14),  -- "Renew car insurance"           -> Urgent (overdue)
  (1, 16),  -- "Call back the landlord"        -> Urgent (overdue, inbox)
  (2, 16),  -- "Call back the landlord"        -> Quick Win
  (4, 16),  -- "Call back the landlord"        -> Follow Up  (3 labels - shows multi-label)
  (3, 17);  -- "Research standing desk..."     -> Research
