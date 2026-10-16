// ---------------------------------------------------------------------------
// One installed contract's state, and commander's ONE stdout door under it.
// ---------------------------------------------------------------------------

import type { Command } from "commander";

import { argvRequestsJson, readRawArgs } from "./json-terminal-argv";
import { emitDocument, isJsonMode } from "./output-json-mode";

/**
 * What one installed contract owns, shared by every command it reaches.
 *
 * `helpCapture` is non-null exactly while `outputHelp` is rendering, and it is
 * what separates commander's two stdout writers without inspecting their text:
 * inside a help render the bytes are a help screen, outside it the only writer
 * commander has left is `--version`.
 */
export interface ContractState {
  readonly program: Command;
  helpCapture: string[] | null;
}

/**
 * 🚨 WHY THE STATE IS A `WeakMap` AND NOT A CLOSURE, AND WHY IDEMPOTENCE HAD TO
 *    BE BUILT RATHER THAN CLAIMED.
 *
 * The first version of this contract held `helpCapture` in a closure and
 * rewrapped `outputHelp` on every install, with a docblock asserting "calling it
 * twice is harmless". It was not, and the failure was silent in the worst
 * direction — a WELL-FORMED, EMPTY document at exit 0:
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
 * So the wrapper is installed at most ONCE per command (`WRAPPED` in
 * `json-terminal-install.ts`), and it reads its state THROUGH this map at call
 * time rather than closing over it. A second install then rewires — which is what
 * makes it safe to call again after registering more commands, the one reason
 * anyone would.
 */
export const CONTRACT = new WeakMap<Command, ContractState>();

/** Did this invocation ask for JSON, by mode or by the argv commander recorded? */
export function jsonActive(state: ContractState): boolean {
  return isJsonMode() || argvRequestsJson(readRawArgs(state.program));
}

/**
 * Commander's ONE stdout door, under this CLI's ownership while `--json` is set.
 *
 * Reads the contract through {@link CONTRACT} rather than closing over it, so the
 * function a `configureOutput` call left behind can never be reading a state a
 * later install replaced.
 */
export function writeCommanderOutput(command: Command, text: string): void {
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
