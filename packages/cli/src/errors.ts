import {
  NexusApiError,
  NexusAuthenticationError,
  NexusConnectionError,
  NexusError,
  NexusTimeoutError
} from "@agent-nexus/sdk";
import type { Command } from "commander";

import {
  CategorizedCliError,
  EXIT_CODES,
  type ExitCategory,
  exitCodeForHttpStatus
} from "./exit-codes";
import { argvRequestsJson } from "./json-terminal-contract";
import { color, emitDocument, isJsonMode, setJsonMode } from "./output";

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
  ].join("\n"),

  // The id names a real connected account under its OTHER name. Two commands
  // print an `ID` column for one account — "tool credentials" the tool-scoped
  // `ToolCredentials.id`, "credential list" the unified `Credential.id` — both
  // UUIDs, and neither namespace accepts the other's. The API's message already
  // names the unified id; what belongs here is the reason the two exist and
  // which command prints which, because a bare 404 on the pre-delete check
  // "credential delete --help" mandates otherwise reads as "already deleted".
  // Continuation lines carry their own two spaces: `printCliError` indents the
  // FIRST line of a hint and no others, so a multi-line block that does not
  // indent itself renders ragged against the message above it.
  CREDENTIAL_ID_IS_TOOL_SCOPED: [
    'That id is the one "nexus tool credentials <tool-id>" prints. It is TOOL-SCOPED,',
    '  and only "nexus tool delete-credential" takes it.',
    "",
    "  A refusal here is NOT proof the credential is gone — the same account is",
    "  alive under the unified id the message above names.",
    "",
    '  "credential" and "access-card" take that unified id. List them with:',
    "    nexus credential list"
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
  LOCAL_FAILED: "CLI_LOCAL_FAILED",
  /**
   * A global install SUCCEEDED and the shell still resolves a different copy.
   *
   * Deliberately not {@link CLI_CODES.LOCAL_FAILED}: nothing failed. The bytes
   * are on disk exactly where the package manager was asked to put them, and
   * the machine changed. What did not happen is the OUTCOME the caller wanted,
   * and the remedy is a PATH edit rather than a retry — the opposite advice a
   * `LOCAL_FAILED` reader would follow.
   */
  UPGRADE_NOT_RESOLVED: "CLI_UPGRADE_NOT_RESOLVED",
  UPGRADE_NOT_VERIFIED_FOR_YOU: "CLI_UPGRADE_NOT_VERIFIED_FOR_YOU"
} as const;

/**
 * The one code with no {@link FailureCause}, because it owns its own exit code.
 *
 * Every `FailureCause` maps through {@link reportFailure}, which returns 1 —
 * correct for all six, and wrong for this one. `nexus upgrade` documents exit 2
 * for "installed but not resolved" precisely so a caller can tell it apart from
 * "nothing changed", so it goes through {@link printFailure}, which emits the
 * same document and leaves the verdict to the caller.
 */
export const CLI_UPGRADE_NOT_RESOLVED = CLI_CODES.UPGRADE_NOT_RESOLVED;

/**
 * The upgrade installed and could not be checked for the invoking user.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 IT IS A SEPARATE CODE BECAUSE THE EXIT CODE IS SEPARATE, AND SHARING ONE
 *    UNDOES THE WHOLE POINT OF SPLITTING THE OTHER.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `nexus upgrade` exits 3 rather than 2 under `sudo` so a caller can tell an
 * ABSENT measurement from a PATH FINDING. Stamping
 * {@link CLI_UPGRADE_NOT_RESOLVED} on that document hands the `--json` consumer
 * the opposite instruction: that code means "your shell resolves a different
 * copy", whose remedy is a PATH edit — the exact misdiagnosis exit 3 exists to
 * avoid. The two channels would then disagree about the same event, and the
 * machine-readable one would be the wrong half.
 *
 * Same reasoning as the code above: no {@link FailureCause}, because it owns its
 * own exit code and goes through {@link printFailure}.
 */
export const CLI_UPGRADE_NOT_VERIFIED_FOR_YOU = CLI_CODES.UPGRADE_NOT_VERIFIED_FOR_YOU;

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
 * THE SAME SIX CAUSES, AS EXIT CODES. The vocabulary is declared once and read
 * twice — once for the document's `code`, once for the process's status.
 *
 * Written as a `Record<FailureCause, …>` so adding a cause is a compile error
 * here until it has an exit category. A `?? failed` default would let a new
 * cause ship as a generic `1` with nothing to notice it, which is the exact
 * shape of the defect this whole file is undoing.
 */
const FAILURE_CAUSE_EXIT_CATEGORIES: Readonly<Record<FailureCause, ExitCategory>> = {
  "not-found": "not-found",
  "not-authenticated": "not-authenticated",
  "connection-failed": "connection-failed",
  "timed-out": "timed-out",
  "remote-error": "remote-error",
  "local-failed": "local-failed"
};

/**
 * COMMANDER REFUSED THE INVOCATION, AND IT USED TO DO SO WITHOUT A DOCUMENT.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 THE EPILOGUE'S SECOND `--json` CLAUSE HAD NO FUNNEL AT ALL.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `nexus --help` promises: "Under --json an error is a JSON document on STDOUT:
 * {"error":{"message","hint","code"}}". Every failure that reached {@link handleError}
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
/**
 * The argv commander was handed, read back off the command it was handed to.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 `process.argv` IS THE WRONG SOURCE, AND CHOOSING IT IS HOW THIS DEFECT
 *    SURVIVES ITS OWN FIX.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The binary parses `process.argv`, so reading it here would look correct and
 * would be correct in production. Every gate that drives this CLI in-process
 * calls `program.parseAsync(["node", "nexus", "--json", …])` instead, and that
 * argv is nowhere near `process.argv` — so a `process.argv` read is invisible to
 * the one instrument that would notice it breaking. Commander records what it
 * was actually given, on the command `parse` was called on, and that is the same
 * fact in both worlds.
 *
 * ⚠️ `rawArgs` IS NOT IN COMMANDER'S TYPINGS (13.1.0), which is why this is an
 * assertion rather than a property access. It is set in `_prepareUserArgs`
 * before any option is looked at, so it is populated at every refusal — and it
 * is set on the ENTRY command only, never on a subcommand, which is why the
 * caller passes the root rather than the refusing leaf. If a commander upgrade
 * ever renames it this returns `[]` and the fix silently stops working, so
 * `json-refusal-above-the-hook-chain.test.ts` drives the real program and
 * asserts the document — a red there is the signal, not a missing field.
 */
function argvUnderParse(program: Command): readonly string[] {
  const recorded: unknown = (program as Command & { rawArgs?: unknown }).rawArgs;
  if (!Array.isArray(recorded)) return [];
  const values: unknown[] = recorded;
  return values.filter((value): value is string => typeof value === "string");
}

/**
 * Did this invocation ask for JSON, as commander itself received it?
 *
 * ONE reading of that fact, shared with `json-terminal-contract.ts` rather than
 * spelled twice. Two membership tests over the same tokens are two things to
 * drift, and they would drift in silence: a disagreement is only observable on
 * an invocation neither file happens to have a case for.
 *
 * {@link argvRequestsJson} carries why it reads RAW tokens rather than
 * commander's parsed value, and which over-reach is deliberate.
 */
function jsonRequested(program: Command): boolean {
  return argvRequestsJson(argvUnderParse(program));
}

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
      // 🚨 THE PROCESS DOES NOT YET KNOW IT IS IN JSON MODE, AND THIS IS THE
      // LAST INSTANT ANYTHING CAN TELL IT.
      //
      // `--json` is read in the root's `preAction` hook, and commander refuses
      // an invalid invocation ABOVE the hook chain — so a refusal reached
      // `handleError` with `isJsonMode()` false and `printCliError` wrote PROSE
      // to stderr with nothing on stdout. The document the root epilogue
      // promises ("Under --json an error is a JSON document on STDOUT") was
      // therefore absent for every refusal commander decides itself: a missing
      // required argument, an unknown command, an unknown option, a value
      // outside a `.choices()` set, too many arguments, and a root option whose
      // value parser throws. Measured on the shipped binary: exit 1, ZERO bytes
      // on stdout.
      //
      // Setting it here rather than earlier is what makes ONE mechanism cover
      // all six: every one of those paths reaches commander's `_exit`, and this
      // callback is it. The exit CODE is untouched — `handleError` still returns
      // `error.exitCode`, and a successful exit (`--help`, `--version`) returns
      // above without reaching this line.
      if (!isJsonMode() && jsonRequested(program)) setJsonMode(true);
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
 * {@link installArgumentRefusalReporting} builds it from the tree, so a path
 * carrying a space IS a namespace. Derived rather than compared against a
 * literal "nexus", which would be a second declaration of the program's name.
 */
function messageForRefusal(err: CliArgumentError): string {
  if (err.commanderCode === "commander.help") {
    return err.commandPath.includes(" ")
      ? `No subcommand given for "${err.commandPath}".`
      : "No command given.";
  }
  return err.message.replace(/^error:\s*/, "");
}

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

  if (err instanceof NexusAuthenticationError) {
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

  if (err instanceof NexusApiError) {
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
 *   - FAILURE — a failure exits NON-ZERO. It exited 0, so a shell script's `if`
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
 * @returns the `not-found` exit code — assign it to `process.exitCode` like
 * {@link handleError}.
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
 * @returns the `invalid-input` exit code — assign it to `process.exitCode`, like
 * {@link handleError} and {@link printNotFound}. It returned `1` until the
 * taxonomy existed; see `src/exit-codes.ts`.
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
 * The error document, with NO opinion about the exit code.
 *
 * {@link refuse} and {@link reportFailure} each decide their own exit code from
 * `src/exit-codes.ts`. The admin tree carries its code on the ERROR instead —
 * `AdminCliError.exitCode`, from the same taxonomy — so it needs the document
 * without the verdict.
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
  return EXIT_CODES["not-found"];
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
