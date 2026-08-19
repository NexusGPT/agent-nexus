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
import { isJsonMode } from "../output";

export class AdminCliError extends Error {
  readonly status: number | null;
  readonly code: string | null;
  readonly exitCode: number;

  private constructor(
    message: string,
    status: number | null,
    code: string | null,
    exitCode: number
  ) {
    super(message);
    this.name = "AdminCliError";
    this.status = status;
    this.code = code;
    this.exitCode = exitCode;
  }

  static missingToken(): AdminCliError {
    return new AdminCliError(
      "Admin token is required. Pass --admin-token <jwt> or set NEXUS_ADMIN_TOKEN.\n" +
        "  Grab a Clerk JWT from gpt.nexus DevTools → Network → any request → " +
        "Authorization header (the 'Bearer eyJ...' value).",
      null,
      null,
      EXIT_CODES["not-authenticated"]
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

/**
 * Print an `AdminCliError` and return its exit code.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 NINE ADMIN COMMANDS FAILED WITH NOTHING ON STDOUT, FROM THIS ONE FUNCTION.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * It wrote a red `✗` line to stderr and returned. That is right for a terminal
 * and wrong under `--json`, where the root epilogue promises the failure IS a
 * document on stdout — so a script driving the admin tree got a non-zero exit
 * and an empty pipe. One function, nine commands: `vibe-build-job fail`,
 * `succeed`, `time-out`, `build-runner tick`, `deployment-runner tick`,
 * `consumption-cap set`, `cost-safety set`, `tenant-cluster disable`,
 * `provision`.
 *
 * ⚠️ THE EXIT CODE IS NOT THIS FUNCTION'S TO INVENT. It comes off the error,
 * which got it from `src/exit-codes.ts`. `printFailure` exists precisely so a
 * caller can have the document without having the verdict — the resource tree's
 * `refuse` and `reportFailure` decide their own code, this tree carries one.
 */
/** Provenance for an admin failure the CLI decided itself. See `errors.ts`. */
const ADMIN_CLI_CODE = "CLI_ADMIN_ERROR";

export function handleAdminError(err: unknown): number {
  const write = (message: string, code: string, exitCode: number): number => {
    if (isJsonMode()) {
      printFailure(message, code);
      return exitCode;
    }
    process.stderr.write(`\x1b[31m✗\x1b[0m ${message}\n`);
    return exitCode;
  };

  if (err instanceof AdminCliError) {
    const prefix = err.status ? `Admin API error (${err.status}): ` : "";
    return write(`${prefix}${err.message}`, err.code ?? ADMIN_CLI_CODE, err.exitCode);
  }
  if (err instanceof Error) return write(err.message, ADMIN_CLI_CODE, EXIT_CODES.failed);
  return write(String(err), ADMIN_CLI_CODE, EXIT_CODES.failed);
}
