import type { McpCallResult } from "./call-wire";

/**
 * The error DOCUMENT an `isError` tool result means.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * IT DESCRIBES AND DOES NOT PRINT
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Same contract as `describeMcpSyncRefusal` next door, for the same reason:
 * `json-error-document.static-scan.test.ts`'s `emitsDocument` follows DIRECT calls
 * only, so a helper that called `reportFailure` itself would take the document
 * emission out of the exit's sight. Returning a descriptor keeps
 * `process.exitCode = reportFailure(…)` at the leaf, where that gate can read it,
 * and makes the result -> document mapping assertable without spying on stdout.
 *
 * ## 🔴 `remote-error` IS THE CATEGORY, AND `invalid-input` WOULD BE A LIE
 *
 * The request arrived, Nexus reached the remote, and the TOOL refused. Nothing
 * about the invocation was wrong, so a script must not read this as its own bug —
 * which is exactly what an `invalid-input` code tells it. `cause` is carried on the
 * descriptor rather than chosen at the exit so the two cannot drift: one place
 * decides what this result IS, and the exit only reports it.
 *
 * ## The tool's own text travels INSIDE the document
 *
 * It is the answer to a failed call, so losing it is not an option — and it cannot
 * be printed beside the document either, which is the ordering `call.command.ts`
 * states at the branch itself.
 */
export interface McpCallFailure {
  /** Closed to the one value on purpose — see the category note above. */
  readonly cause: "remote-error";
  readonly message: string;
  readonly hint: string;
}

/**
 * Describe the error document for a tool result that reported its own failure.
 *
 * @param result - A result whose `isError` is `true`. A successful one would
 *   produce a document claiming a failure that did not happen, so the caller's
 *   `if (result.isError)` is the precondition.
 * @returns The cause, message and hint for `reportFailure`.
 */
export function describeMcpCallFailure(result: McpCallResult): McpCallFailure {
  // 🔴 NAMED, NOT DROPPED SILENTLY. This path renders no media, so a tool that
  // answered with images and an error would otherwise look like it answered with
  // text alone — and an operator would go hunting for output that was never going
  // to appear. Zero blocks get no sentence rather than "0 media block(s)".
  const media =
    result.mediaBlocks.length === 0
      ? ""
      : ` ${String(result.mediaBlocks.length)} media block(s) are dropped on this path.`;

  return {
    cause: "remote-error",
    message: `Tool "${result.toolName}" reported that the call failed: ${result.text}`,
    hint: `That text is the tool's own answer and is what to read to recover.${media}`
  };
}
