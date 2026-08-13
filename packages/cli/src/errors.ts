import {
  NexusApiError,
  NexusAuthenticationError,
  NexusConnectionError,
  NexusError,
  NexusTimeoutError
} from "@agent-nexus/sdk";

import { color, isJsonMode } from "./output";

/**
 * Handle errors from SDK calls and print actionable messages.
 * Returns the exit code to use.
 */
/**
 * What the CLI can offer for a specific API error code.
 *
 * The API's message names the CONDITION in surface-neutral terms, because the
 * console renders the very same string — a message that said "run nexus ..."
 * would name a control a browser user does not have. The command that resolves
 * it therefore belongs here, on the surface that knows the reader is in a
 * terminal. Keyed by the error CODE, never by message text, so rewording the
 * API's prose cannot silently drop the next step.
 */
const NEXT_STEPS_BY_CODE: Record<string, string> = {
  // The org has no dedicated cluster (or its cluster cannot host code). Two
  // ways forward, and the second is the one nobody guesses: a project that
  // carries its own remote is cloned straight from there by the build and
  // never needs a cluster at all.
  VIBE_GIT_PROJECT_CLUSTER_NOT_READY: [
    "Provision your cluster (EU regions, immutable once set):",
    "  nexus vibe cluster provision --region eu-west-3",
    "  nexus vibe cluster status",
    "",
    "Or host the code yourself — no cluster needed, the build clones your remote:",
    "  nexus vibe app provision-repo <appId> --git-url https://github.com/acme/svc.git"
  ].join("\n")
};

/**
 * The CLI-actionable next step for an API error, or null when we have nothing
 * better to say than the API already did. A code the API sends but this table
 * does not know is not an error — the caller still gets the API's message.
 */
function nextStepsFor(err: NexusApiError): string | null {
  return NEXT_STEPS_BY_CODE[err.code] ?? null;
}

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
 * Codes the CLI mints for failures that never reached the API.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 `CLI_*` MEANS "THIS NEVER REACHED THE SERVER". EVERY OTHER CODE CAME FROM IT.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The prefix is the whole provenance rule, and it is what lets `code` be REQUIRED
 * without lying. An API code is passed through verbatim; anything the CLI decided
 * on its own is named here. A reader branching on `code` can therefore tell "the
 * server refused this" from "we never got there" without a second field, and a
 * future server-side code can never collide with one of these.
 */
const CLI_CODES = {
  /** The CLI stopped waiting. The server may still be completing the request. */
  TIMEOUT: "CLI_TIMEOUT",
  /** The API was unreachable — DNS, TLS, socket, offline. */
  CONNECTION_FAILED: "CLI_CONNECTION_FAILED",
  /** An SDK-level failure carrying no API code. */
  SDK_ERROR: "CLI_SDK_ERROR",
  /** Anything else that escaped to the top of a command. */
  UNKNOWN: "CLI_UNKNOWN_ERROR",
  /** A 2xx that means "absent" — see {@link printNotFound}. */
  NOT_FOUND: "CLI_NOT_FOUND"
} as const;

/**
 * The error document, and it is ONE shape with THREE always-present keys.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 EVERY KEY IS REQUIRED. AN OPTIONAL KEY IS A SECOND SHAPE WEARING ONE NAME.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `code` could have been optional — most failures are `NexusApiError`s, which
 * always carry one. It is required instead because every branch of
 * {@link handleError} can derive one, and a field that is present for some
 * failures and absent for others forces every consumer to write a presence check
 * before it can branch. That is two shapes with one name, which is exactly what
 * the "one error shape" guarantee exists to prevent. A code is always derivable,
 * so it is always there.
 *
 * `hint` is required for the same reason, and it is a CORRECTION: it used to be
 * `string | undefined`, and `JSON.stringify` OMITS an undefined key — so the
 * document really was two shapes already, `{message,hint}` and `{message}`,
 * while the comment here claimed one. It is now `string | null`: the key is
 * always present, the value is `null` when there is no hint. A consumer reading
 * `.hint` for truthiness is unaffected; only `"hint" in err` changes, and it
 * changes to the answer that was always intended.
 *
 * So a consumer needs no presence check on any field, and `--json` failures are
 * parseable with one fixed schema.
 */
interface CliErrorDocument {
  readonly message: string;
  readonly hint: string | null;
  readonly code: string;
}

export function handleError(err: unknown): number {
  if (err instanceof NexusAuthenticationError) {
    // A 401 is two different failures and the code is the only thing that
    // separates them. NexusAuthenticationError EXTENDS NexusApiError, so it
    // carries the server's own code rather than needing a CLI_* one.
    if (PROVIDER_AUTH_CODES.has(err.code)) {
      printCliError(err.message, PROVIDER_RECONNECT_HINT, err.code);
      return 1;
    }
    printCliError(
      "Authentication failed — invalid or missing API key.",
      'Run "nexus auth login" to re-authenticate, or set NEXUS_API_KEY.',
      err.code
    );
    return 1;
  }

  if (err instanceof NexusApiError) {
    if (err.status === 404) {
      printCliError(
        `Not found: ${err.message}`,
        'Run "nexus <resource> list" to see available resources.',
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
    return 1;
  }

  // Before NexusConnectionError — a timeout IS a connection error in the SDK's
  // hierarchy, but "we stopped waiting" must not read as "the API was down":
  // the server may still be processing (and completing) the request.
  if (err instanceof NexusTimeoutError) {
    const seconds = Math.round(err.timeoutMs / 1000);
    printCliError(
      `The request was still running after ${seconds}s, so the CLI stopped waiting (client-side timeout — the server may still complete it).`,
      "For long-running operations, raise the limit with the global --timeout <seconds> flag.",
      CLI_CODES.TIMEOUT
    );
    return 1;
  }

  if (err instanceof NexusConnectionError) {
    printCliError(
      "Could not reach the Nexus API.",
      "Check your network connection and base URL configuration.",
      CLI_CODES.CONNECTION_FAILED
    );
    return 1;
  }

  if (err instanceof NexusError) {
    printCliError(err.message, undefined, CLI_CODES.SDK_ERROR);
    return 1;
  }

  if (err instanceof Error) {
    printCliError(err.message, undefined, CLI_CODES.UNKNOWN);
    return 1;
  }

  printCliError(String(err), undefined, CLI_CODES.UNKNOWN);
  return 1;
}

/**
 * Report "the thing you asked for does not exist" and return the exit code.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 A NOT-FOUND THE SERVER ANSWERS 200 IS STILL A FAILURE, AND `console.log`
 *    TURNS IT INTO A SUCCESS ON BOTH CHANNELS AT ONCE.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * {@link handleError} covers a not-found the API RAISES — a 404 becomes a
 * `NexusApiError` and exits 1. It cannot cover the other shape: an endpoint that
 * answers 200 with an empty body, where "absent" is a value the command has to
 * recognise itself. `customer get-by-external-id` did that with
 * `console.log("No customer found."); return`, which breaks BOTH top-level
 * guarantees in one line:
 *
 *   - READING THE OUTPUT — "--json prints ONE JSON document on STDOUT and
 *     nothing else". It printed English prose on stdout instead, so `jq` on the
 *     documented pipeline fails to parse and the caller cannot tell a broken CLI
 *     from a missing customer.
 *   - FAILURE — "EVERY failure exits 1". It exited 0, so a shell script's `if`
 *     takes the success branch on a customer that does not exist.
 *
 * Together those make a miss INDISTINGUISHABLE from a hit by output shape AND by
 * status — the one combination no caller can work around.
 *
 * Use this instead of a bare `console.log` wherever a 2xx can mean absent. It
 * emits the SAME `{"error":{"message","hint","code"}}` document as every other
 * failure — all three keys always present — so a script has exactly one error
 * shape to handle and never needs a presence check. {@link CliErrorDocument} owns
 * that contract and the reasoning behind each key being required.
 *
 * The code defaults to `CLI_NOT_FOUND` because the failure is the CLI's reading
 * of a 2xx, not something the server said. Pass an API code instead when the
 * response genuinely carried one.
 *
 * @returns 1, always — assign it to `process.exitCode` like {@link handleError}.
 */
export function printNotFound(
  message: string,
  hint?: string,
  code: string = CLI_CODES.NOT_FOUND
): number {
  printCliError(message, hint, code);
  return 1;
}

function printCliError(message: string, hint?: string, code: string = CLI_CODES.UNKNOWN): void {
  if (isJsonMode()) {
    const error: CliErrorDocument = { message, hint: hint ?? null, code };
    console.log(JSON.stringify({ error }, null, 2));
    return;
  }

  // The human channel gets the code too — dim and trailing, so it never competes
  // with the message, but a user pasting terminal output into a bug report brings
  // the machine-readable cause with them. Eleven documented workflow codes were
  // reaching this function and dying here, on BOTH channels.
  console.error(color.red("Error:") + " " + message + " " + color.dim(`[${code}]`));
  if (hint) {
    console.error(color.dim("  " + hint));
  }
}
