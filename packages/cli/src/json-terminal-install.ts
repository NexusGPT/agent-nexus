// ---------------------------------------------------------------------------
// Installing the contract: the help wrapper, the walk, and the parse seam.
// ---------------------------------------------------------------------------

import type { Command, HelpContext } from "commander";

import { wrapParseEntryPoints } from "./json-terminal-parse-seam";
import {
  CONTRACT,
  type ContractState,
  jsonActive,
  writeCommanderOutput
} from "./json-terminal-state";
import { refuseStrayOperand, strayOperand } from "./json-terminal-stray-operand";
import { emitDocument } from "./output-json-mode";

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
 * Commands whose `outputHelp` is already wrapped. `PARSE_WRAPPED` in
 * `json-terminal-parse-seam.ts` is the same guard for a root's `parse` pair and
 * cites this docblock for the reasoning, so the two stay one argument.
 *
 * ⚠️ THESE TWO ARE DEFENSIVE, NOT THE FIX, AND THE DIFFERENCE IS MEASURED.
 * Mutating BOTH of them off — rewrapping on every install — leaves the
 * double-install spec GREEN, because the wrappers all read one shared state
 * through `CONTRACT` and the nested `finally` blocks then restore rather
 * than diverge. Mutating the WeakMap read back to a per-install closure fails it
 * immediately with `expected '' to contain 'Usage: nexus agent'`.
 *
 * They stay because an unbounded wrapper chain and a `strayOperand` check that
 * runs N times per help render are both waste, and because nesting is a hazard
 * that regrows the moment someone reintroduces closure state. They are not what
 * anyone should read as the repair.
 */
const WRAPPED = new WeakSet<Command>();

/**
 * The `outputHelp` replacement for one command, reading its state at CALL time.
 *
 * `outputHelp` is OVERLOADED in commander's typings — a `HelpContext`, or a
 * deprecated string callback. One implementation signature covers both, and the
 * assignment carries the overloaded type so no caller is widened.
 */
function makeHelpWrapper(command: Command, path: readonly string[]): Command["outputHelp"] {
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

  return wrapped as Command["outputHelp"];
}

/** Point one command at `state`, wrap its help once, then recurse into children. */
function installOnCommand(command: Command, prefix: readonly string[], state: ContractState): void {
  const path = [...prefix, command.name()];

  // Rewired on EVERY install, before the wrapper check below, so a second
  // install repoints an already-wrapped command at the current state instead
  // of leaving it reading a stale one.
  CONTRACT.set(command, state);
  command.configureOutput({ writeOut: (text: string) => writeCommanderOutput(command, text) });

  if (!WRAPPED.has(command)) {
    WRAPPED.add(command);
    command.outputHelp = makeHelpWrapper(command, path);
  }

  for (const child of command.commands) installOnCommand(child, path, state);
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
 * construction rather than by promise — see `CONTRACT` in
 * `json-terminal-state.ts`.
 */
export function installJsonTerminalContract(program: Command): void {
  const state: ContractState = { program, helpCapture: null };

  installOnCommand(program, [], state);
  wrapParseEntryPoints(program);
}
