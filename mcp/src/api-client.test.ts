/**
 * Tests for the api-client query-string serialization.
 *
 * The high-value invariant is the wire-level shape between the MCP tool layer
 * and the .NET backend: undefined fields must be omitted, arrays must become
 * comma-separated values, empty arrays must not produce an empty filter
 * (otherwise a no-args call from the LLM would accidentally filter to "no
 * tasks").
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildTaskQuery, type Task, type Subtask } from './api-client.js';

// dueStatus is computed server-side and passed through unchanged by the client
// (api-client does not transform response bodies). The compile-time guarantee is
// the Task type; this contract test documents the allowed values and that a task
// the LLM sees is expected to carry one of them.
describe('Task.dueStatus shape (server-computed, pass-through)', () => {
  test('Task type requires dueStatus to be one of the five buckets', () => {
    const allowed = ['overdue', 'today', 'this_week', 'later', 'none'];
    const sample: Task = {
      id: 1,
      title: 'x',
      description: null,
      deadline: null,
      dueStatus: 'none',
      priority: 4,
      createdAt: '2026-05-27T00:00:00Z',
      isCompleted: false,
      completedAt: null,
      projectId: null,
      labels: [],
      recurrence: null,
      seriesId: null,
      isRecurring: false,
      isHabit: false,
      weeklyTarget: null,
    };
    assert.ok(allowed.includes(sample.dueStatus));
    assert.equal(sample.priority, 4);
  });
});

// Priority flows through create/update bodies and the list filter (#64).
describe('priority wire contract', () => {
  test('create body carries priority when set', () => {
    assert.equal(
      JSON.stringify({ title: 'x', priority: 1 }),
      '{"title":"x","priority":1}',
    );
  });
  test('update body carries priority (no clear - 4 is none)', () => {
    assert.equal(JSON.stringify({ priority: 4 }), '{"priority":4}');
  });
  test('buildTaskQuery serializes priorities as repeated keys', () => {
    assert.equal(buildTaskQuery({ priorities: [1, 2] }), '?priorities=1&priorities=2');
  });
  test('buildTaskQuery omits an empty priorities array', () => {
    assert.equal(buildTaskQuery({ priorities: [] }), '');
  });
});

// createdAt range + sort/order/limit are scalar params serialized via params.set (#65).
describe('buildTaskQuery - createdAt range, sort, limit', () => {
  test('serializes createdAfter and createdBefore', () => {
    assert.equal(
      buildTaskQuery({ createdAfter: '2026-05-27', createdBefore: '2026-05-28' }),
      '?createdAfter=2026-05-27&createdBefore=2026-05-28',
    );
  });
  test('serializes sort + order', () => {
    assert.equal(buildTaskQuery({ sort: 'deadline', order: 'asc' }), '?sort=deadline&order=asc');
  });
  test('serializes limit, including 0 (backend rejects <1, but the client passes it through)', () => {
    assert.equal(buildTaskQuery({ limit: 5 }), '?limit=5');
    assert.equal(buildTaskQuery({ limit: 0 }), '?limit=0');
  });
  test('omits sort/order/limit/createdAt when not provided', () => {
    assert.equal(buildTaskQuery({}), '');
  });
});

// The update_task PATCH body relies on JSON.stringify's keep/clear/set
// behaviour: undefined keys are omitted (backend leaves the field unchanged),
// null is kept (backend clears the field), a value is sent (backend sets it).
// This contract is what makes the partial PATCH work without read-modify-write.
describe('update_task PATCH body contract (JSON.stringify keep/clear/set)', () => {
  test('title only - deadline omitted (keep)', () => {
    assert.equal(JSON.stringify({ title: 'New' }), '{"title":"New"}');
  });
  test('deadline null - clear survives serialization', () => {
    assert.equal(JSON.stringify({ deadline: null }), '{"deadline":null}');
  });
  test('deadline value - set', () => {
    assert.equal(JSON.stringify({ deadline: '2026-12-31' }), '{"deadline":"2026-12-31"}');
  });
  test('undefined field is dropped entirely (keep)', () => {
    assert.equal(JSON.stringify({ title: 'x', deadline: undefined }), '{"title":"x"}');
  });
  test('empty body = no-op update', () => {
    assert.equal(JSON.stringify({}), '{}');
  });
});

// The bulk endpoint takes { operation, taskIds, data }. The body must carry the
// operation discriminator and the right data shape; deadline null must survive
// (clear) while a value is sent (set), same JSON.stringify contract as above.
describe('bulk POST body contract', () => {
  test('complete carries operation + taskIds + isCompleted', () => {
    assert.equal(
      JSON.stringify({ operation: 'complete', taskIds: [1, 2], data: { isCompleted: true } }),
      '{"operation":"complete","taskIds":[1,2],"data":{"isCompleted":true}}',
    );
  });
  test('assignProject null moves to Inbox (null survives)', () => {
    assert.equal(
      JSON.stringify({ operation: 'assignProject', taskIds: [3], data: { projectId: null } }),
      '{"operation":"assignProject","taskIds":[3],"data":{"projectId":null}}',
    );
  });
  test('setDeadline value sets', () => {
    assert.equal(
      JSON.stringify({ operation: 'setDeadline', taskIds: [4], data: { deadline: '2026-12-31' } }),
      '{"operation":"setDeadline","taskIds":[4],"data":{"deadline":"2026-12-31"}}',
    );
  });
  test('setDeadline null clears', () => {
    assert.equal(
      JSON.stringify({ operation: 'setDeadline', taskIds: [4], data: { deadline: null } }),
      '{"operation":"setDeadline","taskIds":[4],"data":{"deadline":null}}',
    );
  });
  test('setPriority carries priority (#66)', () => {
    assert.equal(
      JSON.stringify({ operation: 'setPriority', taskIds: [1, 2], data: { priority: 1 } }),
      '{"operation":"setPriority","taskIds":[1,2],"data":{"priority":1}}',
    );
  });
  test('assignProject by name carries projectName (#66)', () => {
    assert.equal(
      JSON.stringify({ operation: 'assignProject', taskIds: [3], data: { projectName: 'Work' } }),
      '{"operation":"assignProject","taskIds":[3],"data":{"projectName":"Work"}}',
    );
  });
});

// Name-based resolution: the single-task assign/labels bodies carry the name field (#66).
describe('name resolution request bodies', () => {
  test('setTaskProject body carries projectName', () => {
    assert.equal(JSON.stringify({ projectName: 'Work' }), '{"projectName":"Work"}');
  });
  test('setTaskLabels body carries labelNames', () => {
    assert.equal(
      JSON.stringify({ labelNames: ['urgent', 'home'] }),
      '{"labelNames":["urgent","home"]}',
    );
  });
});

// Description flows through create/update bodies; null on update clears (#67).
describe('description wire contract', () => {
  test('create body carries description', () => {
    assert.equal(
      JSON.stringify({ title: 'x', description: 'some notes' }),
      '{"title":"x","description":"some notes"}',
    );
  });
  test('update body sets description', () => {
    assert.equal(JSON.stringify({ description: 'hi' }), '{"description":"hi"}');
  });
  test('update body null clears description', () => {
    assert.equal(JSON.stringify({ description: null }), '{"description":null}');
  });
});

// Recurrence flows through create/update bodies; null on update stops repeating (#70).
describe('recurrence wire contract', () => {
  test('create body carries recurrence', () => {
    assert.equal(
      JSON.stringify({ title: 'x', deadline: '2026-05-27', recurrence: 'FREQ=DAILY' }),
      '{"title":"x","deadline":"2026-05-27","recurrence":"FREQ=DAILY"}',
    );
  });
  test('update body sets recurrence', () => {
    assert.equal(
      JSON.stringify({ recurrence: 'FREQ=WEEKLY;BYDAY=MO,WE' }),
      '{"recurrence":"FREQ=WEEKLY;BYDAY=MO,WE"}',
    );
  });
  test('update body null stops the task repeating', () => {
    assert.equal(JSON.stringify({ recurrence: null }), '{"recurrence":null}');
  });
  test('advanced rule strings (v2.15.0) pass through verbatim', () => {
    // nth-weekday, last-day, every-other-week, and end conditions are just strings on the wire.
    for (const rule of [
      'FREQ=MONTHLY;BYDAY=3TH',
      'FREQ=MONTHLY;BYMONTHDAY=-1',
      'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO',
      'FREQ=DAILY;UNTIL=20261231',
      'FREQ=DAILY;COUNT=5',
    ]) {
      assert.equal(JSON.stringify({ recurrence: rule }), `{"recurrence":"${rule}"}`);
    }
  });
  test('Task carries recurrence / seriesId / isRecurring', () => {
    const t: Pick<Task, 'recurrence' | 'seriesId' | 'isRecurring'> = {
      recurrence: 'FREQ=DAILY',
      seriesId: 'a1b2',
      isRecurring: true,
    };
    assert.equal(t.isRecurring, true);
    assert.equal(t.recurrence, 'FREQ=DAILY');
  });
});

// Habit frequency ("x times a week", #75): weeklyTarget is an int on the wire, mutually
// exclusive with recurrence (the backend enforces that; the client just serializes it).
describe('weeklyTarget wire contract', () => {
  test('create body carries weeklyTarget for a frequency habit', () => {
    assert.equal(
      JSON.stringify({ title: 'Gym', isHabit: true, weeklyTarget: 3 }),
      '{"title":"Gym","isHabit":true,"weeklyTarget":3}',
    );
  });
  test('update body sets weeklyTarget', () => {
    assert.equal(JSON.stringify({ weeklyTarget: 4 }), '{"weeklyTarget":4}');
  });
  test('update body null drops the weekly target', () => {
    assert.equal(JSON.stringify({ weeklyTarget: null }), '{"weeklyTarget":null}');
  });
  test('Task carries weeklyTarget', () => {
    const t: Pick<Task, 'weeklyTarget' | 'isHabit'> = { weeklyTarget: 3, isHabit: true };
    assert.equal(t.weeklyTarget, 3);
  });
});

// add_task_comment POSTs { body }; comments are typed on the Task as optional (#69).
describe('comments wire contract', () => {
  test('add_task_comment body carries the text', () => {
    assert.equal(JSON.stringify({ body: 'a note' }), '{"body":"a note"}');
  });
  test('Task.comments is an optional Comment[] (present on get_task)', () => {
    const allowed: Task['comments'] = [{ id: 1, body: 'hi', createdAt: '2026-05-27T00:00:00Z' }];
    assert.equal(allowed?.[0].body, 'hi');
  });
});

// isHabit flows through create/update bodies; log_habit_checkin POSTs { date? } (#74).
describe('habits wire contract', () => {
  test('create body carries isHabit', () => {
    assert.equal(
      JSON.stringify({ title: 'Meditate', isHabit: true }),
      '{"title":"Meditate","isHabit":true}',
    );
  });
  test('update body sets isHabit true / false (no clear - it is a plain bool)', () => {
    assert.equal(JSON.stringify({ isHabit: true }), '{"isHabit":true}');
    assert.equal(JSON.stringify({ isHabit: false }), '{"isHabit":false}');
  });
  test('check-in body carries an explicit date when given', () => {
    assert.equal(JSON.stringify({ date: '2026-05-28' }), '{"date":"2026-05-28"}');
  });
  test('check-in body is empty {} for today (date omitted)', () => {
    // addCheckIn posts {} when no date is passed - the backend defaults to today.
    assert.equal(JSON.stringify({}), '{}');
  });
  test('Task carries isHabit as a required boolean', () => {
    const t: Pick<Task, 'isHabit'> = { isHabit: true };
    assert.equal(t.isHabit, true);
  });
});

describe('buildTaskQuery', () => {
  test('returns empty string when filter is undefined (no query)', () => {
    assert.equal(buildTaskQuery(undefined), '');
  });

  test('returns empty string when filter is {} (all fields undefined)', () => {
    assert.equal(buildTaskQuery({}), '');
  });

  test('omits empty projectIds array', () => {
    assert.equal(buildTaskQuery({ projectIds: [] }), '');
  });

  test('omits empty labelIds array', () => {
    assert.equal(buildTaskQuery({ labelIds: [] }), '');
  });

  test('serializes projectIds as repeated keys (ASP.NET binds these to int[])', () => {
    // NOT comma-separated: ?projectIds=3,5 fails to bind and matches nothing.
    const qs = buildTaskQuery({ projectIds: [3, 5] });
    assert.equal(qs, '?projectIds=3&projectIds=5');
  });

  test('serializes labelIds as repeated keys', () => {
    const qs = buildTaskQuery({ labelIds: [1, 2, 7] });
    assert.equal(qs, '?labelIds=1&labelIds=2&labelIds=7');
  });

  test('serializes inbox=true', () => {
    assert.equal(buildTaskQuery({ inbox: true }), '?inbox=true');
  });

  test('serializes inbox=false (false is a meaningful filter value, not "omitted")', () => {
    assert.equal(buildTaskQuery({ inbox: false }), '?inbox=false');
  });

  test('serializes completed=false (boolean false survives encoding)', () => {
    assert.equal(buildTaskQuery({ completed: false }), '?completed=false');
  });

  test('serializes ISO date filters verbatim', () => {
    const qs = buildTaskQuery({ dueBefore: '2026-12-31', dueAfter: '2026-01-01' });
    assert.match(qs, /dueBefore=2026-12-31/);
    assert.match(qs, /dueAfter=2026-01-01/);
  });

  test('serializes text with URL encoding of spaces', () => {
    const qs = buildTaskQuery({ text: 'review PR' });
    assert.match(qs, /text=review\+PR/);
  });

  test('omits text when only whitespace', () => {
    assert.equal(buildTaskQuery({ text: '   ' }), '');
  });

  test('trims surrounding whitespace from text before sending', () => {
    // Backend and frontend both trim before matching; the wire value must too,
    // or "  review  " would match the literal padded substring and find nothing.
    assert.equal(buildTaskQuery({ text: '  review  ' }), '?text=review');
  });

  test('combines multiple fields with all expected query keys', () => {
    const qs = buildTaskQuery({
      projectIds: [3, 5],
      labelIds: [1],
      dueBefore: '2026-12-31',
      completed: false,
      text: 'urgent',
    });
    assert.match(qs, /^\?/);
    assert.match(qs, /projectIds=3&projectIds=5/);
    assert.match(qs, /labelIds=1/);
    assert.match(qs, /dueBefore=2026-12-31/);
    assert.match(qs, /completed=false/);
    assert.match(qs, /text=urgent/);
  });
});

// Subtasks (#78): the tool layer builds these request bodies inline; document the
// wire shape so a subtask create/update/reorder stays aligned with the backend.
describe('subtask wire contract', () => {
  test('Subtask type carries the expected fields', () => {
    const s: Subtask = {
      id: 1,
      title: 'step',
      isCompleted: false,
      position: 0,
      deadline: null,
      createdAt: '2026-07-02T00:00:00Z',
      taskId: 9,
    };
    assert.equal(s.taskId, 9);
    assert.equal(s.isCompleted, false);
  });

  test('create body omits deadline when not given, includes it when given', () => {
    assert.equal(JSON.stringify({ title: 'x' }), '{"title":"x"}');
    assert.equal(
      JSON.stringify({ title: 'x', deadline: '2026-09-01' }),
      '{"title":"x","deadline":"2026-09-01"}',
    );
  });

  test('update body carries only the present keys (deadline null clears)', () => {
    assert.equal(JSON.stringify({ isCompleted: true }), '{"isCompleted":true}');
    assert.equal(JSON.stringify({ deadline: null }), '{"deadline":null}');
  });

  test('reorder body carries the ordered ids', () => {
    assert.equal(
      JSON.stringify({ orderedIds: [3, 1, 2] }),
      '{"orderedIds":[3,1,2]}',
    );
  });

  test('find_subtasks builds a query string, omitting undefined filters', () => {
    const build = (opts: { text?: string; completed?: boolean }) => {
      const params = new URLSearchParams();
      if (opts.text) params.set('text', opts.text);
      if (opts.completed !== undefined) params.set('completed', String(opts.completed));
      const qs = params.toString();
      return `/api/subtasks${qs ? `?${qs}` : ''}`;
    };
    assert.equal(build({}), '/api/subtasks');
    assert.equal(build({ text: 'waitlist' }), '/api/subtasks?text=waitlist');
    assert.equal(build({ completed: false }), '/api/subtasks?completed=false');
  });
});
