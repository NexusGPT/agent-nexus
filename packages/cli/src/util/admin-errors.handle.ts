import { printFailure } from "../errors";
import { EXIT_CODES } from "../exit-codes";
import { AdminCliError } from "./admin-errors.cli-error";

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
