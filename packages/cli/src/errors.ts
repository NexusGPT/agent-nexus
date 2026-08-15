import {
  NexusApiError,
  NexusAuthenticationError,
  NexusConnectionError,
  NexusError,
  NexusTimeoutError
} from "@agent-nexus/sdk";
import type { Command } from "commander";

import { color, emitDocument, isJsonMode } from "./output";

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
  NOT_FOUND: "CLI_NOT_FOUND",
  /**
   * The invocation was refused before anything was sent — a missing required
   * option, an unknown flag, a value outside a `.choices()` set, a bad
   * positional. See {@link CliArgumentError} and {@link refuse}.
   */
  INVALID_ARGUMENTS: "CLI_INVALID_ARGUMENTS",
  /** No usable credential, or the credential was rejected. Run `auth login`. */
  NOT_AUTHENTICATED: "CLI_NOT_AUTHENTICATED",
  /**
   * The request COMPLETED and the answer reports a failure carrying no API code
   * of its own — a non-2xx from a raw `fetch`, or a 2xx whose body says it
   * failed. Distinct from {@link CLI_CODES.CONNECTION_FAILED}, which is
   * retryable, and from {@link CLI_CODES.SDK_ERROR}, which came through the SDK.
   */
  REMOTE_ERROR: "CLI_REMOTE_ERROR",
  /**
   * A local operation this CLI performed failed — an install, a config write, a
   * file write. Nothing about the caller's input is wrong and no retry against
   * the API will help.
   */
  LOCAL_FAILED: "CLI_LOCAL_FAILED"
} as const;

/**
 * WHY A FAILURE THAT HAPPENED AFTER THE SEND CANNOT USE {@link refuse}.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 A DOCUMENT CARRYING THE WRONG `code` IS WORSE THAN PROSE, BECAUSE PROSE
 *    DOES NOT LIE IN A FIELD A SCRIPT TRUSTS.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `refuse` was written with `code` as an OPTIONAL parameter defaulting to
 * `CLI_INVALID_ARGUMENTS`, and 30 of the 73 call sites that adopted it are
 * failures that happened AFTER the invocation was accepted — a registry that
 * could not be reached, a validation request that answered 500, an `npm install`
 * that failed, a config write that threw. Every one of them told a script "you
 * passed a bad argument". A caller branching on `code` stops retrying a
 * connectivity failure and tells a user to check their flags.
 *
 * That is the same defect this whole change set is about, committed by the fix:
 * the shape was enforced and the claim inside it was false.
 *
 * The vocabulary is a CLOSED UNION rather than a string, so a call site cannot
 * spell one wrong, and `refuse` no longer has a `code` parameter AT ALL — the
 * mislabelling is now unrepresentable rather than reviewed. See
 * {@link reportFailure}.
 */
export type FailureCause =
  /** A named thing does not exist — a profile, an `.nexusrc`, an organization. */
  | "not-found"
  /** No usable credential, or one the server rejected. */
  | "not-authenticated"
  /** The API could not be reached. Retryable. */
  | "connection-failed"
  /**
   * The CLI stopped waiting. The server may still be completing the request.
   *
   * Spelled in the PAST TENSE deliberately: a member named `timeout` is a
   * duration everywhere else in this package, and `timeout-values-carry-their-unit`
   * reads any such identifier as a millisecond slot. Naming the EVENT rather than
   * a length keeps the two vocabularies from colliding.
   */
  | "timed-out"
  /** The request completed and the answer reports a failure. */
  | "remote-error"
  /** A local operation this CLI performed failed — install, config write, spawn. */
  | "local-failed";

const FAILURE_CAUSE_CODES: Readonly<Record<FailureCause, string>> = {
  "not-found": CLI_CODES.NOT_FOUND,
  "not-authenticated": CLI_CODES.NOT_AUTHENTICATED,
  "connection-failed": CLI_CODES.CONNECTION_FAILED,
  "timed-out": CLI_CODES.TIMEOUT,
  "remote-error": CLI_CODES.REMOTE_ERROR,
  "local-failed": CLI_CODES.LOCAL_FAILED
};

/**
 * COMMANDER REFUSED THE INVOCATION, AND IT USED TO DO SO WITHOUT A DOCUMENT.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 THE EPILOGUE'S SECOND `--json` CLAUSE HAD NO FUNNEL AT ALL.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `nexus --help` promises: "Under --json an error is a JSON document on STDOUT:
 * {"error":{"message","hint"}}". Every failure that reached {@link handleError}
 * kept that promise. An argument refusal never reached it — commander writes its
 * own sentence to stderr and calls `process.exit(1)` from inside the parser, so
 * stdout is EMPTY. Measured over every leaf: 41 commands refuse this way, and a
 * caller gets a non-zero exit with nothing to parse and nothing to branch on.
 *
 * `installArgumentRefusalReporting` turns that exit into a throw, and this class
 * is what it throws — a TYPED error, so `handleError` branches on `instanceof`
 * rather than string-matching a message, and carrying the command path so the
 * hint can name the exact `--help` to run.
 *
 * The `code` on the wire is `CLI_INVALID_ARGUMENTS`, never commander's own
 * `commander.missingMandatoryOptionValue`. That is the `CLI_*` provenance rule
 * in {@link CLI_CODES}: the prefix means "this never reached the server", and a
 * refusal at the parse boundary is the purest case of it. Commander's code is
 * kept on the object for a reader, not put on the wire.
 */
export class CliArgumentError extends Error {
  constructor(
    readonly commandPath: string,
    readonly exitCode: number,
    message: string,
    readonly commanderCode: string
  ) {
    super(message);
    this.name = "CliArgumentError";
  }
}

/**
 * Route every commander refusal in the tree through {@link handleError}.
 *
 * ⚠️ IT MUST WALK. `exitOverride()` on the root reaches the root ALONE: commander
 * copies `_exitCallback` into a subcommand when that subcommand is CREATED, and
 * this tree is fully built by the time anyone can call it. So the one-line
 * version of this fix — "add `exitOverride()` to the root" — closes the root's
 * own parse errors and none of the 41 real ones, which all belong to a leaf.
 *
 * ⚠️ AND IT MUST NOT TOUCH exitCode 0. `--help` and `--version` reach the same
 * `_exit`, with exitCode 0. Turning those into errors would make `nexus --help`
 * print an error document and exit 1. The callback returns for them, and
 * commander's own `process.exit(0)` on the next line is the unchanged behaviour.
 *
 * The THROW rather than a print-here is deliberate: commander calls
 * `process.exit(exitCode)` the instant this callback returns, and `process.exit`
 * can truncate a pending `console.log` to a pipe — which is precisely the
 * `nexus … --json | jq` case the document exists for. Throwing hands the failure
 * to `parseAsync`'s rejection, where the entry point sets `process.exitCode` and
 * lets node exit normally, flushing.
 */
export function installArgumentRefusalReporting(
  program: Command,
  options: {
    /**
     * What to do when commander exits SUCCESSFULLY — `--help`, `--version`.
     *
     * `"exit"` is production: the callback returns and commander's own
     * `process.exit(0)` runs, exactly as before this existed. `"throw"` is for a
     * spec, where a real `process.exit` takes the whole test worker with it and
     * reads as a crashed suite rather than as one driven command.
     *
     * ONE installer with a named switch, rather than a second copy in the
     * harness: a gate whose subject is a second implementation of the thing it
     * gates cannot report a drift between them.
     */
    onSuccessfulExit?: "exit" | "throw";
  } = {}
): void {
  const onSuccessfulExit = options.onSuccessfulExit ?? "exit";
  const install = (command: Command, prefix: readonly string[]): void => {
    const path = [...prefix, command.name()];
    command.exitOverride((error) => {
      if (error.exitCode === 0 && onSuccessfulExit === "exit") return;
      throw new CliArgumentError(path.join(" "), error.exitCode, error.message, error.code);
    });
    for (const child of command.commands) install(child, path);
  };
  install(program, []);
}

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
  // First, because it is the only failure that never reached the network and the
  // only one whose remedy is a `--help` the CLI can name exactly.
  if (err instanceof CliArgumentError) {
    printCliError(
      // Commander prefixes its own text with "error: "; the document has a
      // `code` field for that job and the duplication reads badly in JSON.
      err.message.replace(/^error:\s*/, ""),
      `Run "${err.commandPath} --help" for the full usage.`,
      CLI_CODES.INVALID_ARGUMENTS
    );
    return err.exitCode === 0 ? 1 : err.exitCode;
  }

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
/**
 * A command REFUSES its own input, on both channels, with one exit code.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 `console.error(…); process.exitCode = 1; return;` LEAVES STDOUT EMPTY.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * That three-line shape appears in 52 command actions and it is the second half
 * of the same defect {@link installArgumentRefusalReporting} closes: the caller
 * gets exit 1 and NOTHING to parse, on the flag whose whole promise is that a
 * failure is a document. Commander's own refusals now have a funnel; a
 * hand-rolled one has this verb.
 *
 * It is deliberately NOT a new envelope — it emits the same
 * `{"error":{"message","hint","code"}}` every other failure emits, so a script
 * still has exactly one error shape and never needs a presence check.
 *
 * @returns 1, always — assign it to `process.exitCode`, like {@link handleError}
 * and {@link printNotFound}.
 */
export function refuse(message: string, hint?: string): number {
  printCliError(message, hint, CLI_CODES.INVALID_ARGUMENTS);
  return 1;
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
 * @returns 1, always — assign it to `process.exitCode`.
 */
export function reportFailure(cause: FailureCause, message: string, hint?: string): number {
  printCliError(message, hint, FAILURE_CAUSE_CODES[cause]);
  return 1;
}

/**
 * The error document, with NO opinion about the exit code.
 *
 * {@link refuse} and {@link reportFailure} both mean exit 1. The admin tree is
 * the one caller that legitimately owns its exit code — it documents 2/3/4/5/6
 * for auth, permission, not-found, invalid-state and server-error — so it needs
 * the document without the verdict.
 *
 * `code` is REQUIRED here for the same reason `refuse` has none: an optional
 * code is an invitation to ship the default, and the default is a claim.
 */
export function printFailure(message: string, code: string, hint?: string): void {
  printCliError(message, hint, code);
}

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
    // Through the funnel, never a bare console.log. A command that printed a
    // partial result and THEN threw would otherwise put the error document
    // beside it on stdout — two documents, and the pipe is unparseable exactly
    // when the caller most needs to read why. First wins: the payload stays on
    // stdout, the error goes to stderr, and the exit code still says 1.
    emitDocument({ error });
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
