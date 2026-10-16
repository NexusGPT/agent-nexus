import { EXIT_CODES, exitCodeForHttpStatus } from "../exit-codes";

/**
 * The typed error the admin command tree throws.
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
 *
 * The RENDERER is `admin-errors.handle.ts`, deliberately apart: an error class
 * that imports a printer is an error class that cannot be constructed in a
 * context with no output channel, and the two have different reasons to change.
 */
export class AdminCliError extends Error {
  readonly status: number | null;
  readonly code: string | null;
  /** The remedy, carried in its OWN field. See `handleAdminError`. */
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
   *
   * 🔴 NOT THE DEADLINE CASE — {@link timedOut} is, and it exits 8.
   */
  static network(reason: string): AdminCliError {
    return new AdminCliError(
      `Could not reach the Nexus admin API: ${reason}`,
      null,
      null,
      EXIT_CODES["connection-failed"]
    );
  }

  /**
   * 🚨 THE CLI STOPPED WAITING — 8, WHERE THIS USED TO GO OUT AS {@link network}'s
   * 7. A deadline is not an unreachable host: 7 says the request never arrived and
   * is free to re-send, and every non-GET through `adminRequest` is a WRITE that
   * may have landed. `exit-codes.ts` owns both meanings and the resource tree
   * already exits 8 here, so this is the admin tree agreeing rather than a new
   * rule. The hint says LOOK rather than proposing a retry.
   */
  static timedOut(reason: string): AdminCliError {
    return new AdminCliError(
      `The Nexus admin API did not answer in time: ${reason}`,
      null,
      null,
      EXIT_CODES["timed-out"],
      "The request may still have been applied. Read the current state back " +
        "before retrying a write, and raise the budget with --timeout <seconds>."
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
