import fs from "node:fs";

import { refuse } from "../../../errors";

/**
 * Read a file named by a flag, refusing rather than throwing when the path is
 * not a readable file. Returns `undefined` on a refusal, which every caller
 * treats as "stop, the refusal has already been reported".
 */
export function readFileArg(path: string): string | undefined {
  if (!fs.existsSync(path) || !fs.statSync(path).isFile()) {
    refuse(`No such file: ${path}`);
    return undefined;
  }
  return fs.readFileSync(path, "utf-8");
}
