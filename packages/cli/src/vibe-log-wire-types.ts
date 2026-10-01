/**
 * The runtime-log WIRE SHAPES `nexus apps logs` reads — the page, the pipeline
 * verdict it carries, and the follow's SSE frames.
 *
 * Split out of `vibe-wire-types.ts` (which re-exports all of it, so no import
 * site moved) under the same rules that file states: re-declared rather than
 * imported, because `@nexus/types` is not a runtime dependency of the published
 * CLI, and held to the real schemas by `vibe-wire-types.conformance.ts`.
 */

// ============================================================
// Runtime logs — mirrors app-logs.schemas.ts (the page) and
// app-log-stream.schemas.ts (the follow).
// ============================================================

/**
 * The deployment slots a log line can carry, as they appear IN A LOG RECORD.
 *
 * Lower-case, and that is not a style choice: the database enum spells them
 * `BLUE` / `GREEN`, while the OTel resource attribute the log store indexes is
 * written `identity.color.toLowerCase()`. Sending the database spelling matches
 * nothing, silently. `vibe-wire-types.conformance.ts` pins these against
 * `VibeLogColorSchema`, which carries the same `satisfies` guard on the other
 * side of the wire.
 */
export const VIBE_LOG_COLORS = ["blue", "green"] as const;
export type VibeLogColor = (typeof VIBE_LOG_COLORS)[number];

export function isVibeLogColor(value: string): value is VibeLogColor {
  return (VIBE_LOG_COLORS as readonly string[]).includes(value);
}

/**
 * The server's own ceiling on lines per page.
 *
 * Mirrors `VIBE_LOG_GATEWAY_MAX_LIMIT`, and it is NOT the CLI's ceiling — see
 * `VIBE_LOG_CLI_MAX_LIMIT`, which is deliberately stricter. Declared here so the
 * conformance gate can prove the two numbers are the same one, and so the
 * comment above `VIBE_LOG_CLI_MAX_LIMIT` is checkable rather than assertive.
 */
export const VIBE_LOG_WIRE_MAX_LIMIT = 5000;

/** The server's ceiling on the `--grep` needle. Mirrors `VIBE_LOG_GATEWAY_MAX_CONTAINS_LENGTH`. */
export const VIBE_LOG_WIRE_MAX_CONTAINS_LENGTH = 512;

/** One log line, as the tenant gateway rendered it. */
export interface VibeLogLineDto {
  /** The log store's own nanosecond epoch timestamp, verbatim. Doubles as the paging cursor. */
  timestampNs: string;
  /** The same instant as ISO 8601, so a reader never does nanosecond arithmetic. */
  timestamp: string;
  /** The line itself, exactly as the app emitted it. */
  message: string;
  /**
   * The deployment slot the line came from, when the record carries one.
   *
   * `string | null` rather than `VibeLogColor | null`, matching the wire: the
   * gateway relays whatever label the record holds, so narrowing it here would
   * be the CLI claiming a guarantee the producer does not make. A published
   * binary must not reject a value a newer platform starts emitting.
   */
  color: string | null;
}

/** One page of log lines, newest first, plus the cursor for the page before it. */
export interface GetVibeAppLogsResponse {
  lines: VibeLogLineDto[];
  /**
   * Pass as the next request's `cursor` to page further back, or `null` when
   * this page reached the start of the window.
   */
  nextCursor: string | null;
  /**
   * Whether the pipeline that would have delivered these lines is working, as
   * the tenant gateway judged it at read time. ABSENT from a gateway older than
   * the field — which the CLI reads as unverified, never as healthy.
   */
  pipeline?: VibeLogPipelineHealthDto;
}

/**
 * Mirrors `VibeLogPipelineHealthSchema`. `status` and `reason` are `string`
 * rather than the server's closed unions, for the reason `color` is above: a
 * published binary must not reject a value a newer platform starts emitting.
 * The CLI trusts exactly one value, `healthy`, and treats anything else as a
 * pipeline it cannot vouch for.
 */
export interface VibeLogPipelineHealthDto {
  status: string;
  reason: string;
  /** One sentence, in the platform's voice, naming what was measured. */
  detail: string;
  expectedNodes: number;
  reportingNodes: number;
  silentNodes: string[];
  checkedAt: string;
}

/**
 * A frame on the runtime-log SSE stream, as the CONSOLE-FACING wire spells it.
 *
 * Data-only: the discriminant is inside the JSON and there are no SSE `event:`
 * names to read. The tenant-facing wire between the gateway and the control
 * plane is a DIFFERENT format with named events and `id:` resume points, and the
 * CLI never sees it.
 *
 * `end` and `error` are both terminal and mutually exclusive — an `error` is
 * never followed by an `end`. A stream that stops with neither is a dropped
 * connection, which the follow driver reports rather than rendering as a quiet
 * end.
 */
export type VibeAppLogStreamFrame =
  | { type: "lines"; lines: VibeLogLineDto[] }
  | { type: "end"; reason: VibeAppLogStreamEndReason }
  | { type: "error"; message: string };

/**
 * Why a follow stopped.
 *
 * One value, and the honest count is one: the tenant gateway closes its side on
 * its own duration cap. Nothing is wrong and nothing was lost.
 */
export const VIBE_APP_LOG_STREAM_END_REASONS = ["upstream-closed"] as const;
export type VibeAppLogStreamEndReason = (typeof VIBE_APP_LOG_STREAM_END_REASONS)[number];
