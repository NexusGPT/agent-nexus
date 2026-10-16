import type { StdioBridgeDeps } from "./mcp-stdio.deps";
import { type DispatchContext, handleLine } from "./mcp-stdio.dispatch";
import type { InflightMap } from "./mcp-stdio.inflight";

/**
 * The newline framing itself: splitting the stream into lines, and waiting for
 * every reply the client is owed before the promise settles.
 */

/**
 * Run the bridge until `input` ends, then wait for every in-flight reply.
 *
 * Resolving before the in-flight requests settle would drop the answers to
 * messages the client had already sent — a host that closes its pipe on shutdown
 * still expects the replies it is owed.
 */
export function runStdioBridge(deps: StdioBridgeDeps): Promise<void> {
  const { input, write, warn, forward } = deps;

  const inflight: InflightMap = new Map();
  const pending = new Set<Promise<void>>();
  const ctx: DispatchContext = { write, forward, inflight, pending };

  let buffer = "";
  let ended = false;

  /**
   * Read one line, never letting it kill the session.
   *
   * A throw inside a stream's `data` listener is an UNCAUGHT exception: it does
   * not reject this function's promise, it terminates the process. The host sees
   * the server vanish mid-conversation with no reply to the message it sent, so
   * one malformed line would end every other in-flight request too. Whatever
   * {@link handleLine} cannot do, the session survives.
   */
  const handle = (line: string): void => {
    try {
      handleLine(line, ctx);
    } catch (error) {
      warn(`could not handle a message: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  return new Promise<void>((resolve, reject) => {
    const finish = (): void => {
      if (ended) return;
      ended = true;
      // Snapshot: a reply written during the drain cannot add work, because
      // every message that could has already been read off a closed stream.
      void Promise.allSettled([...pending]).then(() => resolve());
    };

    input.setEncoding("utf8");
    input.on("data", (chunk: string) => {
      buffer += chunk;
      let newline = buffer.indexOf("\n");
      while (newline !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line !== "") handle(line);
        newline = buffer.indexOf("\n");
      }
    });
    input.on("end", () => {
      // A final message with no trailing newline is still a message. Dropping it
      // silently is the failure mode a host only sees as a missing reply.
      const line = buffer.trim();
      buffer = "";
      if (line !== "") handle(line);
      finish();
    });
    input.on("close", finish);
    input.on("error", (error: Error) => {
      warn(`stdin failed: ${error.message}`);
      reject(error);
    });
  });
}
