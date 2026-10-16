import type { Command } from "commander";

import { CliArgumentError } from "./cli-argument-error";
import { argvRequestsJson } from "./json-terminal-contract";
import { isJsonMode, setJsonMode } from "./output";

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

/**
 * Route every commander refusal in the tree through `handleError`.
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
