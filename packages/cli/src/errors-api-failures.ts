import type { NexusApiError, NexusAuthenticationError } from "@agent-nexus/sdk";

import { nextStepsFor } from "./error-next-steps";
import { printCliError } from "./errors-document";
import { EXIT_CODES, exitCodeForHttpStatus } from "./exit-codes";

/**
 * 401 codes that are about a CONNECTED PROVIDER, not about the caller's API key.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 `nexus auth login` IS THE WRONG ANSWER FOR EVERY CODE IN THIS SET.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * These come from `documents/domain/errors/auth.errors.ts` and describe a Google
 * Drive / SharePoint / Notion connection whose token expired or was revoked. The
 * caller's Nexus API key is fine. Telling them to re-authenticate the CLI sends
 * them to fix the one credential that was never broken, and when it "does not
 * help" the real cause is still unnamed.
 *
 * This set was unreachable until the SDK stopped flattening every 401 to
 * `UNAUTHORIZED`, which is why the wrong hint went out for every one of them.
 */
const PROVIDER_AUTH_CODES: ReadonlySet<string> = new Set([
  "AUTH_EXPIRED",
  "AUTH_INVALID",
  "REAUTH_REQUIRED"
]);

/**
 * Where a provider connection is repaired.
 *
 * Deliberately NOT a command. `nexus cloud-import providers` says so in its own
 * help — "THIS DOES NOT LIST YOUR CONNECTIONS … Those come from the app" — and
 * no CLI verb reconnects one. Naming a command that does not exist would be a
 * second wrong hint replacing the first.
 */
const PROVIDER_RECONNECT_HINT = [
  "Your API key is fine — this is a connected integration's authorization.",
  'Reconnect that integration in the Nexus dashboard. "nexus auth login" will not fix it.'
].join("\n  ");

/**
 * A 401, reported and priced.
 *
 * Its own function because the branch is a DISPATCH rather than a leaf — the
 * status says 401 and the code says which of two unrelated credentials is at
 * fault — and `handleError` is a dispatcher over error TYPES, not a place to
 * nest a second dispatch over codes.
 */
export function reportAuthenticationError(err: NexusAuthenticationError): number {
  // A 401 is two different failures and the code is the only thing that
  // separates them. NexusAuthenticationError EXTENDS NexusApiError, so it
  // carries the server's own code rather than needing a CLI_* one.
  if (PROVIDER_AUTH_CODES.has(err.code)) {
    printCliError(err.message, PROVIDER_RECONNECT_HINT, err.code);
    return EXIT_CODES["not-authenticated"];
  }
  printCliError(
    "Authentication failed — invalid or missing API key.",
    'Run "nexus auth login" to re-authenticate, or set NEXUS_API_KEY.',
    err.code
  );
  return EXIT_CODES["not-authenticated"];
}

/**
 * Any other failure the API itself reported, with the MESSAGE chosen by status
 * and the EXIT CODE chosen by {@link exitCodeForHttpStatus}.
 *
 * Those two are deliberately not the same `if` chain: the prose is per status
 * because a reader needs different words, and the number is one rule for the
 * whole binary. Keeping them in one function is what makes the pairing visible.
 */
export function reportApiError(err: NexusApiError): number {
  if (err.status === 404) {
    printCliError(
      `Not found: ${err.message}`,
      // A 404 the API can explain gets the explanation. The generic line is
      // the fallback it always was — it names no real command, so a code that
      // CAN name one must outrank it: a "not found" that is really "wrong id
      // space" sends the reader to re-list the resource they already listed.
      nextStepsFor(err) ?? 'Run "nexus <resource> list" to see available resources.',
      err.code
    );
  } else if (err.status === 422 || err.code === "VALIDATION_ERROR") {
    printCliError(
      `Validation error: ${err.message}`,
      err.details ? `Details: ${JSON.stringify(err.details)}` : undefined,
      err.code
    );
  } else if (err.status === 409) {
    printCliError(
      `Conflict: ${err.message}`,
      nextStepsFor(err) ?? (err.details ? `Details: ${JSON.stringify(err.details)}` : undefined),
      err.code
    );
  } else {
    printCliError(`API error (${err.status}): ${err.message}`, undefined, err.code);
  }
  // One rule for the whole binary, and the admin tree calls the same function.
  // Every branch above is a status this covers, so the mapping cannot disagree
  // with the message printed beside it.
  return exitCodeForHttpStatus(err.status);
}
