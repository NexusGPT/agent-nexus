import { CLI_CODES } from "./errors-cli-codes";
import { printCliError } from "./errors-document";
import {
  FAILURE_CAUSE_CODES,
  FAILURE_CAUSE_EXIT_CATEGORIES,
  type FailureCause
} from "./errors-failure-cause";
import { CategorizedCliError, EXIT_CODES } from "./exit-codes";

/**
 * A command REFUSES its own input, on both channels, with one exit code.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 `console.error(…); process.exitCode = 1; return;` LEAVES STDOUT EMPTY.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * That three-line shape appears in 52 command actions and it is the second half
 * of the same defect `installArgumentRefusalReporting` closes: the caller gets
 * exit 1 and NOTHING to parse, on the flag whose whole promise is that a failure
 * is a document. Commander's own refusals now have a funnel; a hand-rolled one
 * has this verb.
 *
 * It is deliberately NOT a new envelope — it emits the same
 * `{"error":{"message","hint","code"}}` every other failure emits, so a script
 * still has exactly one error shape and never needs a presence check.
 *
 * @returns the `invalid-input` exit code — assign it to `process.exitCode`, like
 * `handleError` (in `errors-handle.ts`) and {@link printNotFound}. It returned
 * `1` until the taxonomy existed; see `src/exit-codes.ts`.
 */
export function refuse(message: string, hint?: string): number {
  printCliError(message, hint, CLI_CODES.INVALID_ARGUMENTS);
  return EXIT_CODES["invalid-input"];
}

/**
 * A failure that happened AFTER the invocation was accepted. The cause is
 * REQUIRED and is a closed union — see {@link FailureCause} for why.
 *
 * Two functions rather than one with a `code` argument, deliberately. A single
 * `refuse(message, hint, code)` still asks every author to decide, and says
 * nothing about there being two CATEGORIES to decide between — the decision
 * disappears into a third positional argument that is easy to omit and was
 * omitted 30 times. Two names put the category in the VERB, where a reader of
 * the call site sees it without opening this file, and `refuse` having no code
 * parameter at all means the wrong label is not a mistake anyone can make.
 *
 * @returns the exit code for `cause` — assign it to `process.exitCode`. The
 * cause the caller already had to name IS the exit category, so the 40 call
 * sites that adopted this verb got a specific exit code for free, and none of
 * them had to be edited to get it.
 */
export function reportFailure(cause: FailureCause, message: string, hint?: string): number {
  printCliError(message, hint, FAILURE_CAUSE_CODES[cause]);
  return EXIT_CODES[FAILURE_CAUSE_EXIT_CATEGORIES[cause]];
}

/**
 * The THROWN form of {@link reportFailure}, for a helper deep inside a command
 * that has to unwind before the document is printed: `handleError` catches it
 * and prints the same document with the same exit code. The cause picks both
 * the code and the category, so a throw site cannot pair a `local-failed`
 * code with an `invalid-input` exit.
 */
export function failure(cause: FailureCause, message: string, hint?: string): CategorizedCliError {
  return new CategorizedCliError(
    FAILURE_CAUSE_EXIT_CATEGORIES[cause],
    FAILURE_CAUSE_CODES[cause],
    message,
    hint
  );
}

/** The thrown form of {@link refuse}: the caller's own input is wrong, exit `invalid-input`. */
export function invalidInput(message: string, hint?: string): CategorizedCliError {
  return new CategorizedCliError("invalid-input", CLI_CODES.INVALID_ARGUMENTS, message, hint);
}

/**
 * Report "the thing you asked for does not exist" and return the exit code.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 A NOT-FOUND THE SERVER ANSWERS 200 IS STILL A FAILURE, AND `console.log`
 *    TURNS IT INTO A SUCCESS ON BOTH CHANNELS AT ONCE.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `handleError` in `errors-handle.ts` covers a not-found the API RAISES — a 404 becomes a
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
 *   - FAILURE — a failure exits NON-ZERO. It exited 0, so a shell script's `if`
 *     takes the success branch on a customer that does not exist.
 *
 * Together those make a miss INDISTINGUISHABLE from a hit by output shape AND by
 * status — the one combination no caller can work around.
 *
 * Use this instead of a bare `console.log` wherever a 2xx can mean absent. It
 * emits the SAME `{"error":{"message","hint","code"}}` document as every other
 * failure — all three keys always present — so a script has exactly one error
 * shape to handle and never needs a presence check.
 * {@link import("./errors-document").CliErrorDocument} owns that contract and
 * the reasoning behind each key being required.
 *
 * The code defaults to `CLI_NOT_FOUND` because the failure is the CLI's reading
 * of a 2xx, not something the server said. Pass an API code instead when the
 * response genuinely carried one.
 *
 * @returns the `not-found` exit code — assign it to `process.exitCode` like
 * `handleError`.
 */
export function printNotFound(
  message: string,
  hint?: string,
  code: string = CLI_CODES.NOT_FOUND
): number {
  printCliError(message, hint, code);
  return EXIT_CODES["not-found"];
}
