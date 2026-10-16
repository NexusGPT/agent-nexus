/**
 * Slicing a command file into the regions the refusal gate reads.
 *
 * Crude on purpose, the alternative being a TypeScript program. Every
 * imprecision below is chosen to widen the scan rather than narrow it: a slice
 * that ends late makes the gate read MORE text and risks a false finding
 * somebody can see and argue with, where a slice that ends early makes it read
 * less and the miss is silent.
 *
 * ⚠️ These helpers decide what the gate's population IS, and they decide it
 * from SOURCE TEXT — not from a file list and not from a path key. So they are
 * unaffected by where any source file sits; what breaks them is a command
 * stopping being written as `.command(…).option(…).action(…)`.
 */

/**
 * Slice out each `.action(` callback body by brace matching. Braces inside
 * strings and comments can end a slice late, which widens the scan and never
 * narrows it: the safe side.
 */
export function actionBodies(source: string): Array<{ start: number; text: string }> {
  const out: Array<{ start: number; text: string }> = [];
  const marker = ".action(";
  let from = 0;
  for (;;) {
    const at = source.indexOf(marker, from);
    if (at === -1) return out;
    let depth = 0;
    let i = at + marker.length - 1;
    for (; i < source.length; i++) {
      const ch = source[i];
      if (ch === "(") depth++;
      else if (ch === ")") {
        depth--;
        if (depth === 0) break;
      }
    }
    out.push({ start: at, text: source.slice(at, i + 1) });
    from = i + 1;
  }
}

/**
 * Does the fluent chain this action terminates declare a JSON body flag?
 *
 * The chain runs from the nearest preceding `.command(` to the `.action(`, which
 * is how every command in this package is written.
 */
export function chainTakesJsonBody(source: string, actionStart: number): boolean {
  const commandAt = source.lastIndexOf(".command(", actionStart);
  if (commandAt === -1) return false;
  const chain = source.slice(commandAt, actionStart);
  return /\.option\(\s*"--(?:body|data) <json/.test(chain);
}

/** 1-based line number of a character offset, for reporting a finding by line. */
export const lineOf = (source: string, index: number): number =>
  source.slice(0, index).split("\n").length;
