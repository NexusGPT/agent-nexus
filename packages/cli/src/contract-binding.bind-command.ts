import type { Command } from "commander";

import { boundArgument, boundOption, rememberCommand } from "./contract-binding.registry";
import type { BoundArgument, BoundOption } from "./contract-binding.types";
import {
  type ProjectedDescriptor,
  type RenderedOmission,
  renderFullContract,
  renderHelpBlock
} from "./contract-help.render";
import { EXIT_CODES } from "./exit-codes";
import { commandPath } from "./json-terminal-contract";
import { emitDocument, isJsonMode } from "./output";

/**
 * Declare which v1 descriptor a leaf command calls, and splice the generated
 * shape into its `--help`.
 *
 * 🚨 CALL THIS LAST IN THE CHAIN, after every `.option()` AND every
 * `.addArgument()`. It reads the command's own options and positionals to find
 * the divergences it must print, and either added afterwards is invisible to the
 * block it already rendered. `contract-binding.help-order.test.ts` captures the
 * RENDERED help of every bound command and refuses one whose generated block
 * prints above the command's own Examples or Notes, so getting the order wrong is
 * a red build rather than a quiet omission.
 *
 * ⚠️ `commands/contract-help.test.ts` CANNOT SEE THE ORDER, and reaching for it
 * is the trap — it is the gate for everything else here. Every arm in it reads
 * `boundCommand`, `cmd.options`, `argChoices` or `bodyOnly`: properties of the
 * FULLY BUILT command, byte-identical whichever order produced them, so no
 * assertion of that shape can refuse an order. Measured on commander 13.1.0 —
 * the two orders differ in the rendering and in nothing else. A docs page is no
 * substitute either: `cli-docs-are-generated.test.ts` compares a committed page
 * against a fresh projection, so a wrong order reds it as snapshot DRIFT and
 * regenerating the page clears the red with the defect still in the tree.
 *
 * Three things happen here, and the order decides all three:
 *   · the binding is recorded, so the gate can ask the question no flag can —
 *     does EVERY enum in this descriptor reach a flag, or is one silently
 *     undocumented?
 *   · the contract block is appended to the command's "after" help. Commander
 *     prints those in registration order, so calling this LAST puts the
 *     generated reference below the hand-written Examples and Notes — the half
 *     carrying the meaning a schema cannot hold;
 *   · `--print-contract` is added, the escape hatch from the readability rule —
 *     and bound first it lands at the TOP of the options table, ahead of the
 *     flags the command exists to offer.
 */
export function bindCommand(
  command: Command,
  shape: ProjectedDescriptor,
  bodyOnly: Readonly<Record<string, string>> = {}
): Command {
  rememberCommand(command, { shape, bodyOnly });

  const omissions = new Map<string, RenderedOmission>();
  const collect = (bound: BoundOption | BoundArgument | undefined): void => {
    if (!bound?.divergence) return;
    omissions.set(bound.source.path, {
      values: bound.divergence.omit ?? [],
      because: bound.divergence.because
    });
  };
  for (const option of command.options) collect(boundOption(option));
  // POSITIONALS TOO. A divergence declared on an argument renders into the same
  // block as one declared on a flag — an operator reading `--help` has no reason
  // to care which side of the command line a value is typed on.
  for (const argument of command.registeredArguments) collect(boundArgument(argument));

  const block = renderHelpBlock(shape, omissions);
  if (block !== "") command.addHelpText("after", `\n${block}`);

  command.option("--print-contract", "Print every field of the API contract behind this command");
  // 🚨 AN `option:` LISTENER, NOT A `preAction` HOOK, AND THE DIFFERENCE IS
  // WHETHER THE FLAG WORKS AT ALL ON HALF THE COMMANDS THAT OFFER IT.
  //
  // Commander enforces `.requiredOption()` inside `_parseCommand`, BEFORE any
  // action hook runs. So on `role create-job-type` — whose whole point is that
  // `--body` is required — `--print-contract` answered
  // `error: required option '--body <json>' not specified` and exited 1, while
  // the block right above it printed *"Use --print-contract for the full list"*.
  // A false instruction in shipped output, on the one route whose nested fields
  // are reachable NOWHERE else: the summary hides `parts[].unit`, and a caller
  // who cannot see it cannot compose a body the server accepts.
  //
  // `option:<name>` is emitted during option parsing, which is upstream of that
  // check — the same place `--help` and `--version` take their exits. Reading it
  // here also makes the flag independent of whether the command has an action at
  // all. Pinned by `contract-binding.print-contract.test.ts`, whose control is a
  // command with NO required option: it must print either way, so a green there
  // cannot come from the flag being broken in both.
  command.on("option:print-contract", () => {
    // 🚨 A TERMINAL PATH THAT EXITS 0, SO IT OWES `--json` A DOCUMENT.
    //
    // This wrote straight to `process.stdout`, which is BELOW commander's
    // `_outputConfiguration.writeOut` — the one door `json-terminal-contract.ts`
    // owns — so the contract could not reach it. Measured on the built binary at
    // 0.26.0: `nexus agent list --print-contract --json` printed 196 bytes of
    // prose and exited 0, on each of the 177 commands that declare this flag.
    //
    // `isJsonMode()` is already correct here, and that is the payoff of resolving
    // the mode from argv BEFORE the parse: an `option:` listener fires during
    // option parsing, upstream of every hook, and the old `preAction` resolution
    // would still have been reading `false` at this line.
    const text = renderFullContract(shape);
    if (isJsonMode()) {
      emitDocument({ contract: { command: commandPath(command), text } });
    } else {
      process.stdout.write(`${text}\n`);
    }
    process.exit(EXIT_CODES.success);
  });

  return command;
}
