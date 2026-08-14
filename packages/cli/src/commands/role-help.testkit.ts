import { Command } from "commander";

import { registerRoleCommands } from "./role";

/**
 * READING `nexus role`'s HELP THE WAY A CALLER READS IT.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS IS ONE FILE AND NOT A HELPER PER TEST
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Three tests now assert something about this namespace's help, and each of them
 * has to get the SAME non-obvious thing right first. Two carried their own copy;
 * the third was written with `helpInformation()` and **passed against a command
 * whose entire Notes block had been replaced with the false sentence the test
 * existed to forbid.** That mutation was caught by running it, not by reading —
 * which is the whole argument for putting the trap in one place and pinning it.
 *
 * 🚨 `outputHelp()`, NEVER `helpInformation()`. Only `outputHelp()` runs the
 * `addHelpText("after")` handlers, and in this namespace EVERY statement worth
 * asserting on lives in one: the Notes blocks, the Examples, the shared
 * job-model and working-year disclaimers. `helpInformation()` renders the
 * description, the usage line and the flag table, and stops. A test built on it
 * is green over a deleted paragraph.
 *
 * {@link roleHelpIsRendered} is the guard on that sentence: it asserts the two
 * renderings DISAGREE on a command known to carry a Notes block, so a future
 * commander release that folds the handlers into `helpInformation()` reddens
 * here — where the reason is written down — rather than quietly making this
 * file's docblock false.
 */

/** Every `nexus role` subcommand, derived from the registrar rather than typed. */
export function roleSubcommands(): readonly Command[] {
  const program = new Command();
  program.name("nexus").exitOverride();
  registerRoleCommands(program);

  const group = program.commands.find((cmd) => cmd.name() === "role");
  if (!group) throw new Error("registerRoleCommands registered no `role` command");
  return group.commands;
}

/** One subcommand, by name, from a registrar freshly run. */
export function roleSubcommand(name: string): Command {
  const command = roleSubcommands().find((cmd) => cmd.name() === name);
  if (!command) throw new Error(`No such command: nexus role ${name}`);
  return command;
}

/** The bytes a caller reads — description, flags, Examples and Notes. */
export function roleHelpText(command: Command): string {
  const chunks: string[] = [];
  command.configureOutput({
    writeOut: (str: string) => chunks.push(str),
    writeErr: (str: string) => chunks.push(str)
  });
  command.outputHelp();
  return chunks.join("");
}

/**
 * Help text is hard-wrapped by hand AND by commander, so every comparison is
 * made on one line.
 *
 * Without this a correct sentence fails on a line break somebody moved, which is
 * the kind of red that gets a test deleted. It is also what lets a pattern span
 * a wrap — the working-year fallback claim wrapped mid-phrase, and an unflattened
 * scan would have missed it for the same reason `helpInformation()` did.
 */
export function flatHelp(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * The negative control for {@link roleHelpText}: proves the two renderings
 * differ, on a command that really does carry an `addHelpText` block.
 *
 * Exported so each test can assert it beside its own population count. A sweep's
 * control proves the sweep ran; this one proves the sweep read the half of the
 * output that matters.
 */
export function roleHelpIsRendered(): { readonly full: string; readonly withoutHandlers: string } {
  const command = roleSubcommand("set-working-year");
  return { full: roleHelpText(command), withoutHandlers: command.helpInformation() };
}
