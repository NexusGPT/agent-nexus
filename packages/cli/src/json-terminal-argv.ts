// ---------------------------------------------------------------------------
// Reading `--json` off the RAW tokens, before and beside commander's parse.
// ---------------------------------------------------------------------------

import type { Command } from "commander";

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
 * The argv commander recorded, for the belt half of `jsonActive`.
 *
 * `rawArgs` is not in commander's typings (13.1.0) — the same assertion
 * `errors.ts` documents. It is set in `_prepareUserArgs`, so it is populated for
 * every refusal and every help render, and it covers the case where somebody
 * drives a subcommand's `parseAsync` directly rather than the root's.
 */
export function readRawArgs(program: Command): readonly unknown[] {
  const recorded: unknown = (program as Command & { rawArgs?: unknown }).rawArgs;
  return Array.isArray(recorded) ? recorded : [];
}
