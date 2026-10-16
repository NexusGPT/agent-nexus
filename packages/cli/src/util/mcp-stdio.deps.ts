import type { JsonRpcMessage, JsonRpcResponse } from "./mcp-rpc";

/**
 * Everything the stdio bridge is handed, and nothing it reaches for itself.
 *
 * 🚨 STDOUT BELONGS TO THE PROTOCOL. A single stray `console.log` on this path
 * corrupts the stream and the host reports it as the model going silent
 * mid-response, never as a CLI bug. Every diagnostic goes through
 * {@link StdioBridgeDeps.warn}, which the caller points at stderr, and the only
 * writer to stdout is {@link StdioBridgeDeps.write}.
 */
export interface StdioBridgeDeps {
  /** Where messages arrive. `process.stdin` in the binary. */
  readonly input: NodeJS.ReadableStream;
  /** Write one message. The bridge passes a single line WITHOUT a trailing newline. */
  readonly write: (line: string) => void;
  /** Diagnostics. Must NOT reach stdout. */
  readonly warn: (message: string) => void;
  /**
   * Forward one message and resolve with the reply, or `null` for a
   * notification.
   *
   * Must not throw: a transport failure is a JSON-RPC *error reply*, which the
   * caller shapes because it is the layer that knows what failed. A throw is
   * still caught below, so a bug cannot kill the loop, but it produces the
   * generic internal-error code rather than a useful one.
   */
  readonly forward: (
    message: JsonRpcMessage,
    signal: AbortSignal
  ) => Promise<JsonRpcResponse | null>;
}
