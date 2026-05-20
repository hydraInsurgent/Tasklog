/**
 * Tests for the runTool helper that wraps every MCP tool handler.
 * Verifies: success rendering (with and without a custom formatter), ApiError
 * surfaces HTTP status to the LLM, generic Error becomes a structured tool
 * error rather than a JSON-RPC protocol error.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ok, err, runTool } from './result.js';
import { ApiError } from '../api-client.js';

function textOf(content: unknown): string {
  const arr = content as Array<{ type: string; text: string }>;
  return arr[0]?.text ?? '';
}

describe('ok / err helpers', () => {
  test('ok wraps text in a content array with no isError flag', () => {
    const r = ok('hello');
    assert.equal(r.isError, undefined);
    assert.equal(textOf(r.content), 'hello');
  });

  test('err sets isError true with the text content', () => {
    const r = err('boom');
    assert.equal(r.isError, true);
    assert.equal(textOf(r.content), 'boom');
  });
});

describe('runTool', () => {
  test('success path with a custom formatter renders the formatted string', async () => {
    const result = await runTool(
      'test_op',
      async () => ({ id: 7 }),
      (r) => `Got id ${r.id}`,
    );
    assert.equal(result.isError, undefined);
    assert.equal(textOf(result.content), 'Got id 7');
  });

  test('success path without a formatter JSON-stringifies the result', async () => {
    const result = await runTool('test_op', async () => ({ id: 1, name: 'foo' }));
    const text = textOf(result.content);
    assert.match(text, /"id":\s*1/);
    assert.match(text, /"name":\s*"foo"/);
  });

  test('ApiError becomes a structured tool error naming the operation and status', async () => {
    const result = await runTool('list_tasks', async () => {
      throw new ApiError(404, 'Not Found', '{"message":"task 99 not found"}');
    });
    assert.equal(result.isError, true);
    const text = textOf(result.content);
    assert.match(text, /list_tasks/);
    assert.match(text, /404/);
  });

  test('generic Error becomes a structured tool error with the message', async () => {
    const result = await runTool('some_op', async () => {
      throw new Error('kaboom');
    });
    assert.equal(result.isError, true);
    const text = textOf(result.content);
    assert.match(text, /some_op/);
    assert.match(text, /kaboom/);
  });

  test('non-Error throws become a structured tool error too (string coerced)', async () => {
    const result = await runTool('some_op', async () => {
      throw 'just a string';
    });
    assert.equal(result.isError, true);
    const text = textOf(result.content);
    assert.match(text, /just a string/);
  });
});
