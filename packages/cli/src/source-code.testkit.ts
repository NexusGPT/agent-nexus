import { readFileSync } from "node:fs";

import { shellCode } from "./shell-code.testkit";
import { stripTsComments } from "./util/strip-ts-comments";

/**
 * THE SOURCE PINS IN THIS PACKAGE READ CODE, NEVER PROSE ABOUT CODE.
 *
 * A spec that asserts a script CALLS something, or that a module WIRES
 * something, by matching the file's text is satisfied by a comment that quotes
 * the call. Deleting the call and leaving its words in a comment then reads
 * exactly like the call being there — and these pins guard a secret scan, two
 * guarded `source` lines, the network opt-out and the `--json` early return, so
 * the silent direction is the one that ships a leak.
 *
 * A shell pin is two steps, in this order: project, then anchor.
 *
 * 1. PROJECT. {@link shellCode} (`shell-code.testkit.ts`) keeps a script's code
 *    and blanks every line, or part of a line, that bash does not run as code:
 *    - a full-line `#` comment;
 *    - a trailing `#` comment, where the `#` opens a word;
 *    - a heredoc body and its terminator line;
 *    - the lines of a quoted string after the line it opened on.
 *    A heredoc line and a string's second line both START a line, so the
 *    anchor below cannot refuse them on its own: they are what step 1 is for.
 *    `//` and block comments go through the shared JS/TS stripper.
 *
 * 2. ANCHOR. {@link atStatement} requires the pinned statement to be the FIRST
 *    thing on its line. A carrier that shares a line with code is always
 *    preceded by the code it replaced.
 *
 * ⚠️ The shell ceiling is a string on ONE line. A pinned statement quoted on the
 * line that opens the string (`echo 'scan_out=…'`) survives, because blanking it
 * would erase the quoted arguments real pins assert on. The anchor still refuses
 * it whenever code precedes the quote on that line.
 *
 * A TS pin read through {@link sourceCode} is satisfied by a string quoting its
 * code: the JS/TS stripper keeps strings, for the same reason. A TS pin that a
 * string must not satisfy reads the file as written and matches through
 * `includesInCode` / `matchesInCode` from `scripts/_lib/strip-comments.mjs`, which
 * keeps a match only where its head is code and still reads the pinned arguments
 * after it.
 */

/**
 * The file's CODE, with blank lines removed. A `.sh` path goes through
 * {@link shellCode}, anything else through the JS/TS stripper.
 */
export function sourceCode(path: string): string {
  const source = readFileSync(path, "utf8");
  const lines = path.endsWith(".sh")
    ? shellCode(source).split("\n")
    : stripTsComments(source).split("\n");
  return lines.filter((line) => line.trim() !== "").join("\n");
}

/**
 * `statement`, matched only where it OPENS a line: indentation, then the
 * statement. Multiline, whatever flags the pattern already carries.
 */
export function atStatement(statement: RegExp): RegExp {
  const flags = statement.flags.includes("m") ? statement.flags : `${statement.flags}m`;
  return new RegExp(`^[ \\t]*(?:${statement.source})`, flags);
}

/**
 * The `if` block that `opener` starts, through its closing `fi`, or `""` when
 * `opener` is not at statement position in `code`. Empty is the refusal: every
 * assertion a caller makes on the block then fails by name.
 */
export function guardedBlock(code: string, opener: RegExp): string {
  const at = code.search(atStatement(opener));
  if (at === -1) return "";
  const block = code.slice(at);
  const end = block.indexOf("\nfi");
  return end === -1 ? "" : block.slice(0, end + 3);
}

/** `sweep.sh` hands the secret scanner STDOUT, and nothing else. */
export const SWEEP_SCANS_STDOUT = atStatement(
  /scan_out=\$\(printf '%s' "\$out" \| python3 "\$SCRIPT_DIR\/scan-response\.py"/
);

/** `sweep.sh` and `seed-sweep-fixtures.sh` match a policy refusal on BOTH streams. */
export const POLICY_REFUSAL_ON_TRANSCRIPT = atStatement(
  /if is_policy_refusal "\$transcript"; then/
);
