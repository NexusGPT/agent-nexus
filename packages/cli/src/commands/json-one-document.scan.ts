/**
 * THE ONE-DOCUMENT SCAN — drive every leaf under `--json` and parse its stdout.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE INVARIANT, AND THE ONE SHAPE THAT IS EXEMPT FROM IT
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Under `--json` a command's stdout is ONE parseable JSON document PER TERMINAL
 * RESULT. The root epilogue has promised the first half since NEX-2176 —
 * "--json prints ONE JSON document on STDOUT and nothing else" — and nothing
 * checked it, so 24 commands broke it while the sentence stayed in every
 * `--help`.
 *
 * "Per terminal result" is not a softening. Two commands legitimately produce
 * many values and neither is a defect: `vibe app logs --follow` emits NDJSON
 * because an array's closing bracket only exists once the stream ends, and a
 * follow does not end; `execution follow` polls and prints per-node progress
 * until the run terminates. A rule that called those violations would be
 * describing a CLI nobody wants. So a streaming command DECLARES itself in
 * {@link STREAMING_LEAVES}, and that list is asserted NON-EMPTY and SMALL by the
 * gate — an exemption nobody can grow quietly is the only kind worth having.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THE POPULATION IS DERIVED AND THE OUTCOME HAS THREE STATES
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The population is `deriveCommandLeaves()` — the same walk `command-universe`
 * hands the classification gate and the docs generator. A hand-written list of
 * commands beside an evolving CLI goes stale in silence, and a gate over a stale
 * list reads exactly like a gate over a complete one.
 *
 * The outcome is NOT a boolean. A command that never reached a printer produced
 * an empty stdout, and an empty stdout parses no worse than a good document —
 * it just fails `JSON.parse` differently, or not at all. Reporting that as
 * "clean" is how an instrument that read nothing wears a clean result. So each
 * run lands in exactly one {@link Outcome}, and `clean` is reserved for a run
 * that actually produced a payload document. Everything else is counted
 * separately and the gate holds a FLOOR on `clean`.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHAT THE STUB IS, AND WHAT IT CANNOT DO
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Every SDK call resolves to a self-similar, depth-bounded proxy over an array:
 * every property read yields another one, so `result.steps.map(...)` works,
 * `Array.isArray` is true, `JSON.stringify` terminates, and — the property that
 * matters — every field is TRUTHY. A truthy field takes the `if` branch, which
 * is the branch that prints the second document. The stub is chosen to be the
 * WORST case for this invariant, not a plausible one.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 THE MODE IS AN OUTPUT OF THE RUN, NEVER AN INPUT TO IT
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `--json` rides in argv and NOTHING here calls `setJsonMode(true)`. The harness
 * used to, and that single statement made the whole PRE-HOOK half of the
 * contract unreachable: JSON mode is decided in the root's `preAction` hook,
 * commander refuses an invalid invocation above the hook chain, and a harness
 * that flipped the flag itself was measuring a world where that cannot happen.
 * Both ledgers read ZERO while `nexus agent get --json` exited 1 with an empty
 * stdout. A gate that supplies the precondition its subject is supposed to
 * establish reports on its own harness.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 FOUR BRANCHES THIS SCAN STRUCTURALLY CANNOT ENTER, AND THE SIBLINGS THAT
 *    READ THEM
 * ══════════════════════════════════════════════════════════════════════════════
 *
 *   - **An equality.** The stub is a proxy, so no field is a particular string.
 *     A command branching on `result.status === "success"` takes the else arm —
 *     or, where a guard refuses first, never reaches either.
 *   - **A hand-rolled required-option guard.** {@link synthesizeArgv} passes
 *     MANDATORY options only. A command that declares `--operation-id` as a
 *     plain option and then refuses without it stops at that refusal, and its
 *     whole action body is unmeasured.
 *   - **A confirmation's refusal path.** `--yes` rides every run, so the branch
 *     a SCRIPT always takes is the branch this scan never takes.
 *   - **AN ARGV THE SYNTHESIZER NEVER PRODUCES.** {@link synthesizeArgv} fills
 *     every mandatory option and every required positional from its own
 *     declaration, so a missing argument, an unknown command, an unknown option
 *     and an excess argument are removed from this population BY CONSTRUCTION —
 *     and every one of them is a refusal commander decides above the hook chain.
 *     `json-refusal-above-the-hook-chain.test.ts` drives that shadow directly.
 *     The one member of the class this scan does reach is a value outside a
 *     `.choices()` set, because `"stub"` is a legal string and an illegal
 *     choice; those four runs are what caught the defect above.
 *
 * All four read as `clean` or `error-document` here. A branch this instrument
 * cannot enter is not a branch it found compliant, and both ledgers sitting at
 * zero says nothing about any of them: NINE call sites still exited non-zero
 * with an empty stdout while every leaf ran green.
 *
 * `json-error-document.static-scan.ts` is the sibling that reads them. It walks
 * the AST for the syntactic pairing — prose to stderr, then a non-zero exit,
 * no document between — which is readable in a branch nobody can drive exactly
 * as in one everybody drives. Weaker than this scan in general, stronger on
 * that one shape; both, or neither is honest.
 */

import { Command, type Option } from "commander";

import { deriveCommandLeaves } from "../command-universe";
import { CLI_MINTED_CODES, CliArgumentError, handleError } from "../errors";
import { setJsonMode } from "../output";

/**
 * Commands that legitimately emit many values on stdout.
 *
 * ⚠️ WRITTEN OUT, NEVER DERIVED, AND THE GATE BOUNDS ITS SIZE. Derived from a
 * marker on the command it would be true by construction and would exempt
 * whatever anyone marked. Three entries is the whole honest list; a fourth needs
 * a deliberate edit here that a reviewer reads.
 *
 * `mcp serve` is the strongest member rather than a borderline one: its stdout
 * IS the MCP stdio transport — newline-delimited JSON-RPC, one message per line,
 * for as long as the host keeps the pipe open. There is no last document to wait
 * for, and driving it here would block on a stdin that never closes.
 */
export const STREAMING_LEAVES: readonly string[] = [
  "execution follow",
  "mcp serve",
  "vibe app logs"
];

/**
 * Commands whose stdout is the SERVER'S payload in a format the CALLER chose.
 *
 * ⚠️ THE THIRD LEGITIMATE SHAPE, AND IT WAS NOT IN THE ORIGINAL INVARIANT.
 * `nexus tracing export --format csv` prints CSV. That is not a broken JSON
 * document; it is the document, and each of these commands says so in its own
 * `--help` — "IT PRINTS THE PAYLOAD TO STDOUT AND NOTHING ELSE", and for
 * `tracing export`, "--json does NOT apply here". Calling them violations would
 * be the gate describing a CLI nobody wants, twice over: the format is the
 * caller's explicit request, and the payload is the whole point of the verb.
 *
 * They still satisfy the SPIRIT — one terminal result, one thing on stdout — so
 * the exemption is from the PARSE, never from the invariant. Bounded like
 * {@link STREAMING_LEAVES}: written out, asserted small.
 */
export const PAYLOAD_PASSTHROUGH_LEAVES: readonly string[] = [
  "analytics export",
  // `cue export` is the same shape: stdout is the server's transcript corpus in
  // the framing the caller asked for — NDJSON by default, which is many JSON
  // documents by construction and one payload by intent. Its own `--help` says
  // "THE OUTPUT IS THE PAYLOAD, VERBATIM".
  "cue export",
  "tracing export",
  "tracing export-bulk"
];

/** Every leaf exempt from the parse, for the gate's own bound. */
export const EXEMPT_LEAVES: readonly string[] = [
  ...STREAMING_LEAVES,
  ...PAYLOAD_PASSTHROUGH_LEAVES
];

/** How one driven run ended. Five states, and only one of them is protection. */
export type Outcome =
  /** stdout held exactly one JSON document that is not an error envelope. */
  | "clean"
  /** stdout did not parse as a single JSON document. THE DEFECT. */
  | "violation"
  /** stdout held one document and it was `{error:…}` — the command failed early. */
  | "error-path"
  /** stdout was empty. The command printed nothing, or printed only to stderr. */
  | "silent"
  /** the run did not finish inside the budget, or the harness could not start it. */
  | "undrivable";

/**
 * THE SECOND CLAUSE, AND IT IS A SEPARATE AXIS FROM {@link Outcome}.
 *
 * The root epilogue makes TWO promises about `--json`, not one:
 *
 *   READING THE OUTPUT — "--json prints ONE JSON document on STDOUT"
 *   FAILURE            — "EVERY failure exits 1. Under --json an error is a JSON
 *                         document on STDOUT: {"error":{"message","hint","code"}}"
 *
 * A command can satisfy the first and break the second: refusing a bad argument
 * with `console.error("Error: --body is required.")` and `process.exitCode = 1`
 * leaves stdout EMPTY, which is one document by no reasonable reading and
 * unparseable by every consumer. `Outcome` calls that `silent`, because stdout
 * is where it looks. This axis is what separates a command that printed nothing
 * because it SUCCEEDED quietly from one that printed nothing because it REFUSED.
 */
export type ErrorOutcome =
  /** The run did not fail. Says nothing about the error path. */
  | "not-an-error"
  /** Failed, and stdout held exactly one `{error:…}` document. THE CONTRACT. */
  | "error-document"
  /** Failed with prose on stderr and NOTHING on stdout. THE DEFECT. */
  | "error-prose"
  /** Failed with nothing on either stream. Worse — no message at all. */
  | "error-mute"
  /** Failed, and stdout held a non-error document. Reads as a success. */
  | "error-masked"
  /**
   * Failed with a proper document carrying the WRONG `code`. THE SECOND DEFECT.
   *
   * A document exists so a machine can branch on it, and a `code` that says
   * `CLI_INVALID_ARGUMENTS` for a connectivity failure is worse than the prose
   * it replaced: prose does not lie in a field a script trusts. A caller
   * branching on it stops retrying a retryable outage and tells a user to check
   * their flags.
   */
  | "error-miscoded";

export interface LeafRun {
  /** The population key: the leaf path, plus ` --dry-run` for the second variant. */
  readonly key: string;
  readonly leaf: string;
  readonly argv: readonly string[];
  readonly outcome: Outcome;
  /** For a violation: what stdout actually was. One line, safe to print. */
  readonly detail: string;
  readonly errorOutcome: ErrorOutcome;
  /** For an error-path defect: the first line the caller was given, on stderr. */
  readonly errorDetail: string;
  /** The `code` on the error document, when there was one. */
  readonly errorCode: string | undefined;
  /**
   * How many requests the harness's stubbed seams were asked to make.
   *
   * The only mechanical signal for "did anything leave this process before it
   * failed". Zero means every failure on this run was decided locally.
   */
  readonly requestsAttempted: number;
  /**
   * Did commander itself refuse the invocation?
   *
   * Separated because the REMEDY differs. A commander refusal is one class with
   * one fix at one place — the parse boundary. A hand-rolled `console.error`
   * inside an action is N fixes at N call sites.
   */
  readonly refusedByCommander: boolean;
}

export interface ScanReport {
  readonly leafCount: number;
  readonly runs: readonly LeafRun[];
  readonly violations: readonly LeafRun[];
  readonly counts: Readonly<Record<Outcome, number>>;
  /** Runs whose argv carried at least one synthesized value. Sanity on the synthesizer. */
  readonly runsWithSynthesizedArgs: number;
  /** Every run that FAILED, by how it told the caller. The second clause. */
  readonly errorCounts: Readonly<Record<ErrorOutcome, number>>;
  /** Failures that broke the error clause: prose, silence, or a masked failure. */
  readonly errorViolations: readonly LeafRun[];
  /** Failures that produced a document whose `code` contradicts what happened. */
  readonly miscoded: readonly LeafRun[];
  /** How many of those were commander's own refusal — one class, one fix. */
  readonly commanderRefusals: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Counting documents on stdout
// ─────────────────────────────────────────────────────────────────────────────

/**
 * How many top-level JSON values does this text hold, and is there prose?
 *
 * `JSON.parse` alone answers "not one" and never "how many", and the difference
 * decides whether a reader looks for a second printer or for a stray
 * `console.log("Deleted.")`. So this scans values itself: a balanced walk that
 * respects strings and escapes, which is enough to separate the two causes
 * without pulling in a parser.
 */
export function describeStdout(raw: string): { documents: number; prose: boolean } {
  const text = raw.trim();
  if (text === "") return { documents: 0, prose: false };

  let index = 0;
  let documents = 0;

  const skipSpace = (): void => {
    while (index < text.length && /\s/.test(text[index])) index += 1;
  };

  while (true) {
    skipSpace();
    if (index >= text.length) break;

    const start = index;
    const open = text[index];
    if (open !== "{" && open !== "[") return { documents, prose: true };

    let depth = 0;
    let inString = false;
    let escaped = false;
    for (; index < text.length; index += 1) {
      const ch = text[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === "{" || ch === "[") depth += 1;
      else if (ch === "}" || ch === "]") {
        depth -= 1;
        if (depth === 0) {
          index += 1;
          break;
        }
      }
    }
    if (depth !== 0) return { documents, prose: true };

    try {
      JSON.parse(text.slice(start, index));
    } catch {
      return { documents, prose: true };
    }
    documents += 1;
  }

  return { documents, prose: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// argv synthesis — derived from commander's own declarations
// ─────────────────────────────────────────────────────────────────────────────

const STUB_UUID = "11111111-1111-4111-8111-111111111111";

/**
 * A value for one declared slot, chosen from its NAME.
 *
 * The name is the only signal available and it is a good one: this CLI names an
 * id `<id>`, a body `<json>` and a limit `<n>`. A wrong guess costs one run its
 * `clean` and lands it in `error-path`, which the gate counts rather than
 * hides — so the synthesizer degrades into "measured less", never into "passed
 * without looking".
 */
export function placeholderFor(name: string, sandboxDir: string): string {
  const n = name.toLowerCase();
  const has = (...needles: string[]): boolean => needles.some((needle) => n.includes(needle));

  if (has("json", "body", "payload", "schema", "params", "properties")) return "{}";
  if (has("id", "uuid", "sid")) return STUB_UUID;
  if (has("email")) return "stub@example.com";
  if (has("url", "endpoint", "webhook")) return "https://example.invalid/stub";
  if (has("file", "path", "dir", "output", "zip", "archive")) return `${sandboxDir}/stub.txt`;
  if (has("date", "since", "until", "after", "before")) return "2026-01-01";
  // 🚨 NO BARE `"n"` HERE, AND THAT ONE LETTER COST REAL COVERAGE. The list was
  // a substring test and `"n"` is a substring of `name`, `friendlyName`,
  // `connection`, `region` — so a third of the tree was handed `"1"` where it
  // wanted a word, and every one of those runs died in an argument refusal that
  // the scan then counted as an unmeasured command. The metavariable `<n>` is
  // not what is being read either: commander's `attributeName()` is the LONG
  // FLAG (`limit`), never the placeholder in the help text.
  if (has("limit", "page", "count", "port", "days", "seconds", "size", "offset", "number")) {
    return "1";
  }
  return "stub";
}

/** commander declares whether an option takes a value and whether it is required. */
function optionValue(option: Option, sandboxDir: string): string[] {
  const flag = option.long ?? option.short ?? "";
  if (!option.required && !option.optional) return [flag];
  const choices = option.argChoices;
  const value = choices?.[0] ?? placeholderFor(option.attributeName(), sandboxDir);
  return [flag, value];
}

export interface Synthesized {
  readonly argv: string[];
  readonly synthesized: boolean;
  readonly hasDryRun: boolean;
}

/**
 * Build the argv that reaches this command's action.
 *
 * Mandatory options and required positionals only. Passing every declared flag
 * would fire mutually exclusive ones together and measure a shape no user can
 * produce; passing none would stop at commander's own refusal for half the tree.
 * `--yes` is the one exception and it is not a special case so much as the same
 * rule: without a terminal the confirmation REFUSES (by design — see
 * `util/confirm`), so a destructive command would never reach its printer.
 */
export function synthesizeArgv(path: string, command: Command, sandboxDir: string): Synthesized {
  const argv = [...path.split(" ")];
  let synthesized = false;
  let hasDryRun = false;

  for (const option of command.options) {
    const long = option.long ?? "";
    if (long === "--dry-run") {
      hasDryRun = true;
      continue;
    }
    if (long === "--yes") {
      argv.push(long);
      continue;
    }
    if (!option.mandatory) continue;
    argv.push(...optionValue(option, sandboxDir));
    synthesized = true;
  }

  for (const argument of command.registeredArguments) {
    if (!argument.required) continue;
    argv.push(placeholderFor(argument.name(), sandboxDir));
    synthesized = true;
  }

  return { argv, synthesized, hasDryRun };
}

// ─────────────────────────────────────────────────────────────────────────────
// Driving one command
// ─────────────────────────────────────────────────────────────────────────────

/** Index the live root program by path, so the scan drives the REAL command. */
function indexProgram(program: Command): Map<string, Command> {
  const index = new Map<string, Command>();
  const visit = (command: Command, prefix: string[]): void => {
    const path = [...prefix, command.name()];
    index.set(path.join(" "), command);
    for (const child of command.commands) {
      if (child.name() !== "help") visit(child, path);
    }
  };
  for (const root of program.commands) {
    if (root.name() !== "help") visit(root, []);
  }
  return index;
}

/**
 * Commander must THROW rather than exit, on every node of the tree.
 *
 * `exitOverride()` on the root is not enough: commander copies inherited
 * settings when a subcommand is CREATED, and this tree is already built by the
 * time the scan sees it. A missed node calls `process.exit` and takes the whole
 * test worker with it, which reads as a crashed suite rather than as one
 * unmeasured command.
 */
/**
 * Capture commander's own output, and CHANGE NOTHING ELSE.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 THIS FUNCTION USED TO INSTALL THE REFUSAL FUNNEL, AND THAT MADE THE GATE
 *    UNABLE TO SEE THE FUNNEL BEING REMOVED.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Proven by mutation: deleting `installArgumentRefusalReporting(program)` from
 * `buildRootProgram` left all 30 tests GREEN, because the scan was installing
 * its own copy a line later. The gate proved the installer WORKS and proved
 * nothing about it being WIRED — a distinction worth exactly the 41 commands
 * that depend on the wiring.
 *
 * So the scan installs nothing. It drives the real root program as built, and
 * `process.exit` is neutralised in {@link driveOne} instead — which is the only
 * thing that ever needed neutralising.
 *
 * Commander's refusal text goes to the CAPTURED stderr rather than to the floor:
 * dropping it made "refused with a message" and "refused in silence"
 * indistinguishable, which is exactly the distinction clause 2 turns on.
 */
function captureCommanderOutput(command: Command, onStderr: (text: string) => void): void {
  command.configureOutput({ writeOut: () => {}, writeErr: onStderr });
  for (const child of command.commands) captureCommanderOutput(child, onStderr);
}

/**
 * The command called `process.exit`, which a spec must never actually do.
 *
 * Carrying the CODE matters: commander exits 0 for `--help` and non-zero for a
 * refusal, and the second is the one that means "nothing reached stdout".
 */
class ProcessExitCalled extends Error {
  constructor(readonly code: number) {
    super(`process.exit(${code})`);
    this.name = "ProcessExitCalled";
  }
}

const RUN_BUDGET_MS = 8_000;

export interface DriveDeps {
  /** Fresh root program per run — commander stores parsed values on the tree. */
  readonly buildProgram: () => Command;
  readonly sandboxDir: string;
  /**
   * Requests the stubbed seams were asked to make, since {@link resetRequests}.
   *
   * The TEST owns the stubs, so the test owns this counter. The scan only reads
   * it — a scan that stubbed its own seams would be measuring itself.
   */
  readonly requestCount: () => number;
  readonly resetRequests: () => void;
}

/**
 * Codes that can ONLY be true if something left this process.
 *
 * Deliberately not the whole non-argument set: `CLI_NOT_FOUND`,
 * `CLI_NOT_AUTHENTICATED` and `CLI_LOCAL_FAILED` are all legitimately decided
 * from local state with no request at all.
 */
const REMOTE_ONLY_CODES = new Set([
  "CLI_CONNECTION_FAILED",
  "CLI_TIMEOUT",
  "CLI_REMOTE_ERROR",
  "CLI_SDK_ERROR"
]);

/**
 * Every code the CLI is allowed to put on the wire. A stray one is a typo.
 *
 * 🚨 DERIVED FROM `CLI_CODES`, NEVER RETYPED. This was a hand-written list and
 * it was already wrong: `CLI_UPGRADE_NOT_RESOLVED` and
 * `CLI_UPGRADE_NOT_VERIFIED_FOR_YOU` were absent from the day they were minted,
 * and it stayed green because neither reaches this driven scan. A hand list only
 * fails for the next person to add a code that IS drivable, whose correct
 * document is then reported as a typo — which is a gate red nobody can act on
 * without editing the gate.
 *
 * `CLI_ADMIN_ERROR` is the one addition, and it is deliberate: the admin tree
 * mints it in `util/admin-errors.ts`, outside `CLI_CODES`.
 */
const KNOWN_CODES = new Set([...CLI_MINTED_CODES, "CLI_ADMIN_ERROR"]);

/**
 * The message the harness's network stub throws, verbatim.
 *
 * ⚠️ A SOUND SIGNAL, AND THE ONLY ONE HERE. When this string reaches the error
 * document, the failure is a network failure BY CONSTRUCTION — the harness made
 * it one — so the code must say so. No inference, no false positive.
 */
export const NETWORK_STUB_MESSAGE = "the network is blocked in the one-document gate";

async function driveOne(
  key: string,
  leaf: string,
  argv: readonly string[],
  deps: DriveDeps
): Promise<LeafRun> {
  const chunks: string[] = [];
  const errChunks: string[] = [];
  const captureErr = (text: string): void => void errChunks.push(text.replace(/\n$/, ""));

  const program = deps.buildProgram();
  captureCommanderOutput(program, captureErr);

  const realLog = console.log;
  const realErr = console.error;
  const realWrite = process.stdout.write.bind(process.stdout);
  const realErrWrite = process.stderr.write.bind(process.stderr);
  console.log = (...args: unknown[]): void => void chunks.push(args.map(String).join(" "));
  console.error = (...args: unknown[]): void => captureErr(args.map(String).join(" "));
  process.stdout.write = ((text: string | Uint8Array): boolean => {
    chunks.push(typeof text === "string" ? text.replace(/\n$/, "") : "");
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((text: string | Uint8Array): boolean => {
    captureErr(typeof text === "string" ? text : "");
    return true;
  }) as typeof process.stderr.write;

  // `--help` and `--version` reach commander's `_exit` with code 0, where the
  // production callback deliberately returns and lets `process.exit(0)` run.
  // A real exit here would take the whole test worker with it, so it becomes a
  // throw for the duration of one driven command — the ONLY production
  // behaviour this scan alters, and it alters it outside the code under test.
  const realExit = process.exit;
  process.exit = ((code?: number): never => {
    throw new ProcessExitCalled(code ?? 0);
  }) as typeof process.exit;

  // 🚨 THE HARNESS DOES NOT ENTER JSON MODE. THE PROGRAM DOES, OR NOTHING DOES.
  //
  // This line used to read `setJsonMode(true)`, and that one statement put the
  // whole PRE-HOOK half of the contract out of the gate's reach. JSON mode is
  // decided in the root's `preAction` hook, and commander refuses an invalid
  // invocation ABOVE the hook chain — so in production a refusal happens while
  // the process still believes it is in text mode, and `printCliError` writes
  // prose to stderr with nothing on stdout. A harness that flipped the flag
  // itself was testing a world where that is impossible: every commander
  // refusal came back as a compliant `error-document` and both ledgers read
  // ZERO over a defect reproducible from the shipped binary in one command.
  //
  // So the mode is now an OUTPUT of the run rather than an input to it. `--json`
  // rides in argv exactly as a caller types it, and whether the process notices
  // is precisely what this scan measures.
  deps.resetRequests();
  const previousExitCode = process.exitCode;
  process.exitCode = undefined;

  let timedOut = false;
  let threw: unknown;
  try {
    await Promise.race([
      program.parseAsync(["node", "nexus", "--json", ...argv]),
      new Promise((resolve) => {
        const timer = setTimeout(() => {
          timedOut = true;
          resolve(undefined);
        }, RUN_BUDGET_MS);
        timer.unref?.();
      })
    ]);
  } catch (error) {
    // Every failure shape is DATA here — a commander refusal, a thrown SDK stub,
    // a command that rejects its own placeholder. What each STREAM holds is the
    // measurement, and the classification below reads it either way.
    //
    // 🚨 `handleError` IS CALLED HERE BECAUSE THE ENTRY POINT CALLS IT. `index.ts`
    // ends with `.catch((err) => { process.exitCode = handleError(err); })`, and
    // that line is where an argument refusal becomes its document. A scan that
    // skipped it would drive the parser and never exercise the reporter, and
    // would report every refusal as an empty stdout forever.
    threw = error;
    // 🚨 A `process.exit` IS NOT AN ERROR THE ENTRY POINT EVER SEES. Feeding it
    // to `handleError` would manufacture an error document that production
    // never produces — and that is not hypothetical: with the neutraliser
    // reporting a plain Error, deleting the refusal funnel from
    // `buildRootProgram` left the ledger GREEN while 41 commands went back to an
    // empty stdout. The exit is recorded as the fact it is, and the run keeps
    // whatever the command really put on each stream.
    if (!(error instanceof ProcessExitCalled)) {
      process.exitCode = handleError(error);
    } else {
      process.exitCode = error.code === 0 ? undefined : error.code;
    }
  } finally {
    console.log = realLog;
    console.error = realErr;
    process.stdout.write = realWrite;
    process.stderr.write = realErrWrite;
    process.exit = realExit;
    // A RESET, not the other half of a pair. One `nexus` process runs one
    // command; this one runs five hundred, so the flag the program may have set
    // has to be cleared before the next leaf is driven, or run N+1 inherits run
    // N's mode and the scan measures a state no caller can produce.
    setJsonMode(false);
  }

  // 🚨 READ IT BEFORE RESTORING IT. `process.exitCode` is how nine out of ten
  // commands report a refusal — they never throw — so restoring the outer value
  // first would erase the only signal that the run failed at all.
  const runExitCode = process.exitCode;
  process.exitCode = previousExitCode;

  const stdout = chunks.join("\n");
  const stderr = errChunks.join("\n").trim();
  const requestsAttempted = deps.requestCount();
  // `CliArgumentError` is what the production installer throws for a refusal at
  // the parse boundary — the class `handleError` itself branches on, so the scan
  // reads the same fact the CLI does rather than sniffing a message.
  const refusedByCommander = threw instanceof CliArgumentError;

  if (timedOut) {
    return {
      key,
      leaf,
      argv,
      outcome: "undrivable",
      detail: "did not finish in the budget",
      errorOutcome: "not-an-error",
      errorDetail: "",
      errorCode: undefined,
      requestsAttempted,
      refusedByCommander
    };
  }

  const { documents, prose } = describeStdout(stdout);
  const failed = (runExitCode !== undefined && runExitCode !== 0) || threw !== undefined;

  let errorCode: string | undefined;
  let miscodeReason = "";

  const errorOutcome = ((): ErrorOutcome => {
    if (!failed) return "not-an-error";
    if (documents === 1 && !prose) {
      const value = JSON.parse(stdout.trim()) as { error?: { code?: unknown; message?: unknown } };
      const envelope = typeof value === "object" && value !== null ? value.error : undefined;
      if (envelope === undefined) return "error-masked";

      errorCode = typeof envelope.code === "string" ? envelope.code : undefined;
      const message = typeof envelope.message === "string" ? envelope.message : "";

      if (errorCode === undefined || !KNOWN_CODES.has(errorCode)) {
        miscodeReason = `code "${errorCode ?? "(absent)"}" is not one this CLI mints`;
        return "error-miscoded";
      }
      // SOUND: the harness itself made this a network failure, so the code must
      // say network. No inference — the sentinel is in the message.
      if (message.includes(NETWORK_STUB_MESSAGE) && errorCode !== "CLI_CONNECTION_FAILED") {
        miscodeReason = `the network stub caused it and the code says ${errorCode}`;
        return "error-miscoded";
      }
      // INFERRED, and therefore LEDGERED rather than absolute: an argument
      // refusal CAN legitimately follow a request — `auth login` validates the
      // profile NAME after checking the key against the API. Those are named in
      // the ledger; anything else is the defect.
      if (requestsAttempted > 0 && errorCode === "CLI_INVALID_ARGUMENTS") {
        miscodeReason = `${requestsAttempted} request(s) went out, then it reported a bad argument`;
        return "error-miscoded";
      }
      if (requestsAttempted === 0 && REMOTE_ONLY_CODES.has(errorCode)) {
        miscodeReason = `nothing left this process and the code says ${errorCode}`;
        return "error-miscoded";
      }
      return "error-document";
    }
    if (documents === 0 && !prose) return stderr === "" ? "error-mute" : "error-prose";
    // Prose or several documents on stdout during a failure. The one-document
    // clause already reports it; do not double-count it as an error defect.
    return "error-prose";
  })();

  const errorDetail =
    errorOutcome === "error-document" || errorOutcome === "not-an-error"
      ? ""
      : errorOutcome === "error-miscoded"
        ? miscodeReason
        : preview(stderr === "" ? "(nothing on either stream)" : stderr);

  const base = {
    key,
    leaf,
    argv,
    errorOutcome,
    errorDetail,
    errorCode,
    requestsAttempted,
    refusedByCommander
  };

  if (documents === 0 && !prose) {
    return { ...base, outcome: "silent", detail: "stdout was empty" };
  }
  if (prose || documents > 1) {
    const cause = prose
      ? documents === 0
        ? "prose on stdout"
        : `${documents} document(s) then prose`
      : `${documents} concatenated documents`;
    return { ...base, outcome: "violation", detail: `${cause}: ${preview(stdout)}` };
  }

  const parsed: unknown = JSON.parse(stdout.trim());
  const isError =
    typeof parsed === "object" && parsed !== null && "error" in (parsed as Record<string, unknown>);
  return {
    ...base,
    outcome: isError ? "error-path" : "clean",
    detail: isError ? preview(stdout) : ""
  };
}

function preview(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > 160 ? `${flat.slice(0, 160)}…` : flat;
}

// ─────────────────────────────────────────────────────────────────────────────
// The scan
// ─────────────────────────────────────────────────────────────────────────────

export async function runOneDocumentScan(deps: DriveDeps): Promise<ScanReport> {
  const leaves = await deriveCommandLeaves();
  const index = indexProgram(deps.buildProgram());

  const runs: LeafRun[] = [];
  let runsWithSynthesizedArgs = 0;

  for (const leaf of leaves) {
    if (EXEMPT_LEAVES.includes(leaf)) continue;

    const command = index.get(leaf);
    if (command === undefined) {
      runs.push({
        key: leaf,
        leaf,
        argv: [],
        outcome: "undrivable",
        detail: "the real root program registers no command at this path",
        errorOutcome: "not-an-error",
        errorDetail: "",
        errorCode: undefined,
        requestsAttempted: 0,
        refusedByCommander: false
      });
      continue;
    }

    const plan = synthesizeArgv(leaf, command, deps.sandboxDir);
    if (plan.synthesized) runsWithSynthesizedArgs += 1;

    runs.push(await driveOne(leaf, leaf, plan.argv, deps));

    // A `--dry-run` arm is a DIFFERENT terminal result of the same command, and
    // three of them printed prose and returned. Derived from the declaration, so
    // a new one joins the population by being declared.
    if (plan.hasDryRun) {
      runs.push(await driveOne(`${leaf} --dry-run`, leaf, [...plan.argv, "--dry-run"], deps));
    }
  }

  const counts: Record<Outcome, number> = {
    clean: 0,
    violation: 0,
    "error-path": 0,
    silent: 0,
    undrivable: 0
  };
  for (const run of runs) counts[run.outcome] += 1;

  const errorCounts: Record<ErrorOutcome, number> = {
    "not-an-error": 0,
    "error-document": 0,
    "error-prose": 0,
    "error-mute": 0,
    "error-masked": 0,
    "error-miscoded": 0
  };
  for (const run of runs) errorCounts[run.errorOutcome] += 1;

  return {
    leafCount: leaves.length,
    runs,
    violations: runs.filter((run) => run.outcome === "violation"),
    counts,
    runsWithSynthesizedArgs,
    errorCounts,
    errorViolations: runs.filter(
      (run) =>
        run.errorOutcome === "error-prose" ||
        run.errorOutcome === "error-mute" ||
        run.errorOutcome === "error-masked"
    ),
    miscoded: runs.filter((run) => run.errorOutcome === "error-miscoded"),
    commanderRefusals: runs.filter((run) => run.refusedByCommander).length
  };
}
