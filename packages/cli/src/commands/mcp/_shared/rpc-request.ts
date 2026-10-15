import { reportFailure } from "../../../errors";
import {
  type JsonRpcMessage,
  type JsonRpcResponse,
  type McpToolDescriptor,
  type McpTransport,
  readToolList,
  toolsListMessage
} from "../../../util/mcp-rpc";

/** JSON-RPC ids are per-connection; a one-shot command needs exactly one. */
export const ONE_SHOT_ID = 1;

/**
 * Turn a JSON-RPC error object into the CLI's own failure document.
 *
 * A JSON-RPC error is the request COMPLETING with a refusal, so it is
 * `remote-error` — the same cause a 4xx gets — rather than a transport failure.
 * The numeric code is carried in the message because it is the only handle the
 * server-side dispatcher gives a reader.
 */
export function reportRpcError(
  error: NonNullable<JsonRpcResponse["error"]>,
  hint?: string
): number {
  return reportFailure("remote-error", `${error.message} (JSON-RPC ${error.code})`, hint);
}

/**
 * Send one message and return its result, or `undefined` once a failure has
 * been reported. The caller checks for `undefined` and returns.
 *
 * 🚨 `undefined` MEANS "A FAILURE WAS REPORTED", NEVER "the result was absent",
 * and keeping those apart is the whole reason the third branch exists. A reply
 * carrying neither `result` nor `error` is malformed — JSON-RPC 2.0 requires
 * exactly one — and letting it fall through as a value would exit 0 having
 * printed nothing at all, which is the single outcome a caller cannot tell from
 * a working command.
 */
export async function requestResult(
  transport: McpTransport,
  message: JsonRpcMessage,
  hint?: string
): Promise<unknown | undefined> {
  const response = await transport.send(message);
  if (response === null) {
    process.exitCode = reportFailure(
      "remote-error",
      "The MCP endpoint answered with an empty body where a JSON-RPC reply was required.",
      `Endpoint: ${transport.target.url}`
    );
    return undefined;
  }
  if (response.error) {
    process.exitCode = reportRpcError(response.error, hint);
    return undefined;
  }
  if (response.result === undefined) {
    process.exitCode = reportFailure(
      "remote-error",
      "The MCP endpoint answered with neither a result nor an error.",
      `Endpoint: ${transport.target.url}`
    );
    return undefined;
  }
  return response.result;
}

/** Fetch the whole catalog the calling key can see. */
export async function listTools(transport: McpTransport): Promise<McpToolDescriptor[] | undefined> {
  const result = await requestResult(
    transport,
    toolsListMessage(ONE_SHOT_ID),
    "The endpoint needs a valid API key; the catalog it returns is narrowed to that key's scopes."
  );
  if (result === undefined) return undefined;

  const tools = readToolList(result);
  if (tools === undefined) {
    process.exitCode = reportFailure(
      "remote-error",
      "The tools/list reply carried no tools array.",
      `Endpoint: ${transport.target.url}. Run "nexus api POST /mcp --body '{\\"jsonrpc\\":\\"2.0\\",\\"id\\":1,\\"method\\":\\"tools/list\\"}'" to see the raw response.`
    );
    return undefined;
  }
  return tools;
}
