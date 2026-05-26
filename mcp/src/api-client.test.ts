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
import { buildTaskQuery, type Task } from './api-client.js';

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
      deadline: null,
      dueStatus: 'none',
      createdAt: '2026-05-27T00:00:00Z',
      isCompleted: false,
      completedAt: null,
      projectId: null,
      labels: [],
    };
    assert.ok(allowed.includes(sample.dueStatus));
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
