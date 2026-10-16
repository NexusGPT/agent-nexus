import type { Command } from "commander";

import { applyDeprecationNotices } from "./deprecation-notice";
import { installArgumentRefusalReporting } from "./errors";
import { applyJsonShapeHelpLine } from "./json-shape-help";
import { installJsonTerminalContract } from "./json-terminal-contract";
import { applyKnownIssuesHelpLine } from "./known-issues-help";
import { applyProbeBarrierHelpLine } from "./probe-barrier-help";
import { applyBodySatisfiesRequired } from "./util/body-satisfies-required";
import { refuseMultipleStdinReaders } from "./util/one-stdin-reader";

/**
 * THE DECORATIONS THAT WALK THE FINISHED TREE.
 *
 * Every one of these needs the whole command tree to exist, so `index.ts` calls
 * this AFTER every namespace registrar. 🚨 THE ORDER INSIDE IS LOAD-BEARING and
 * each dependency is named at its own line below — this is a sequence, not a
 * set, and reordering it is a behaviour change with no test name on it.
 *
 * Walking the finished tree is also what keeps each of them free of a
 * participation list: a namespace landing tomorrow is decorated without an edit
 * to anything here.
 */
export function applyFinishedTreeDecorations(program: Command): void {
  // One stdin, one claimant. Registered BEFORE the seam below, because that
  // seam's pre-action hook reads --body and hooks run in registration order.
  refuseMultipleStdinReaders(program);

  // A required flag is satisfiable from --body. Runs LAST and walks the finished
  // tree, so it needs no cooperation from any command file and no list of
  // participating commands to keep current. See the module docblock.
  applyBodySatisfiesRequired(program);

  // Which of the five --json shapes each leaf prints. Walks the FINISHED tree
  // for the same reason as the two lines above, and reads a GENERATED map: the
  // shape is derived from the printer a command's action reaches, never
  // authored. A leaf the derivation cannot answer for carries no line at all.
  // See `json-shape-help.ts`.
  applyJsonShapeHelpLine(program);

  // The known-issues pointer, on every command's --help. Walks the FINISHED
  // tree, so it needs no list of participating commands; a namespace added
  // tomorrow carries the line without being registered anywhere. Static text —
  // `--help` must never touch the network. See `known-issues-help.ts`.
  applyKnownIssuesHelpLine(program);

  // Which of the notes above nobody can check for free. Walks the FINISHED tree
  // for the same reason as the line before it, and lands ABOVE the scope footer
  // so the global caveat stays last. See `probe-barrier.ts`.
  applyProbeBarrierHelpLine(program);

  // The announcement half of a deprecation cycle: a line on the leaf's own
  // `--help` and a warning on STDERR when it is invoked. Walks the FINISHED tree
  // for the same reason as the three lines above, so deprecating a command needs
  // no edit to the file that registers it. The stderr half is load-bearing —
  // stdout under `--json` is ONE document and the notice must never become the
  // breaking change it was meant to give a release of warning about. See
  // `deprecation-notice.ts`; `deprecation-cycle.ts` is the half that refuses a
  // removal which skipped this.
  applyDeprecationNotices(program);

  // An argument refusal becomes a throw, so it reaches `handleError` and emits
  // the error document the root epilogue promises. Walks the FINISHED tree for
  // the same reason as the two lines above, and for one more: commander copies
  // `_exitCallback` at subcommand CREATION, so a call on the root alone would
  // reach the root alone. See `installArgumentRefusalReporting`.
  installArgumentRefusalReporting(program);

  // `--json` holds on every way this process can TERMINATE, not only on the ones
  // that run an action. Walks the FINISHED tree for the same reason as the line
  // above, and must come after it: the stray-operand refusal it installs exits
  // through the callback that line registers. See `json-terminal-contract.ts`.
  installJsonTerminalContract(program);
}
