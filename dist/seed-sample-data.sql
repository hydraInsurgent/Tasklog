-- Tasklog Sample Data Seed Script
-- Updated for v2.20.0: adds subtasks (checklist items, incl. dated ones that
-- surface as their own cards). Also: project colors, habits + check-ins, time
-- entries, descriptions, priorities, and comments (v2.19.0).
-- Idempotent: clears all data before inserting.

PRAGMA foreign_keys = OFF;

-- Clear all tables (children before parents)
DELETE FROM LabelTaskModel;
DELETE FROM Comments;
DELETE FROM CheckIns;
DELETE FROM TimeEntries;
DELETE FROM Subtasks;
DELETE FROM Tasks;
DELETE FROM Labels;
DELETE FROM Projects;

DELETE FROM sqlite_sequence
  WHERE name IN ('Projects', 'Tasks', 'Labels', 'Comments', 'CheckIns', 'TimeEntries', 'Subtasks');

PRAGMA foreign_keys = ON;

-- ============================================================
-- Projects  (colors used as block borders on the timeline)
-- ============================================================
INSERT INTO Projects (Id, Name, Color, CreatedAt) VALUES
  (1, 'Work',         '#4f46e5', datetime('now', '-45 days')),
  (2, 'Personal',     '#059669', datetime('now', '-45 days')),
  (3, 'Side Project', '#d97706', datetime('now', '-30 days'));

-- ============================================================
-- Labels
-- ============================================================
INSERT INTO Labels (Id, Name, ColorIndex, CreatedAt) VALUES
  (1, 'Urgent',    0, datetime('now', '-45 days')),
  (2, 'Quick Win', 3, datetime('now', '-45 days')),
  (3, 'Research',  5, datetime('now', '-30 days')),
  (4, 'Blocked',   2, datetime('now', '-20 days'));

-- ============================================================
-- Tasks  (regular + habits)
-- ============================================================
INSERT INTO Tasks (Id, Title, Description, Deadline, CreatedAt,
                   IsCompleted, CompletedAt, ProjectId, Priority,
                   Recurrence, SeriesId, IsHabit, WeeklyTarget) VALUES

  -- Work
  (1,  'Prepare Q3 roadmap presentation',
       'Cover product priorities, timeline, and resource asks. Leadership wants a risks slide added.',
       datetime('now', '+5 days'),  datetime('now', '-14 days'), 0, NULL, 1, 2, NULL, NULL, 0, NULL),

  (2,  'Review open PRs before standup',
       NULL,
       datetime('now'),             datetime('now', '-3 days'),  0, NULL, 1, 1, NULL, NULL, 0, NULL),

  (3,  'Write design doc for auth refactor',
       'Token refresh flow, session storage, backward-compat plan. Review with Alex before sending to team.',
       datetime('now', '+10 days'), datetime('now', '-7 days'),  0, NULL, 1, 3, NULL, NULL, 0, NULL),

  (4,  'Reply to client feedback on mockups',
       NULL,
       NULL,                        datetime('now', '-5 days'),  0, NULL, 1, 2, NULL, NULL, 0, NULL),

  (5,  'Fix broken staging deploy',
       NULL,
       datetime('now', '-2 days'), datetime('now', '-10 days'),  0, NULL, 1, 1, NULL, NULL, 0, NULL),

  (6,  'Write onboarding doc for new hire',
       'Dev environment setup, repo structure, key contacts, and PR process.',
       datetime('now', '+20 days'), datetime('now', '-20 days'), 1, datetime('now', '-3 days'), 1, 4, NULL, NULL, 0, NULL),

  -- Personal
  (7,  'Book flights for August trip',
       NULL,
       datetime('now', '+14 days'), datetime('now', '-12 days'), 0, NULL, 2, 2, NULL, NULL, 0, NULL),

  (8,  'Get car serviced',
       NULL,
       datetime('now', '-1 day'),   datetime('now', '-15 days'), 0, NULL, 2, 3, NULL, NULL, 0, NULL),

  (9,  'Cancel unused subscriptions',
       NULL,
       NULL,                        datetime('now', '-8 days'),  0, NULL, 2, 4, NULL, NULL, 0, NULL),

  (10, 'Fix the leaking kitchen tap',
       NULL,
       NULL,                        datetime('now', '-20 days'), 1, datetime('now', '-5 days'), 2, 3, NULL, NULL, 0, NULL),

  -- Side Project
  (11, 'Ship v0.1 landing page',
       'Hero, features section, and waitlist form. Keep copy tight.',
       datetime('now', '+7 days'),  datetime('now', '-10 days'), 0, NULL, 3, 2, NULL, NULL, 0, NULL),

  (12, 'Set up Stripe integration',
       NULL,
       datetime('now', '+21 days'), datetime('now', '-8 days'),  0, NULL, 3, 3, NULL, NULL, 0, NULL),

  (13, 'Write first blog post',
       NULL,
       NULL,                        datetime('now', '-6 days'),  0, NULL, 3, 4, NULL, NULL, 0, NULL),

  -- Inbox
  (14, 'Buy a mechanical keyboard',
       NULL,
       NULL,                        datetime('now', '-4 days'),  0, NULL, NULL, 4, NULL, NULL, 0, NULL),

  (15, 'Research standing desk options',
       NULL,
       NULL,                        datetime('now', '-3 days'),  0, NULL, NULL, 4, NULL, NULL, 0, NULL),

  (16, 'Call mum back',
       NULL,
       datetime('now', '+1 day'),   datetime('now', '-2 days'),  0, NULL, NULL, 3, NULL, NULL, 0, NULL),

  -- Habits
  -- 17: gym 4x/week (frequency habit)
  (17, 'Morning workout',
       NULL,
       NULL,                        datetime('now', '-30 days'), 0, NULL, NULL, 4, NULL, NULL, 1, 4),

  -- 18: read on weekdays (specific-days habit)
  (18, 'Read for 20 mins',
       NULL,
       NULL,                        datetime('now', '-25 days'), 0, NULL, NULL, 4,
       'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', NULL, 1, NULL),

  -- 19: meditate daily
  (19, 'Meditate',
       NULL,
       NULL,                        datetime('now', '-20 days'), 0, NULL, NULL, 4,
       'FREQ=DAILY', NULL, 1, NULL);

-- ============================================================
-- Label-Task associations
-- ============================================================
INSERT INTO LabelTaskModel (LabelsId, TasksId) VALUES
  (1, 2),   -- Review PRs          -> Urgent
  (1, 5),   -- Fix staging deploy  -> Urgent
  (2, 4),   -- Reply to client     -> Quick Win
  (2, 9),   -- Cancel subs         -> Quick Win
  (3, 3),   -- Auth design doc     -> Research
  (3, 15),  -- Standing desk       -> Research
  (4, 5),   -- Fix staging deploy  -> Blocked
  (1, 8),   -- Car service         -> Urgent (overdue)
  (2, 16);  -- Call mum            -> Quick Win

-- ============================================================
-- Comments
-- ============================================================
INSERT INTO Comments (Id, Body, CreatedAt, TaskId) VALUES
  (1, 'Discussed with Alex - needs to cover token refresh AND session storage. He wants a review before the full team sees it.',
      datetime('now', '-2 days'), 3),
  (2, 'Added notes on backward compat. Still deciding: cookie vs localStorage for refresh token.',
      datetime('now', '-1 day'),  3),
  (3, 'Leadership asked for a "risks and dependencies" slide. Updated scope.',
      datetime('now', '-1 day'),  1);

-- ============================================================
-- Subtasks  (checklist items, #78 / v2.20.0)
-- A subtask with a Deadline also surfaces as its own card in the task list,
-- breadcrumbed to its parent. IsCompleted subtasks show ticked; Position sets order.
-- ============================================================
INSERT INTO Subtasks (Id, Title, IsCompleted, Position, Deadline, CreatedAt, TaskId) VALUES
  -- Task 1: Prepare Q3 roadmap presentation (Work) - a mostly-open checklist, one dated
  (1,  'Draft the slide deck',                   1, 0, NULL,                        datetime('now', '-13 days'), 1),
  (2,  'Add the risks & dependencies slide',     0, 1, NULL,                        datetime('now', '-13 days'), 1),
  (3,  'Rehearse timing',                        0, 2, datetime('now', '+3 days'),  datetime('now', '-13 days'), 1),
  (4,  'Send to leadership for sign-off',        0, 3, NULL,                        datetime('now', '-13 days'), 1),

  -- Task 11: Ship v0.1 landing page (Side Project)
  (5,  'Write the hero copy',                    1, 0, NULL,                        datetime('now', '-9 days'),  11),
  (6,  'Build the features section',             0, 1, NULL,                        datetime('now', '-9 days'),  11),
  (7,  'Wire up the waitlist form',              0, 2, NULL,                        datetime('now', '-9 days'),  11),

  -- Task 7: Book flights for August trip (Personal) - another dated subtask
  (8,  'Compare flight prices',                  1, 0, NULL,                        datetime('now', '-11 days'), 7),
  (9,  'Book the outbound flight',               0, 1, datetime('now', '+2 days'),  datetime('now', '-11 days'), 7),
  (10, 'Book the return flight',                 0, 2, NULL,                        datetime('now', '-11 days'), 7);

-- ============================================================
-- CheckIns for habits
-- ============================================================

-- Morning workout (id 17, 4x/week)
-- Pattern: every 2-3 days => looks like Mon/Wed/Fri rhythm
INSERT INTO CheckIns (TaskId, CheckInDate, CreatedAt) VALUES
  (17, date('now'),              datetime('now')),
  (17, date('now', '-2 days'),   datetime('now', '-2 days')),
  (17, date('now', '-4 days'),   datetime('now', '-4 days')),
  (17, date('now', '-7 days'),   datetime('now', '-7 days')),
  (17, date('now', '-9 days'),   datetime('now', '-9 days')),
  (17, date('now', '-11 days'),  datetime('now', '-11 days')),
  (17, date('now', '-14 days'),  datetime('now', '-14 days')),
  (17, date('now', '-16 days'),  datetime('now', '-16 days')),
  (17, date('now', '-18 days'),  datetime('now', '-18 days'));

-- Read for 20 mins (id 18, weekdays) - 5-day streak
INSERT INTO CheckIns (TaskId, CheckInDate, CreatedAt) VALUES
  (18, date('now'),              datetime('now')),
  (18, date('now', '-1 day'),    datetime('now', '-1 day')),
  (18, date('now', '-2 days'),   datetime('now', '-2 days')),
  (18, date('now', '-3 days'),   datetime('now', '-3 days')),
  (18, date('now', '-4 days'),   datetime('now', '-4 days')),
  (18, date('now', '-7 days'),   datetime('now', '-7 days')),
  (18, date('now', '-8 days'),   datetime('now', '-8 days')),
  (18, date('now', '-9 days'),   datetime('now', '-9 days'));

-- Meditate (id 19, daily) - 4-day streak (missed 4 days ago)
INSERT INTO CheckIns (TaskId, CheckInDate, CreatedAt) VALUES
  (19, date('now'),              datetime('now')),
  (19, date('now', '-1 day'),    datetime('now', '-1 day')),
  (19, date('now', '-2 days'),   datetime('now', '-2 days')),
  (19, date('now', '-3 days'),   datetime('now', '-3 days')),
  -- gap on -4 days
  (19, date('now', '-5 days'),   datetime('now', '-5 days')),
  (19, date('now', '-6 days'),   datetime('now', '-6 days')),
  (19, date('now', '-7 days'),   datetime('now', '-7 days'));

-- ============================================================
-- Time entries  (makes the /time timeline look alive)
-- All times are local. No EndedAt = null means running - none here.
-- ============================================================
INSERT INTO TimeEntries (Id, TaskId, StartedAt, EndedAt, CreatedAt) VALUES

  -- Today
  (1, 2,                                           -- Review open PRs (Work)
     datetime('now', 'start of day', '+9 hours'),
     datetime('now', 'start of day', '+9 hours', '+35 minutes'),
     datetime('now', 'start of day', '+9 hours')),

  (2, 3,                                           -- Auth design doc (Work)
     datetime('now', 'start of day', '+10 hours'),
     datetime('now', 'start of day', '+11 hours', '+45 minutes'),
     datetime('now', 'start of day', '+10 hours')),

  (3, 11,                                          -- Landing page (Side Project)
     datetime('now', 'start of day', '+19 hours', '+30 minutes'),
     datetime('now', 'start of day', '+21 hours'),
     datetime('now', 'start of day', '+19 hours', '+30 minutes')),

  -- Yesterday
  (4, 1,                                           -- Q3 roadmap (Work)
     datetime('now', 'start of day', '-1 day', '+9 hours', '+30 minutes'),
     datetime('now', 'start of day', '-1 day', '+11 hours'),
     datetime('now', 'start of day', '-1 day', '+9 hours', '+30 minutes')),

  (5, 4,                                           -- Reply to client (Work)
     datetime('now', 'start of day', '-1 day', '+14 hours'),
     datetime('now', 'start of day', '-1 day', '+14 hours', '+30 minutes'),
     datetime('now', 'start of day', '-1 day', '+14 hours')),

  (6, 11,                                          -- Landing page (Side Project)
     datetime('now', 'start of day', '-1 day', '+20 hours'),
     datetime('now', 'start of day', '-1 day', '+21 hours', '+30 minutes'),
     datetime('now', 'start of day', '-1 day', '+20 hours')),

  -- 2 days ago
  (7, 2,                                           -- Review PRs (Work)
     datetime('now', 'start of day', '-2 days', '+10 hours'),
     datetime('now', 'start of day', '-2 days', '+10 hours', '+25 minutes'),
     datetime('now', 'start of day', '-2 days', '+10 hours')),

  (8, 3,                                           -- Auth design doc (Work)
     datetime('now', 'start of day', '-2 days', '+15 hours', '+30 minutes'),
     datetime('now', 'start of day', '-2 days', '+17 hours'),
     datetime('now', 'start of day', '-2 days', '+15 hours', '+30 minutes')),

  -- 3 days ago
  (9, 12,                                          -- Stripe integration (Side Project)
     datetime('now', 'start of day', '-3 days', '+19 hours'),
     datetime('now', 'start of day', '-3 days', '+20 hours', '+45 minutes'),
     datetime('now', 'start of day', '-3 days', '+19 hours')),

  -- 4 days ago (Work-heavy day)
  (10, 1,                                          -- Q3 roadmap (Work)
     datetime('now', 'start of day', '-4 days', '+9 hours'),
     datetime('now', 'start of day', '-4 days', '+10 hours', '+30 minutes'),
     datetime('now', 'start of day', '-4 days', '+9 hours')),

  (11, 3,                                          -- Auth design doc (Work)
     datetime('now', 'start of day', '-4 days', '+11 hours'),
     datetime('now', 'start of day', '-4 days', '+12 hours', '+45 minutes'),
     datetime('now', 'start of day', '-4 days', '+11 hours')),

  (12, 13,                                         -- Blog post (Side Project)
     datetime('now', 'start of day', '-4 days', '+20 hours'),
     datetime('now', 'start of day', '-4 days', '+21 hours', '+15 minutes'),
     datetime('now', 'start of day', '-4 days', '+20 hours'));
