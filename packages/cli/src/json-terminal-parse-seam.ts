// ---------------------------------------------------------------------------
// Seam 1: the parse. JSON mode is resolved from argv before commander looks at
// its first token, so no terminal path can end "before" the mode was decided.
// ---------------------------------------------------------------------------

import type { Command } from "commander";

import { argvRequestsJson } from "./json-terminal-argv";
import { setJsonMode } from "./output-json-mode";

/** Roots whose `parse` pair is already wrapped. See `WRAPPED` for why it is here. */
const PARSE_WRAPPED = new WeakSet<Command>();

/**
 * THE PARSE IS THE ONLY DOOR, SO IT IS WHERE THE MODE IS DECIDED.
 *
 * Reading `process.argv` here would be correct in the binary and invisible to
 * every gate, all of which drive `program.parseAsync(["node","nexus",…])` in
 * process. Wrapping the two entry points is the same fact in both worlds, and
 * it runs strictly before commander looks at a token — which is what makes
 * "resolved before any early-exit path" true rather than merely earlier.
 *
 * Wrapping at most once per root, for the reason `WRAPPED` in
 * `json-terminal-install.ts` records: an unbounded wrapper chain is waste, and
 * nesting is the hazard that produced the empty-document defect.
 */
export function wrapParseEntryPoints(program: Command): void {
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
