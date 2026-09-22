/**
 * Typed errors for the admin command tree.
 *
 * The admin endpoints don't go through `@agent-nexus/sdk` (different base
 * path + different auth header — see `admin-http.ts`), so the SDK's
 * `NexusApiError` doesn't apply. We carry the HTTP status here so each
 * command can map it to a meaningful exit code.
 *
 * Exit codes come from `src/exit-codes.ts` and are NOT declared here. This map
 * was the CLI's only real exit-code vocabulary for a long time, which is why the
 * taxonomy kept its five meanings on their original numbers — 2 auth, 3
 * permission, 4 not-found, 5 invalid-input, 6 remote-error. What changed is
 * ownership: the numbers are the whole binary's now, `exitCodeForHttpStatus`
 * is the single rule, and the resource tree reads the same one.
 */

import { printFailure } from "../errors";
import { EXIT_CODES, exitCodeForHttpStatus } from "../exit-codes";

export class AdminCliError extends Error {
  readonly status: number | null;
  readonly code: string | null;
  /** The remedy, carried in its OWN field. See {@link handleAdminError}. */
  readonly hint: string | null;
  readonly exitCode: number;

  private constructor(
    message: string,
    status: number | null,
    code: string | null,
    exitCode: number,
    hint: string | null = null
  ) {
    super(message);
    this.name = "AdminCliError";
    this.status = status;
    this.code = code;
    this.hint = hint;
    this.exitCode = exitCode;
  }

  static missingToken(): AdminCliError {
    return new AdminCliError(
      "Admin token is required. Pass --admin-token <jwt> or set NEXUS_ADMIN_TOKEN.",
      null,
      null,
      EXIT_CODES["not-authenticated"],
      // ⚠️ A REMEDY, SO IT IS A HINT. It used to ride inside the message after a
      // `\n  `, which renders identically on a terminal and is why nobody saw
      // it: under `--json` it reached `error.message` as two lines of prose
      // while `error.hint` was `null`, so a script reading the field the
      // envelope reserves for the remedy found nothing there.
      "Grab a Clerk JWT from gpt.nexus DevTools → Network → any request → " +
        "Authorization header (the 'Bearer eyJ...' value)."
    );
  }

  /**
   * ⚠️ THIS EXITED 1 AND NOW EXITS 7. A network failure is retryable and the
   * generic failure is not knowably anything, so a caller backing off on 1 was
   * backing off on every unexpected admin error too.
   */
  static network(reason: string): AdminCliError {
    return new AdminCliError(
      `Could not reach the Nexus admin API: ${reason}`,
      null,
      null,
      EXIT_CODES["connection-failed"]
    );
  }

  static fromStatus(status: number, message: string, code?: string | null): AdminCliError {
    return new AdminCliError(message, status, code ?? null, exitCodeForHttpStatus(status));
  }

  /**
   * CLI-side input validation that refuses to make the HTTP call. It is the
   * `invalid-input` category because semantically it's "invalid request body /
   * arguments" — same
   * shape an operator would get back as a 422 from the server, just
   * detected earlier. The cross-field constraint that drives this today
   * (`--status SUSPENDED` requires a non-empty `--reason`) mirrors the
   * backend's `VibeOrgCostSafetyInvalidStateError → 422` path; surfacing
   * it here saves a network roundtrip on the typo case.
   */
  static localValidation(message: string): AdminCliError {
    return new AdminCliError(message, null, null, EXIT_CODES["invalid-input"]);
  }
}

/** Provenance for an admin failure the CLI decided itself. See `errors.ts`. */
const ADMIN_CLI_CODE = "CLI_ADMIN_ERROR";

/**
 * Print an `AdminCliError` and return its exit code.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 BOTH CHANNELS GO THROUGH `printFailure`. NEITHER IS HAND-ROLLED HERE.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Nine admin commands once failed with nothing on stdout, because this function
 * wrote a red `✗` line to stderr and returned — right for a terminal and wrong
 * under `--json`, where the root epilogue promises the failure IS a document on
 * stdout. That was repaired by branching on `isJsonMode()` and calling
 * `printFailure` on one arm only, which left the HUMAN arm hand-rolled and
 * disagreeing with `printCliError` three ways at once:
 *
 *   · it dropped the `code` it had just computed, so an operator pasting
 *     terminal output into a bug report brought no machine-readable cause —
 *     the very defect `errors.ts` records eleven workflow codes dying of;
 *   · it had nowhere to put a hint, so `missingToken`'s remedy lived inside the
 *     message;
 *   · it wrote `\x1b[31m` directly, going around the `NO_COLOR` guard that every
 *     other line in this package respects, so `NO_COLOR=1 nexus admin … 2> log`
 *     put escape bytes in the log.
 *
 * There is no branch now. `printFailure` → `printCliError` is the ONE renderer,
 * so the admin tree's human channel says exactly what the resource tree's says
 * and cannot drift from it again.
 *
 * ⚠️ THE EXIT CODE IS NOT THIS FUNCTION'S TO INVENT. It comes off the error,
 * which got it from `src/exit-codes.ts`. `printFailure` exists precisely so a
 * caller can have the document without having the verdict — the resource tree's
 * `refuse` and `reportFailure` decide their own code, this tree carries one.
 */
export function handleAdminError(err: unknown): number {
  const write = (message: string, code: string, exitCode: number, hint?: string): number => {
    printFailure(message, code, hint);
    return exitCode;
  };

  if (err instanceof AdminCliError) {
    const prefix = err.status ? `Admin API error (${err.status}): ` : "";
    return write(
      `${prefix}${err.message}`,
      err.code ?? ADMIN_CLI_CODE,
      err.exitCode,
      err.hint ?? undefined
    );
  }
  if (err instanceof Error) return write(err.message, ADMIN_CLI_CODE, EXIT_CODES.failed);
  return write(String(err), ADMIN_CLI_CODE, EXIT_CODES.failed);
}
