import type { JsonRpcMessage, JsonRpcResponse } from "./mcp-rpc";

/**
 * THE STDIO FRAMING FOR `nexus mcp serve`, AND NOTHING ELSE.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THE FRAMING IS WRITTEN OUT RATHER THAN TAKEN FROM THE MCP SDK
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * MCP's stdio transport is newline-delimited JSON-RPC: one message per line, no
 * embedded newlines, replies on stdout, everything else on stderr. That is the
 * whole specification of the layer, and it is the forty lines below.
 *
 * `@modelcontextprotocol/sdk` implements the same thing, and taking it would put
 * a dependency with its own transitive tree into a CLI whose only runtime
 * dependency is `commander` — for a byte-splitting loop this package can state
 * completely. The part that MUST NOT be re-implemented is the tool surface, and
 * it is not re-implemented anywhere: the catalog, its input schemas, scope
 * filtering and dispatch are all server-side and derived from the route
 * contracts. This file forwards bytes; it knows no tool names.
 *
 * ── 🚨 STDOUT BELONGS TO THE PROTOCOL ────────────────────────────────────────
 *
 * A single stray `console.log` on this path corrupts the stream and the host
 * reports it as the model going silent mid-response, never as a CLI bug. Every
 * diagnostic goes through {@link StdioBridgeDeps.warn}, which the caller points
 * at stderr, and the only writer to stdout is {@link StdioBridgeDeps.write}.
 *
 * ── WHY CANCELLATION IS HANDLED HERE AND NOT FORWARDED ───────────────────────
 *
 * `notifications/cancelled` names a request the client no longer wants. The
 * endpoint is stateless per request and has no in-flight call to stop, so
 * forwarding it would achieve nothing; aborting the local fetch is what actually
 * ends the work and frees the client. The reply that was already in flight is
 * DROPPED — a late reply to a cancelled id has broken stdio clients before.
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

/** JSON-RPC 2.0 reserved codes this layer can produce on its own. */
const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const INTERNAL_ERROR = -32603;

function errorReply(id: string | number | null, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

/** `id` is ABSENT on a notification, which is a different thing from `id: null`. */
function hasId(message: unknown): boolean {
  return typeof message === "object" && message !== null && "id" in message;
}

function idOf(message: unknown): string | number | null {
  const raw = (message as { id?: unknown }).id;
  return typeof raw === "string" || typeof raw === "number" ? raw : null;
}

/**
 * Run the bridge until `input` ends, then wait for every in-flight reply.
 *
 * Resolving before the in-flight requests settle would drop the answers to
 * messages the client had already sent — a host that closes its pipe on shutdown
 * still expects the replies it is owed.
 */
export function runStdioBridge(deps: StdioBridgeDeps): Promise<void> {
  const { input, write, warn, forward } = deps;

  /** In-flight requests by id, so a cancellation can find and abort one. */
  const inflight = new Map<string | number, { controller: AbortController; cancelled: boolean }>();
  /** Every unsettled forward, so the shutdown can wait for it. */
  const pending = new Set<Promise<void>>();

  let buffer = "";
  let ended = false;

  const cancel = (message: JsonRpcMessage): void => {
    const target = (message.params as { requestId?: string | number } | undefined)?.requestId;
    if (target === undefined) return;
    const entry = inflight.get(target);
    if (!entry) return;
    entry.cancelled = true;
    entry.controller.abort();
  };

  const handleLine = (line: string): void => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      // The id is inside the document we could not read, so `null` is the only
      // honest answer — JSON-RPC 2.0 says exactly that for a parse error.
      write(JSON.stringify(errorReply(null, PARSE_ERROR, "Parse error: not valid JSON")));
      return;
    }

    if (typeof parsed !== "object" || parsed === null || !("jsonrpc" in parsed)) {
      write(
        JSON.stringify(
          errorReply(idOf(parsed), INVALID_REQUEST, "Invalid Request: not a JSON-RPC 2.0 message")
        )
      );
      return;
    }

    const message = parsed as JsonRpcMessage;
    const isNotification = !hasId(message);

    if (isNotification && message.method === "notifications/cancelled") {
      cancel(message);
      return;
    }

    const id = message.id;
    const entry = { controller: new AbortController(), cancelled: false };
    const trackable = typeof id === "string" || typeof id === "number";
    if (trackable) inflight.set(id, entry);

    // `Promise.resolve().then(…)` rather than calling `forward` directly: a
    // forward that throws SYNCHRONOUSLY would otherwise escape past the `.catch`
    // below — no error reply, and the exception propagates out of the stream's
    // `data` listener, which takes the whole process down. Wrapping turns every
    // failure shape into a rejection this chain can answer.
    const run = Promise.resolve()
      .then(() => forward(message, entry.controller.signal))
      .then((reply) => {
        // The client asked us to stop. Its transport may have released the id
        // already, so answering it now is worse than answering nothing.
        //
        // `isNotification` for the same reason the `.catch` below carries it: a
        // notification is owed no reply at all, so whatever a `forward` hands
        // back for one is not protocol and must not reach stdout.
        if (entry.cancelled || isNotification || reply === null) return;
        write(JSON.stringify(reply));
      })
      .catch((error: unknown) => {
        if (entry.cancelled || isNotification) return;
        write(
          JSON.stringify(
            errorReply(
              idOf(message),
              INTERNAL_ERROR,
              error instanceof Error ? error.message : String(error)
            )
          )
        );
      })
      .finally(() => {
        if (trackable) inflight.delete(id);
      });

    pending.add(run);
    void run.finally(() => pending.delete(run));
  };

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
      handleLine(line);
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
