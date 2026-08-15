/**
 * Typed errors for the admin command tree.
 *
 * The admin endpoints don't go through `@agent-nexus/sdk` (different base
 * path + different auth header — see `admin-http.ts`), so the SDK's
 * `NexusApiError` doesn't apply. We carry the HTTP status here so each
 * command can map it to a meaningful exit code.
 *
 * Exit-code contract — match the convention in the mission prompt:
 *   2 — missing / invalid admin token (auth)
 *   3 — permission denied (PBAC)
 *   4 — not found
 *   5 — invalid state / validation (422)
 *   6 — server error / unexpected
 *   1 — fallback (network, malformed envelope, etc.)
 */

import { printFailure } from "../errors";
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
      2
    );
  }

  static network(reason: string): AdminCliError {
    return new AdminCliError(`Could not reach the Nexus admin API: ${reason}`, null, null, 1);
  }

  static fromStatus(status: number, message: string, code?: string | null): AdminCliError {
    return new AdminCliError(message, status, code ?? null, exitCodeFor(status));
  }

  /**
   * CLI-side input validation that refuses to make the HTTP call. Exits 5
   * because semantically it's "invalid request body / arguments" — same
   * shape an operator would get back as a 422 from the server, just
   * detected earlier. The cross-field constraint that drives this today
   * (`--status SUSPENDED` requires a non-empty `--reason`) mirrors the
   * backend's `VibeOrgCostSafetyInvalidStateError → 422` path; surfacing
   * it here saves a network roundtrip on the typo case.
   */
  static localValidation(message: string): AdminCliError {
    return new AdminCliError(message, null, null, 5);
  }
}

function exitCodeFor(status: number): number {
  if (status === 401) return 2;
  if (status === 403) return 3;
  if (status === 404) return 4;
  if (status === 422 || status === 400) return 5;
  if (status >= 500) return 6;
  return 1;
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
 * ⚠️ THE EXIT CODE IS DELIBERATELY UNCHANGED. The admin tree documents 2/3/4/5/6
 * for auth, permission, not-found, invalid-state and server-error, and callers
 * branch on them. The epilogue's "every failure exits 1" is the resource tree's
 * contract; this one predates it and is richer, so only the DOCUMENT is added.
 * `printFailure` exists precisely so a caller can have the document without
 * having the verdict.
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
  if (err instanceof Error) return write(err.message, ADMIN_CLI_CODE, 1);
  return write(String(err), ADMIN_CLI_CODE, 1);
}
