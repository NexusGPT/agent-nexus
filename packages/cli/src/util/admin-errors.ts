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

/** Print an `AdminCliError` to stderr and return its exit code. */
export function handleAdminError(err: unknown): number {
  if (err instanceof AdminCliError) {
    const prefix = err.status ? `Admin API error (${err.status}): ` : "";
    process.stderr.write(`\x1b[31m✗\x1b[0m ${prefix}${err.message}\n`);
    return err.exitCode;
  }
  if (err instanceof Error) {
    process.stderr.write(`\x1b[31m✗\x1b[0m ${err.message}\n`);
    return 1;
  }
  process.stderr.write(`\x1b[31m✗\x1b[0m ${String(err)}\n`);
  return 1;
}
