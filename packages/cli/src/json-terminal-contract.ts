import type { Command, HelpContext } from "commander";

import { emitDocument, isJsonMode, setJsonMode } from "./output";

/**
 * `--json` HOLDS ON EVERY WAY THIS PROCESS CAN TERMINATE, NOT ONLY ON THE ONES
 * THAT RUN AN ACTION.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE DEFECT CLASS: A PATH THAT ENDS ABOVE THE HOOK CHAIN
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * JSON mode was decided in the root's `preAction` hook. Every terminal path that
 * ends BEFORE an action runs therefore never learned about `--json`, and each one
 * answered a machine with prose at exit 0. Measured on the shipped binary before
 * this module existed, `dist/index.js` at 0.26.0:
 *
 *   nexus --json --help           14915 bytes of ANSI-framed prose, exit 0
 *   nexus --json --version        "0.26.0", exit 0
 *   nexus --json zzznope --help   14915 bytes of ROOT HELP, exit 0
 *
 * The third is the expensive one and it is not a formatting complaint. A typo
 * READ AS SUCCESS: a script that shells out, checks the exit code and parses
 * stdout got exit 0 and a document-shaped absence, for a command that does not
 * exist. `installArgumentRefusalReporting` could not see any of the three,
 * because it returns on `exitCode === 0` — by construction, since turning
 * `--help` into an error would be worse.
 *
 * ── WHY THIS IS NOT THREE FIXES ──────────────────────────────────────────────
 *
 * Patching `--help`, `--version` and the unknown-command path one at a time
 * leaves the SHAPE reachable: the next terminal path anyone adds has the defect
 * again on the day it is written. So the fix is placed at the two seams commander
 * itself cannot route around:
 *
 *   1. JSON MODE IS RESOLVED FROM ARGV, BEFORE THE PARSE. {@link installJsonTerminalContract}
 *      wraps `parse` / `parseAsync`, so `isJsonMode()` is already true by the time
 *      commander looks at its first token. Nothing downstream can run "before"
 *      that, because there is nothing before a parse.
 *
 *   2. EVERY BYTE COMMANDER PUTS ON STDOUT GOES THROUGH ONE FUNCTION.
 *      `_outputConfiguration.writeOut` is commander 13.1.0's single stdout door:
 *      `version()` writes through it directly, and `outputHelp()` reaches it via
 *      `_getOutputContext`. Under `--json` this module owns that door, so a
 *      commander path that writes prose to stdout is unrepresentable rather than
 *      forbidden — including one added by a future commander release, which lands
 *      in the generic `{"output": …}` arm rather than escaping.
 *
 * ── WHAT IT STILL CANNOT REACH, SAID PLAINLY ─────────────────────────────────
 *
 * A COMMAND'S OWN `console.log`. Around forty command actions build their
 * document by hand rather than through a printer, and this module is not in that
 * path — `output.ts`'s `emitDocument` guard is not either, and says so. That half
 * is covered by gates: `json-one-document.test.ts` drives every LEAF, and
 * `json-contract-is-total.test.ts` drives the population that one skips. A gate
 * reports; only the two seams above make anything impossible.
 */

/**
 * Did this argv ask for JSON?
 *
 * A membership test on the RAW tokens, deliberately, and it is the same reading
 * `errors.ts` performs on `rawArgs` for a refusal. The parsed value cannot be
 * used: a root option whose value parser throws (`--timeout abc … --json`) aborts
 * the parse before `--json` is ever looked at, and that invocation is owed a
 * document like any other.
 *
 * `--` ends the option region, so a literal `--json` after it is an operand and
 * is not a request. The one over-reach that remains is deliberate: a `--json`
 * consumed as another option's VALUE reads as a request here. Handing a machine a
 * parseable document it did not ask for costs it nothing; handing it prose costs
 * it everything.
 */
export function argvRequestsJson(argv: readonly unknown[]): boolean {
  for (const token of argv) {
    if (typeof token !== "string") continue;
    if (token === "--") return false;
    if (token === "--json") return true;
  }
  return false;
}

/**
 * The full command line a command is reached by, e.g. `nexus agent list`.
 *
 * Walked from the command's own parent chain rather than passed in, so a caller
 * that only holds the leaf can still name it. One definition, because a document
 * keyed by a path somebody rebuilt differently is two vocabularies with one name.
 */
export function commandPath(command: Command): string {
  const names: string[] = [];
  let node: Command | null = command;
  while (node) {
    names.unshift(node.name());
    node = node.parent;
  }
  return names.join(" ");
}

/** The JSON document a `--help` screen becomes under `--json`. */
interface HelpDocument {
  readonly help: {
    /** The full command path, e.g. `nexus agent get`. */
    readonly command: string;
    /** The rendered help screen, verbatim, exactly as prose mode prints it. */
    readonly text: string;
  };
}

/**
 * Is this command a NAMESPACE whose first operand is not one of its children?
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 THIS IS THE "TYPO READS AS SUCCESS" HALF, AND IT IS NOT A `--json` BUG.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * commander's `_parseCommand` calls `_outputHelpIfRequested(parsed.unknown)`
 * (command.js:1567) BEFORE the `unknownCommand()` branch (command.js:1609). So
 * `nexus zzznope --help` prints the ROOT help and exits 0, with or without
 * `--json` — the unknown-command refusal is never reached, because help got there
 * first. Emitting that help as a JSON document would not fix it; it would ship the
 * same false success in a parseable wrapper.
 *
 * At the moment help is about to render, commander has already set `this.args`
 * (command.js:1538) and already failed to find a child for `args[0]`
 * (command.js:1540). So the stray operand is simply readable, with no argv
 * re-parsing and no duplication of commander's option arity rules.
 *
 * Two exclusions, both to avoid refusing a legitimate invocation:
 *   - a LEAF has no children, so its operands are its ARGUMENTS —
 *     `nexus agent get <id> --help` must still print help.
 *   - a command declaring positional arguments of its own is read the same way,
 *     even when it also has children. No command in this tree does both today,
 *     which is why this arm is a guard rather than a behaviour.
 */
function strayOperand(command: Command): string | undefined {
  if (command.commands.length === 0) return undefined;
  if ((command.registeredArguments ?? []).length > 0) return undefined;

  const args: readonly string[] = Array.isArray(command.args) ? command.args : [];
  const operand = args.find((arg) => !arg.startsWith("-"));
  if (operand === undefined) return undefined;

  const claimed = command.commands.some(
    (child) => child.name() === operand || child.aliases().includes(operand)
  );
  if (claimed) return undefined;

  // `nexus help <topic>` routes through the built-in help COMMAND, which is a
  // child of the command being helped and is matched above; this is the belt for
  // a tree that disabled it and still receives the word.
  return operand === "help" ? undefined : operand;
}

/**
 * Refuse a stray operand the way commander refuses one anywhere else.
 *
 * `unknownCommand()` is reached by name when it exists, because it carries the
 * "did you mean" suggestion the rest of the CLI already prints. `error()` is
 * public API and is the fallback, so a commander release that renames the private
 * method costs the suggestion and never the refusal.
 *
 * Either way the exit runs through `installArgumentRefusalReporting`, so under
 * `--json` the caller receives the documented `{"error":{…}}` envelope and exit 1
 * — the same shape every other refusal in this CLI produces.
 */
function refuseStrayOperand(command: Command, operand: string): never {
  const withPrivate = command as Command & { unknownCommand?: () => never };
  if (typeof withPrivate.unknownCommand === "function") withPrivate.unknownCommand();
  command.error(`error: unknown command '${operand}'`, { code: "commander.unknownCommand" });
}

/**
 * What one installed contract owns, shared by every command it reaches.
 *
 * `helpCapture` is non-null exactly while `outputHelp` is rendering, and it is
 * what separates commander's two stdout writers without inspecting their text:
 * inside a help render the bytes are a help screen, outside it the only writer
 * commander has left is `--version`.
 */
interface ContractState {
  readonly program: Command;
  helpCapture: string[] | null;
}

/**
 * 🚨 WHY THE STATE IS A `WeakMap` AND NOT A CLOSURE, AND WHY IDEMPOTENCE HAD TO
 *    BE BUILT RATHER THAN CLAIMED.
 *
 * The first version of this file held `helpCapture` in a closure and rewrapped
 * `outputHelp` on every install, with a docblock asserting "calling it twice is
 * harmless". It was not, and the failure was silent in the worst direction — a
 * WELL-FORMED, EMPTY document at exit 0:
 *
 *   install #1 wraps outputHelp over capture A.
 *   install #2 wraps that wrapper over capture B, and — because `configureOutput`
 *     keeps only the LATEST `writeOut` — the writer commander actually calls is
 *     #2's, which fills capture B.
 *   A `--json --help` then runs #2's wrapper, which runs #1's wrapper, which
 *     renders. Every byte lands in B. #1's `finally` fires FIRST and emits
 *     `{"help":{…,"text":""}}` — the empty one WINS stdout under `emitDocument`'s
 *     first-wins rule, and the real help is diverted to stderr behind it.
 *
 * So the wrapper is installed at most ONCE per command ({@link WRAPPED}), and it
 * reads its state THROUGH this map at call time rather than closing over it. A
 * second install then rewires — which is what makes it safe to call again after
 * registering more commands, the one reason anyone would.
 */
const CONTRACT = new WeakMap<Command, ContractState>();

/**
 * Commands whose `outputHelp` is already wrapped, and roots whose `parse` pair is.
 *
 * ⚠️ THESE TWO ARE DEFENSIVE, NOT THE FIX, AND THE DIFFERENCE IS MEASURED.
 * Mutating BOTH of them off — rewrapping on every install — leaves the
 * double-install spec GREEN, because the wrappers all read one shared state
 * through {@link CONTRACT} and the nested `finally` blocks then restore rather
 * than diverge. Mutating the WeakMap read back to a per-install closure fails it
 * immediately with `expected '' to contain 'Usage: nexus agent'`.
 *
 * They stay because an unbounded wrapper chain and a `strayOperand` check that
 * runs N times per help render are both waste, and because nesting is a hazard
 * that regrows the moment someone reintroduces closure state. They are not what
 * anyone should read as the repair.
 */
const WRAPPED = new WeakSet<Command>();

const PARSE_WRAPPED = new WeakSet<Command>();

/** Did this invocation ask for JSON, by mode or by the argv commander recorded? */
function jsonActive(state: ContractState): boolean {
  return isJsonMode() || argvRequestsJson(readRawArgs(state.program));
}

/**
 * Commander's ONE stdout door, under this CLI's ownership while `--json` is set.
 *
 * Reads the contract through {@link CONTRACT} rather than closing over it, so the
 * function a `configureOutput` call left behind can never be reading a state a
 * later install replaced.
 */
function writeCommanderOutput(command: Command, text: string): void {
  const state = CONTRACT.get(command);
  if (state === undefined || !jsonActive(state)) {
    process.stdout.write(text);
    return;
  }
  if (state.helpCapture !== null) {
    state.helpCapture.push(text);
    return;
  }

  // Outside a help render, commander 13.1.0 writes to stdout in exactly one
  // other place: the `--version` listener. Matched against the version the
  // program was BUILT with rather than assumed from position, so a future
  // commander stdout write lands in the honest generic arm below instead of
  // being mislabelled as a version.
  const declared = state.program.version();
  if (typeof declared === "string" && text.trim() === declared) {
    emitDocument({ version: declared });
    return;
  }
  emitDocument({ output: text.trim() });
}

/**
 * Install the terminal contract on a FINISHED program tree.
 *
 * ⚠️ IT MUST WALK, for the reason `installArgumentRefusalReporting` documents:
 * commander copies `_outputConfiguration` into a subcommand when that subcommand
 * is CREATED, so configuring the root alone reaches the root alone and every
 * `nexus <namespace> --help` would keep printing prose.
 *
 * Call it AFTER every `register*` has run. It is IDEMPOTENT, and idempotent by
 * construction rather than by promise — see {@link CONTRACT}.
 */
export function installJsonTerminalContract(program: Command): void {
  const state: ContractState = { program, helpCapture: null };

  const install = (command: Command, prefix: readonly string[]): void => {
    const path = [...prefix, command.name()];

    // Rewired on EVERY install, before the wrapper check below, so a second
    // install repoints an already-wrapped command at the current state instead
    // of leaving it reading a stale one.
    CONTRACT.set(command, state);
    command.configureOutput({ writeOut: (text: string) => writeCommanderOutput(command, text) });

    if (!WRAPPED.has(command)) {
      WRAPPED.add(command);

      // `outputHelp` is OVERLOADED in commander's typings — a `HelpContext`, or a
      // deprecated string callback. One implementation signature covers both, and
      // the assignment carries the overloaded type so no caller is widened.
      const renderHelp = command.outputHelp.bind(command) as (
        contextOptions?: HelpContext | ((str: string) => string)
      ) => void;

      const wrapped = (contextOptions?: HelpContext | ((str: string) => string)): void => {
        const current = CONTRACT.get(command);
        const stray = strayOperand(command);
        if (stray !== undefined) refuseStrayOperand(command, stray);

        // `{ error: true }` renders to STDERR — that is commander answering "no
        // command given", which already exits non-zero and already becomes the
        // error document. Capturing it would emit an empty help document beside
        // that one, which is two documents on one run.
        const toStderr = typeof contextOptions === "object" && contextOptions.error === true;
        if (current === undefined || !jsonActive(current) || toStderr) {
          renderHelp(contextOptions);
          return;
        }

        const outer = current.helpCapture;
        current.helpCapture = [];
        try {
          renderHelp(contextOptions);
        } finally {
          const text = (current.helpCapture ?? []).join("");
          current.helpCapture = outer;
          const document: HelpDocument = { help: { command: path.join(" "), text } };
          emitDocument(document);
        }
      };

      command.outputHelp = wrapped as Command["outputHelp"];
    }

    for (const child of command.commands) install(child, path);
  };

  install(program, []);

  // THE PARSE IS THE ONLY DOOR, SO IT IS WHERE THE MODE IS DECIDED.
  //
  // Reading `process.argv` here would be correct in the binary and invisible to
  // every gate, all of which drive `program.parseAsync(["node","nexus",…])` in
  // process. Wrapping the two entry points is the same fact in both worlds, and
  // it runs strictly before commander looks at a token — which is what makes
  // "resolved before any early-exit path" true rather than merely earlier.
  if (PARSE_WRAPPED.has(program)) return;
  PARSE_WRAPPED.add(program);

  const parse = program.parse.bind(program);
  const parseAsync = program.parseAsync.bind(program);

  program.parse = ((argv?: readonly string[], options?: unknown): Command => {
    if (argvRequestsJson(argv ?? process.argv)) setJsonMode(true);
    return parse(argv as string[] | undefined, options as never);
  }) as Command["parse"];

  program.parseAsync = ((argv?: readonly string[], options?: unknown): Promise<Command> => {
    if (argvRequestsJson(argv ?? process.argv)) setJsonMode(true);
    return parseAsync(argv as string[] | undefined, options as never);
  }) as Command["parseAsync"];
}

/**
 * The argv commander recorded, for the belt half of {@link jsonActive}.
 *
 * `rawArgs` is not in commander's typings (13.1.0) — the same assertion
 * `errors.ts` documents. It is set in `_prepareUserArgs`, so it is populated for
 * every refusal and every help render, and it covers the case where somebody
 * drives a subcommand's `parseAsync` directly rather than the root's.
 */
function readRawArgs(program: Command): readonly unknown[] {
  const recorded: unknown = (program as Command & { rawArgs?: unknown }).rawArgs;
  return Array.isArray(recorded) ? recorded : [];
}
