// ---------------------------------------------------------------------------
// The "typo reads as success" half: a namespace handed an operand that is not
// one of its children, at the moment help is about to render.
// ---------------------------------------------------------------------------

import type { Command } from "commander";

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
export function strayOperand(command: Command): string | undefined {
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
export function refuseStrayOperand(command: Command, operand: string): never {
  const withPrivate = command as Command & { unknownCommand?: () => never };
  if (typeof withPrivate.unknownCommand === "function") withPrivate.unknownCommand();
  command.error(`error: unknown command '${operand}'`, { code: "commander.unknownCommand" });
}
