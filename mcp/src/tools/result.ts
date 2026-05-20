/**
 * Helpers for building MCP tool results.
 *
 * Tool handlers return content blocks per the MCP spec (see
 * docs/research/mcp-spec-2025-06-18.md, "Tools" section). Two flavors:
 * success and error. Errors are tool-execution errors (isError: true)
 * rather than JSON-RPC protocol errors - the difference is that the
 * model can see and react to a tool-execution error, whereas a JSON-RPC
 * error is a transport-layer failure.
 *
 * We use the SDK's CallToolResult type directly so the tool callback
 * signature matches exactly what registerTool expects.
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ApiError } from '../api-client.js';

export function ok(text: string): CallToolResult {
  return { content: [{ type: 'text', text }] };
}

export function err(text: string): CallToolResult {
  return { content: [{ type: 'text', text }], isError: true };
}

/**
 * Wrap an async action so any thrown ApiError or unexpected error becomes
 * a structured tool error. Successful results are stringified to JSON unless
 * a custom formatter is provided.
 */
export async function runTool<T>(
  label: string,
  action: () => Promise<T>,
  formatter?: (result: T) => string,
): Promise<CallToolResult> {
  try {
    const result = await action();
    const text = formatter ? formatter(result) : JSON.stringify(result, null, 2);
    return ok(text);
  } catch (e) {
    if (e instanceof ApiError) {
      // 404 is a common, expected outcome (e.g. "task with that id does not
      // exist"). Surface the status so the LLM can decide whether to retry,
      // ask the user, or report.
      return err(`${label} failed (HTTP ${e.status}): ${e.message}`);
    }
    return err(
      `${label} failed unexpectedly: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}
