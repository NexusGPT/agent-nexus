import {
  NexusApiError,
  NexusAuthenticationError,
  NexusConnectionError,
  NexusError,
  NexusTimeoutError
} from "@agent-nexus/sdk";

import { CliArgumentError } from "./cli-argument-error";
import { reportApiError, reportAuthenticationError } from "./errors-api-failures";
import { CLI_CODES } from "./errors-cli-codes";
import { printCliError } from "./errors-document";
import { CategorizedCliError, EXIT_CODES } from "./exit-codes";

/**
 * The sentence a refused invocation puts on the wire.
 *
 * ⚠️ ONE COMMANDER REFUSAL CARRIES NO SENTENCE AT ALL, AND IT IS THE ONE A BARE
 * `nexus --json` PRODUCES. Commander answers "no command was given" by calling
 * `help({ error: true })`, which writes the help screen to stderr and exits with
 * the literal marker `(outputHelp)` as its message — an internal token, not
 * prose. As stderr text beside a printed help screen that was merely useless; in
 * a document a machine parses it is a `message` field that says nothing, on the
 * one failure whose remedy is the most obvious in the CLI.
 *
 * Keyed on commander's own `code` rather than on the marker string, so a change
 * to that token cannot silently reinstate it.
 *
 * ⚠️ AND THAT CODE COVERS TWO DIFFERENT SENTENCES. Commander raises it for a
 * bare `nexus` AND for a namespace run without a leaf (`nexus agent`), so a
 * single "No command given." denies a command the caller plainly supplied and
 * contradicts the hint printed beside it, which names that namespace's help.
 * The path is the discriminator and it is already on the error: the walk in
 * `installArgumentRefusalReporting` builds it from the tree, so a path carrying
 * a space IS a namespace. Derived rather than compared against a literal
 * "nexus", which would be a second declaration of the program's name.
 */
function messageForRefusal(err: CliArgumentError): string {
  if (err.commanderCode === "commander.help") {
    return err.commandPath.includes(" ")
      ? `No subcommand given for "${err.commandPath}".`
      : "No command given.";
  }
  return err.message.replace(/^error:\s*/, "");
}

/**
 * Handle errors from SDK calls and print actionable messages.
 * Returns the exit code to use.
 *
 * A DISPATCH OVER ERROR TYPES, and nothing else. The two branches that needed a
 * second dispatch of their own — a 401, which is two unrelated credentials, and
 * any other API status, where the prose is per status and the number is one rule
 * — are `reportAuthenticationError` and `reportApiError` in
 * `errors-api-failures.ts`. Order is load-bearing throughout: every `instanceof`
 * below sits above the SDK class it extends.
 */
export function handleError(err: unknown): number {
  // First, because it is the only failure that never reached the network and the
  // only one whose remedy is a `--help` the CLI can name exactly.
  if (err instanceof CliArgumentError) {
    printCliError(
      // Commander prefixes its own text with "error: "; the document has a
      // `code` field for that job and the duplication reads badly in JSON.
      messageForRefusal(err),
      `Run "${err.commandPath} --help" for the full usage.`,
      CLI_CODES.INVALID_ARGUMENTS
    );
    // `err.exitCode` is COMMANDER's, and commander has no taxonomy — every
    // refusal is its `1` and a `--help` is its `0`. Forwarding it said "generic
    // failure" about the one failure whose category is never in doubt: the
    // invocation was refused before anything was sent.
    return EXIT_CODES["invalid-input"];
  }

  // A throw site that already knows its own category — see `CategorizedCliError`.
  if (err instanceof CategorizedCliError) {
    printCliError(err.message, err.hint ?? undefined, err.code);
    return err.exitCode;
  }

  // Above NexusApiError, which it extends: the code, not the status, decides
  // which of two credentials the reader has to go and fix.
  if (err instanceof NexusAuthenticationError) return reportAuthenticationError(err);

  if (err instanceof NexusApiError) return reportApiError(err);

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
    return EXIT_CODES["timed-out"];
  }

  if (err instanceof NexusConnectionError) {
    printCliError(
      "Could not reach the Nexus API.",
      "Check your network connection and base URL configuration.",
      CLI_CODES.CONNECTION_FAILED
    );
    return EXIT_CODES["connection-failed"];
  }

  // An SDK failure carrying no status and no category of its own. `failed` is
  // the honest answer here, and it is the LAST place in this function where it
  // is — every branch above knows what happened.
  if (err instanceof NexusError) {
    printCliError(err.message, undefined, CLI_CODES.SDK_ERROR);
    return EXIT_CODES.failed;
  }

  if (err instanceof Error) {
    printCliError(err.message, undefined, CLI_CODES.UNKNOWN);
    return EXIT_CODES.failed;
  }

  printCliError(String(err), undefined, CLI_CODES.UNKNOWN);
  return EXIT_CODES.failed;
}
