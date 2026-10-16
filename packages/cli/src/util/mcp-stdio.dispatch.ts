import type { JsonRpcMessage } from "./mcp-rpc";
import type { StdioBridgeDeps } from "./mcp-stdio.deps";
import {
  errorReply,
  hasId,
  idOf,
  INTERNAL_ERROR,
  INVALID_REQUEST,
  PARSE_ERROR
} from "./mcp-stdio.errors";
import { cancelInflight, type InflightMap } from "./mcp-stdio.inflight";

/** What {@link handleLine} needs from the session it belongs to. */
export interface DispatchContext {
  readonly write: StdioBridgeDeps["write"];
  readonly forward: StdioBridgeDeps["forward"];
  readonly inflight: InflightMap;
  /** Every unsettled forward, so the shutdown can wait for it. */
  readonly pending: Set<Promise<void>>;
}

/** Parse one line, dispatch it, and answer on stdout — or not, when none is owed. */
export function handleLine(line: string, ctx: DispatchContext): void {
  const { write, forward, inflight, pending } = ctx;

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
    cancelInflight(inflight, message);
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
}
