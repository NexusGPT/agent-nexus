import { CLI_CODES } from "./errors-cli-codes";
import type { ExitCategory } from "./exit-code-categories";

/**
 * WHY A FAILURE THAT HAPPENED AFTER THE SEND CANNOT USE `refuse`.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 A DOCUMENT CARRYING THE WRONG `code` IS WORSE THAN PROSE, BECAUSE PROSE
 *    DOES NOT LIE IN A FIELD A SCRIPT TRUSTS.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `refuse` was written with `code` as an OPTIONAL parameter defaulting to
 * `CLI_INVALID_ARGUMENTS`, and 30 of the 73 call sites that adopted it are
 * failures that happened AFTER the invocation was accepted — a registry that
 * could not be reached, a validation request that answered 500, an `npm install`
 * that failed, a config write that threw. Every one of them told a script "you
 * passed a bad argument". A caller branching on `code` stops retrying a
 * connectivity failure and tells a user to check their flags.
 *
 * That is the same defect this whole change set is about, committed by the fix:
 * the shape was enforced and the claim inside it was false.
 *
 * The vocabulary is a CLOSED UNION rather than a string, so a call site cannot
 * spell one wrong, and `refuse` no longer has a `code` parameter AT ALL — the
 * mislabelling is now unrepresentable rather than reviewed. See `reportFailure`
 * in `errors-report.ts`.
 */
export type FailureCause =
  /** A named thing does not exist — a profile, an `.nexusrc`, an organization. */
  | "not-found"
  /** No usable credential, or one the server rejected. */
  | "not-authenticated"
  /** The API could not be reached. Retryable. */
  | "connection-failed"
  /**
   * The CLI stopped waiting. The server may still be completing the request.
   *
   * Spelled in the PAST TENSE deliberately: a member named `timeout` is a
   * duration everywhere else in this package, and `timeout-values-carry-their-unit`
   * reads any such identifier as a millisecond slot. Naming the EVENT rather than
   * a length keeps the two vocabularies from colliding.
   */
  | "timed-out"
  /** The request completed and the answer reports a failure. */
  | "remote-error"
  /** A local operation this CLI performed failed — install, config write, spawn. */
  | "local-failed"
  /** The person stopped the command at a question — Ctrl-C at an install prompt. */
  | "interrupted";

export const FAILURE_CAUSE_CODES: Readonly<Record<FailureCause, string>> = {
  "not-found": CLI_CODES.NOT_FOUND,
  "not-authenticated": CLI_CODES.NOT_AUTHENTICATED,
  "connection-failed": CLI_CODES.CONNECTION_FAILED,
  "timed-out": CLI_CODES.TIMEOUT,
  "remote-error": CLI_CODES.REMOTE_ERROR,
  "local-failed": CLI_CODES.LOCAL_FAILED,
  interrupted: CLI_CODES.INTERRUPTED
};

/**
 * THE SAME SEVEN CAUSES, AS EXIT CODES. The vocabulary is declared once and read
 * twice — once for the document's `code`, once for the process's status.
 *
 * Written as a `Record<FailureCause, …>` so adding a cause is a compile error
 * here until it has an exit category. A `?? failed` default would let a new
 * cause ship as a generic `1` with nothing to notice it, which is the exact
 * shape of the defect this whole file is undoing.
 */
export const FAILURE_CAUSE_EXIT_CATEGORIES: Readonly<Record<FailureCause, ExitCategory>> = {
  "not-found": "not-found",
  "not-authenticated": "not-authenticated",
  "connection-failed": "connection-failed",
  "timed-out": "timed-out",
  "remote-error": "remote-error",
  "local-failed": "local-failed",
  interrupted: "interrupted"
};
