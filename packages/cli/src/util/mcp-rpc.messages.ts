import type { JsonRpcMessage, McpCallResult, McpToolDescriptor } from "./mcp-rpc.types";

/**
 * The two requests `nexus mcp` sends, and the three readers that take a reply
 * apart. Every reader is DEFENSIVE rather than a cast: the catalog is generated
 * server-side and a cast would turn "the server sent something unexpected" into
 * a confident wrong answer, which is the one failure a caller cannot detect.
 */

/** The `tools/list` request, with the id the caller wants echoed back. */
export function toolsListMessage(id: number): JsonRpcMessage {
  return { jsonrpc: "2.0", id, method: "tools/list", params: {} };
}

/** The `tools/call` request for one tool and its arguments. */
export function toolsCallMessage(
  id: number,
  name: string,
  args: Record<string, unknown>
): JsonRpcMessage {
  return { jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } };
}

/**
 * Read the tools out of a `tools/list` result.
 *
 * Defensive about the shape rather than casting: this is a live endpoint whose
 * catalog is generated server-side, and a caller that trusted the cast would
 * print `undefined` rows instead of saying the response was not what it claimed.
 */
export function readToolList(result: unknown): McpToolDescriptor[] | undefined {
  if (typeof result !== "object" || result === null) return undefined;
  const tools = (result as { tools?: unknown }).tools;
  if (!Array.isArray(tools)) return undefined;
  return tools.filter(
    (tool): tool is McpToolDescriptor =>
      typeof tool === "object" &&
      tool !== null &&
      typeof (tool as McpToolDescriptor).name === "string"
  );
}

/**
 * Read a `tools/call` result without asserting its shape.
 *
 * A cast here would be a claim about a live endpoint rather than a check of it,
 * and the field it matters most for is `isError`: a cast turns "the server sent
 * something we did not expect" into "the tool succeeded", which is the one wrong
 * answer a caller cannot detect. Anything that is not a `true` boolean is
 * therefore NOT an error, and anything that is not an array of blocks is no
 * content — both stated, rather than assumed.
 */
export function readCallResult(value: unknown): McpCallResult {
  if (typeof value !== "object" || value === null) return {};
  const record = value as { content?: unknown; isError?: unknown };
  const content = Array.isArray(record.content)
    ? record.content.filter(
        (block): block is { type: string; text?: string } =>
          typeof block === "object" &&
          block !== null &&
          typeof (block as { type?: unknown }).type === "string"
      )
    : undefined;
  return {
    ...(content ? { content } : {}),
    ...(record.isError === true ? { isError: true } : {})
  };
}

/**
 * The single text block a `tools/call` result carries, parsed when it is JSON.
 *
 * The endpoint answers `content: [{ type: "text", text: JSON.stringify(data) }]`
 * — the payload is a JSON document inside a string. Returning it re-parsed is
 * what makes `nexus mcp call agent_list | jq '.data[0].id'` work; `--raw` is
 * there for the caller who wants the envelope instead.
 */
export function readCallPayload(result: McpCallResult): unknown {
  const texts: string[] = [];
  for (const block of result.content ?? []) {
    if (block.type === "text" && typeof block.text === "string") texts.push(block.text);
  }
  // Collected as strings rather than filtered-then-cast: `Array.prototype.filter`
  // does not narrow the element type, so the cast that spelling needs would be
  // an assertion about the same data this function exists to be careful with.
  if (texts.length !== 1) return result;
  try {
    return JSON.parse(texts[0]);
  } catch {
    return texts[0];
  }
}
