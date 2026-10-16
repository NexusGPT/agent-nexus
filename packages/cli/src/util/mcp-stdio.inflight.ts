import type { JsonRpcMessage } from "./mcp-rpc";

/**
 * The in-flight request table, and what a cancellation does to it.
 *
 * ── WHY CANCELLATION IS HANDLED HERE AND NOT FORWARDED ───────────────────────
 *
 * `notifications/cancelled` names a request the client no longer wants. The
 * endpoint is stateless per request and has no in-flight call to stop, so
 * forwarding it would achieve nothing; aborting the local fetch is what actually
 * ends the work and frees the client. The reply that was already in flight is
 * DROPPED — a late reply to a cancelled id has broken stdio clients before.
 */

export interface InflightEntry {
  readonly controller: AbortController;
  cancelled: boolean;
}

/** In-flight requests by id, so a cancellation can find and abort one. */
export type InflightMap = Map<string | number, InflightEntry>;

export function cancelInflight(inflight: InflightMap, message: JsonRpcMessage): void {
  const target = (message.params as { requestId?: string | number } | undefined)?.requestId;
  if (target === undefined) return;
  const entry = inflight.get(target);
  if (!entry) return;
  entry.cancelled = true;
  entry.controller.abort();
}
