/**
 * THE DESTRUCTIVE-CONFIRMATION GATE — derive the population, then DRIVE it.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE DEFECT THIS DELETES, AND WHY THE OLD SHAPE COULD NOT
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `destructive-confirmation.test.ts` asserts two real things: that no NEW
 * command declares `--yes` by hand, and that no command decides on stdout. Both
 * are conditioned on a command HAVING a `--yes`. Neither can see a destructive
 * command that declares no confirmation at all, because such a command is
 * absent from every population those assertions range over. A gate whose
 * predicate is "of the commands that confirm, do they confirm correctly" is
 * satisfied, vacuously and forever, by a command that never confirms.
 *
 * That file also derived a `notReadOnly()` population from
 * `COMMAND_CLASSIFICATION` and fed it nothing but a `length > 50` control. It
 * could not have fed it an obligation either: the classification's non-`safe`
 * bucket is 483 leaves and includes `agent get <id>` — a READ that happens to
 * need an argument. "Not read-only" is not "destructive", and asserting a
 * confirmation over that population would demand one from every parameterised
 * read in the CLI.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * SO: A DERIVED CANDIDATE SET, PARTITIONED BY THREE NAMED SETS
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Destructiveness cannot be derived from commander — nothing on a `Command`
 * says whether its action destroys anything. What CAN be derived is a set of
 * CANDIDATES that must each be accounted for by name:
 *
 *   {@link destructiveCandidates} = leaves whose name carries a verb from
 *   {@link DESTRUCTIVE_VERBS}  ∪  leaves that DECLARE `--yes`.
 *
 * The second half is what catches a command whose name says nothing —
 * `phone-number buy` spends money and destroys nothing, and is only a candidate
 * because it declares the flag. The first half is what catches a command that
 * declares nothing — which is the whole hole, and everything in
 * {@link UNCONFIRMED_DESTRUCTIVE} reached this file through it.
 *
 * Every candidate must appear in EXACTLY ONE of:
 *
 *   - {@link CONFIRMS_BEFORE_ACTING} — the OBLIGATION SET. Each member is
 *     DRIVEN with no terminal and no `--yes`, and must be observed to reach
 *     `confirmDestructive` and then stop. Not "declares a flag" — REACHES the
 *     helper. A flag is a declaration; a call is a fact.
 *   - {@link NOT_DESTRUCTIVE} — a candidate that legitimately does not confirm,
 *     with a written reason. Driven too, so a member that starts confirming is
 *     reported rather than silently over-exempted.
 *   - {@link UNCONFIRMED_DESTRUCTIVE} — a candidate that DOES destroy and does
 *     NOT confirm. Named debt. Driven, and required to still fail — an entry
 *     that starts confirming must move to the obligation set, so the ledger
 *     cannot rot in the shrinking direction either.
 *
 * 🚨 THE PARTITION IS THE GATE. A new `foo delete` is a candidate the moment it
 * is registered, is in none of the three sets, and reds by name. There is no
 * count floor anywhere in this file, deliberately: a floor is a hole shaped
 * exactly like the defect, because a mismatched item LEAVES the population and
 * takes its own case with it.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHAT THIS STRUCTURALLY CANNOT SEE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * A destructive command that carries NO verb from the vocabulary AND declares
 * no `--yes`. `phone-number buy` is the proof that such a command can exist —
 * it is only in the population because somebody already gated it. A future
 * `billing charge` or `org transfer` would be invisible here.
 *
 * The vocabulary is the mitigation and not the cure: it is wide enough that
 * every destructive verb this CLI has ever shipped is in it, and every member
 * it over-matches costs one line in {@link NOT_DESTRUCTIVE} rather than a
 * loosened rule. Widening it is cheap; nothing else closes the shadow.
 */

import type { Command } from "commander";

import { placeholderFor } from "../commands/json-one-document.scan";
import { CliArgumentError, handleError } from "../errors";
import { setJsonMode } from "../output";

// ─────────────────────────────────────────────────────────────────────────────
// The derivation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verbs that name the destruction or surrender of something already stored.
 *
 * Matched against the WORDS of a leaf's path below the top-level namespace,
 * split on spaces and hyphens — so `tool delete-credential` matches on
 * `delete` and `role revoke-workspace` on `revoke`, while a namespace that
 * happens to contain a verb does not drag its reads in.
 *
 * ⚠️ OVER-MATCHING IS THE CHEAP DIRECTION AND IS CHOSEN ON PURPOSE. Every
 * false positive costs one reasoned line in {@link NOT_DESTRUCTIVE}, which a
 * reviewer reads. Every false NEGATIVE is a destructive command nothing asks
 * about, which is the failure this file exists for.
 */
export const DESTRUCTIVE_VERBS: readonly string[] = [
  "abort",
  "cancel",
  "delete",
  "destroy",
  "detach",
  "disable",
  "drop",
  "logout",
  "prune",
  "purge",
  "release",
  "remove",
  "reset",
  "restore",
  "revoke",
  "rm",
  "rotate",
  "truncate",
  "uninstall",
  "unmount",
  "unpin",
  "unpublish",
  "wipe"
];

/** Every node in the tree, keyed by its space-separated path. */
export function everyCommand(
  root: Command,
  trail: readonly string[] = []
): Array<[string, Command]> {
  const out: Array<[string, Command]> = [];
  for (const child of root.commands) {
    if (child.name() === "help") continue;
    const path = [...trail, child.name()];
    out.push([path.join(" "), child]);
    out.push(...everyCommand(child, path));
  }
  return out;
}

/** A node with no children is where an action lives. */
function isLeaf(command: Command): boolean {
  return command.commands.filter((child) => child.name() !== "help").length === 0;
}

/** True when this leaf's own words — never its namespace — carry a destructive verb. */
export function carriesDestructiveVerb(path: string): boolean {
  const words = path
    .split(" ")
    .slice(1)
    .flatMap((segment) => segment.split("-"));
  return words.some((word) => DESTRUCTIVE_VERBS.includes(word));
}

/**
 * Every leaf that must be accounted for by name.
 *
 * The union of the two signals, because neither alone is enough: the verb misses
 * `phone-number buy`, and the flag misses every command that never declared one.
 */
export function destructiveCandidates(root: Command): string[] {
  return everyCommand(root)
    .filter(([, command]) => isLeaf(command))
    .filter(
      ([path, command]) =>
        carriesDestructiveVerb(path) || command.options.some((option) => option.long === "--yes")
    )
    .map(([path]) => path)
    .sort();
}

// ─────────────────────────────────────────────────────────────────────────────
// The three named sets. Together they must equal the candidates, exactly.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * THE OBLIGATION SET. Every entry is driven with no terminal and no `--yes`,
 * and must be OBSERVED calling `confirmDestructive` and then acting on nothing.
 *
 * A line is added here by making the command confirm, never the other way
 * round: the drive is the evidence, so an entry whose command does not ask reds
 * by name on the very next run.
 */
export const CONFIRMS_BEFORE_ACTING: readonly string[] = [
  "agent delete",
  "agent-eval run delete",
  "agent-eval schedule delete",
  "agent-eval template delete",
  "agent-eval template detach",
  "agent-eval trigger delete",
  "agent-eval webhook delete",
  "agent-skill delete",
  "agent-tool delete",
  "asset delete",
  "channel whatsapp-template delete",
  "claude-code install",
  "collection delete",
  "credential delete",
  "custom-model delete",
  "customer delete",
  "deployment delete",
  "deployment folder delete",
  "deployment template detach",
  "document delete",
  "emulator scenario delete",
  "emulator session delete",
  "folder delete",
  "html-template delete",
  "phone-number buy",
  "phone-number release",
  "prompt-assistant delete-thread",
  "skill-folder delete",
  "skills update",
  "task delete",
  "task-eval session delete",
  "template folder delete",
  "tool delete-credential",
  "tracks memory delete",
  "user-group delete",
  "version delete",
  "version restore",
  "vibe app delete",
  "vibe app rotate-edge-token",
  "vibe git-project delete",
  "workflow branch delete",
  "workflow delete",
  "workflow edge delete",
  "workflow node delete",
  "workspace delete"
];

/**
 * A candidate that legitimately asks nothing, and WHY.
 *
 * The reason is required and is checked for length, so an entry cannot be added
 * without saying something. It cannot be checked for truth — a reader is the
 * only thing that does that, which is exactly why the list is short and each
 * line names the property that makes destruction impossible.
 */
export const NOT_DESTRUCTIVE: Readonly<Record<string, string>> = {
  "agent-eval run abort":
    "Stops an in-flight run and moves it to ABORTED. The run row, its results and its " +
    "transcript all survive; nothing stored is removed.",
  "auth unpin":
    "Removes ./.nexusrc, a one-line POINTER at a profile. It holds no credential of its " +
    "own and `auth pin` writes it back, so nothing is lost that a second command cannot undo.",
  "execution cancel":
    "Stops a PENDING/RUNNING execution and its loop children. The execution records and " +
    "every node result already produced survive; nothing stored is removed.",
  "workspace restore":
    "Recovers deleted files from the S3 backup. It only ever ADDS objects back — its own " +
    "help states live files are never overwritten — so there is nothing to lose by running it.",
  "workspace unmount":
    "A local mount-registry edit that makes no API call at all. The workspace and every " +
    "file in it are untouched, and `workspace mount` puts the mount point back."
};

/**
 * NAMED DEBT: it destroys, and it asks nothing.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔴 THIS LIST IS NOT AN EXEMPTION. IT IS A MEASUREMENT.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Every entry is DRIVEN like the obligation set, and is required to still fail
 * to ask — so a line that stops being true is reported, in both directions. It
 * cannot silently absorb a new command either: adding one is an edit to a
 * constant named `UNCONFIRMED_DESTRUCTIVE`, which is not a thing anyone does by
 * accident at 2am to unblock a build.
 *
 * ⚠️ CLEARING A LINE IS A BREAKING CHANGE TO A SCRIPT, WHICH IS WHY THEY ARE
 * STILL HERE. Making one of these confirm means it starts REFUSING when run
 * from a pipeline without `--yes` — the correct direction, and the same
 * direction the 44 commands above already took, but a CLI compatibility note
 * belongs with it. That is the sequencing, not a doubt about the fix.
 */
export const UNCONFIRMED_DESTRUCTIVE: Readonly<Record<string, string>> = {
  "access-card delete": "Deletes an access card, and with it whatever it was scoping.",
  "admin vibe-tenant-cluster disable":
    "Opts an org out of its dedicated cluster. DISABLED_RETAINED keeps the data, and the " +
    "org still loses its cluster with nobody asked.",
  "agent-collection detach":
    "Takes knowledge collections off an agent. The sibling `agent-eval template detach` and " +
    "`deployment template detach` both confirm; this one does not.",
  "auth logout":
    "Deletes a stored profile — the API key and its org metadata. The key is not " +
    "recoverable from here once the file is gone.",
  "collection remove-document": "Takes a document out of a collection.",
  "external-tool delete":
    "Deletes an external tool, and every agent wired to it loses the action. " +
    "🚨 ITS `--force` MEANS CASCADE, NOT CONSENT — it also deletes the agent tool " +
    "configs referencing the tool. `confirmDestructive` reads `opts.force` AS " +
    "consent, so the obvious two-line fix here makes the widest-blast-radius " +
    "invocation the one that skips the question. Pass `{ yes: opts.yes }` " +
    "explicitly rather than spreading `opts`.",
  "permissions revoke": "Removes a principal's grant on a resource.",
  "role delete": "Deletes a Role, and with it every grant, board and duty hanging off it.",
  "role delete-job-type": "Removes a job type from the organization's library.",
  "role delete-permission-set": "Deletes a permission set.",
  "role detach": "Takes a system out of its Role, which its own description says DISABLES access.",
  "role remove-board": "Deletes a lane; its cards fall back to Ungrouped.",
  "role remove-member": "Removes a user's ADMIN or MEMBER standing in a Role.",
  "role remove-permission-set-member": "Takes a user out of one of a Role's permission sets.",
  "role remove-responsibility": "Removes a duty from a Role.",
  "role revoke-collection": "Removes a Role's access to a knowledge collection.",
  "role revoke-workspace": "Removes a Role's access to a file workspace.",
  "tracing delete":
    "Deletes a trace and every generation under it. Its own description ends " +
    '"permanent, no confirmation" — written down, and until now checked by nothing.',
  "user-group remove-member": "Removes one user from a group.",
  "vibe env rm": "Deletes an environment variable from a Vibe app; the value is not recoverable.",
  "workflow unpublish":
    "Takes a published workflow back to DRAFT and DEACTIVATES its production triggers. " +
    'Its own help calls it "a disabling, not a tidy-up" — a live webhook or schedule stops ' +
    "firing and agents holding it as a tool stop being able to run it."
};

// ─────────────────────────────────────────────────────────────────────────────
// Driving one candidate
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Options that would tell the command it has already been confirmed.
 *
 * `--force` is skipped for the same reason `--yes` is: `confirmDestructive`
 * treats it as consent. `--dry-run` is skipped because it stops the command
 * before the part being measured.
 */
const CONSENT_FLAGS = new Set(["--yes", "--force", "--dry-run"]);

/**
 * The argv that reaches this command's action WITHOUT a confirmation.
 *
 * Deliberately the mirror of `synthesizeArgv` in `json-one-document.scan.ts`:
 * that one passes `--yes` on every run, which is precisely why it can never
 * enter the branch a script takes. Its own header names this as one of the four
 * shadows it cannot reach. This is that shadow, driven.
 *
 * `fillEveryOption` is the SECOND attempt, and it exists for one real shape.
 * `applyBodySatisfiesRequired` un-flips `mandatory` on every field a `--body`
 * could supply and re-imposes the requirement in a `preAction` hook — so on the
 * live tree those options read as optional, a minimal argv omits them, and the
 * hook refuses before the action runs. Four commands do this. Filling
 * everything up front instead would fire mutually exclusive flags together on
 * commands that do not need it, so it is a fallback rather than the rule.
 */
export function argvWithoutConfirmation(
  path: string,
  command: Command,
  sandboxDir: string,
  fillEveryOption = false
): string[] {
  const argv = [...path.split(" ")];

  for (const option of command.options) {
    const long = option.long ?? "";
    if (CONSENT_FLAGS.has(long)) continue;
    if (!option.mandatory && !fillEveryOption) continue;
    if (!option.required && !option.optional) {
      // A boolean flag. Only pass it when it was declared mandatory; sweeping
      // every boolean in would flip behaviour the run is not measuring.
      if (option.mandatory) argv.push(long);
      continue;
    }
    argv.push(long, option.argChoices?.[0] ?? placeholderFor(option.attributeName(), sandboxDir));
  }

  for (const argument of command.registeredArguments) {
    if (!argument.required) continue;
    // 🚨 `argChoices` BEFORE THE PLACEHOLDER. `role detach <type>` declares its
    // positional through `enumArgument`, so `"stub"` is refused by commander
    // above the action and the command is measured as neither asking nor acting
    // — an UNMEASURED run wearing a clean result.
    argv.push(argument.argChoices?.[0] ?? placeholderFor(argument.name(), sandboxDir));
  }

  return argv;
}

/** What one driven candidate did. */
export interface CandidateRun {
  readonly leaf: string;
  readonly argv: readonly string[];
  /** The command reached `confirmDestructive`. A FACT on the call, never a flag. */
  readonly asked: boolean;
  /** Requests the stubbed seams were asked to make AFTER the refusal was available. */
  readonly requests: number;
  readonly exitCode: number | undefined;
  /** Commander refused the harness's own argv — a harness fault, never a finding. */
  readonly refusedByCommander: boolean;
  readonly stderr: string;
  readonly timedOut: boolean;
}

export interface CandidateDeps {
  /** Fresh root program per run — commander stores parsed values on the tree. */
  readonly buildProgram: () => Command;
  readonly sandboxDir: string;
  /** Whether `confirmDestructive` was entered since the last reset. Owned by the TEST. */
  readonly wasAsked: () => boolean;
  readonly requestCount: () => number;
  readonly reset: () => void;
}

const RUN_BUDGET_MS = 8_000;

class ProcessExitCalled extends Error {
  constructor(readonly code: number) {
    super(`process.exit(${code})`);
    this.name = "ProcessExitCalled";
  }
}

/**
 * HAND THE EVENT LOOP BACK between candidates.
 *
 * vitest talks to its workers over birpc with a hardcoded 60-second ceiling
 * (`DEFAULT_TIMEOUT = 6e4`) and no config knob. A worker blocked past it never
 * answers its own `onTaskUpdate`, and the run dies with an unhandled
 * `[vitest-worker]: Timeout` naming no test — every test reported PASSED, exit
 * 1. Most of a driven command is synchronous, and awaiting an already-resolved
 * import only drains microtasks; a macrotask is the only thing that reaches the
 * poll phase.
 */
const yieldToEventLoop = (): Promise<void> =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

async function driveOne(
  leaf: string,
  argv: readonly string[],
  deps: CandidateDeps
): Promise<CandidateRun> {
  const errChunks: string[] = [];
  const program = deps.buildProgram();

  const realLog = console.log;
  const realErr = console.error;
  const realWrite = process.stdout.write.bind(process.stdout);
  const realErrWrite = process.stderr.write.bind(process.stderr);
  console.log = (): void => {};
  console.error = (...args: unknown[]): void => void errChunks.push(args.map(String).join(" "));
  process.stdout.write = ((): boolean => true) as typeof process.stdout.write;
  process.stderr.write = ((text: string | Uint8Array): boolean => {
    errChunks.push(typeof text === "string" ? text : "");
    return true;
  }) as typeof process.stderr.write;

  const realExit = process.exit;
  process.exit = ((code?: number): never => {
    throw new ProcessExitCalled(code ?? 0);
  }) as typeof process.exit;

  deps.reset();
  const previousExitCode = process.exitCode;
  process.exitCode = undefined;

  let timedOut = false;
  let threw: unknown;
  try {
    await Promise.race([
      program.parseAsync(["node", "nexus", ...argv]),
      new Promise((resolve) => {
        const timer = setTimeout(() => {
          timedOut = true;
          resolve(undefined);
        }, RUN_BUDGET_MS);
        timer.unref?.();
      })
    ]);
  } catch (error) {
    threw = error;
    // The entry point ends with `.catch(err => { process.exitCode = handleError(err) })`,
    // so a scan that skipped it would drive the parser and never exercise the
    // reporter. A `process.exit` is not an error the entry point ever sees.
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
    // A RESET, not the other half of a pair: one `nexus` process runs one
    // command and this runs sixty, so a mode the program set must not reach the
    // next leaf.
    setJsonMode(false);
  }

  // Read it BEFORE restoring: `process.exitCode` is how most commands report a
  // refusal, so restoring the outer value first erases the only signal.
  const exitCode = process.exitCode;
  process.exitCode = previousExitCode;

  return {
    leaf,
    argv,
    asked: deps.wasAsked(),
    requests: deps.requestCount(),
    exitCode: typeof exitCode === "number" ? exitCode : undefined,
    refusedByCommander: threw instanceof CliArgumentError,
    stderr: errChunks.join("\n").trim(),
    timedOut
  };
}

/**
 * Drive every named candidate, once, in one pass.
 *
 * The whole population is driven — obligation set, exemptions and debt alike —
 * because an exemption nobody exercises is an exemption nobody can catch going
 * wrong, in either direction.
 */
export async function runDestructiveConfirmationScan(
  leaves: readonly string[],
  deps: CandidateDeps
): Promise<Map<string, CandidateRun>> {
  const index = new Map(everyCommand(deps.buildProgram()));
  const runs = new Map<string, CandidateRun>();

  for (const leaf of leaves) {
    await yieldToEventLoop();
    const command = index.get(leaf);
    if (command === undefined) continue;

    let run = await driveOne(leaf, argvWithoutConfirmation(leaf, command, deps.sandboxDir), deps);

    // A commander refusal means the action never ran, so the run measured
    // NOTHING — it is not a command that failed to ask. Retry once with every
    // option filled, which is what the deferred-`--body` requirement needs. The
    // gate asserts no run is left in this state, so a shape neither attempt
    // reaches is reported rather than counted as compliant.
    if (run.refusedByCommander) {
      await yieldToEventLoop();
      run = await driveOne(
        leaf,
        argvWithoutConfirmation(leaf, command, deps.sandboxDir, true),
        deps
      );
    }

    runs.set(leaf, run);
  }

  return runs;
}
