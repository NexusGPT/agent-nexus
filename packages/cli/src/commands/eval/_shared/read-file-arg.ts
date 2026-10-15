import fs from "node:fs";

import { refuse } from "../../../errors";

/**
 * Read a file named by a flag, refusing rather than throwing when the path is
 * not a readable file. Returns `undefined` on a refusal, which every caller
 * treats as "stop, the refusal has already been reported".
 *
 * 🔴 THE EXIT CODE IS ASSIGNED HERE, NOT LEFT TO THE CALLER. `refuse(...)`
 * RETURNS the code and discarding it leaves `process.exitCode` untouched, so a
 * missing `--criteria` / `--file` printed a refusal and exited 0 — a script
 * branching on the status read a rejected invocation as a success. This helper
 * is reached only from action handlers, so assigning it here is honest: unlike
 * a commander `argParser` (see `eval/run/_shared/flag-parsers.ts`), there is no
 * remaining work that would run on after the refusal.
 */
export function readFileArg(path: string): string | undefined {
  if (!fs.existsSync(path) || !fs.statSync(path).isFile()) {
    process.exitCode = refuse(`No such file: ${path}`);
    return undefined;
  }
  return fs.readFileSync(path, "utf-8");
}
