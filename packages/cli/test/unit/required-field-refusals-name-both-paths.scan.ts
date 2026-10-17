import {
  blankComments,
  blankCommentsAndLiterals
} from "../../../../scripts/_lib/strip-comments.mjs";

/**
 * Slicing a command file into the regions the refusal gate reads.
 *
 * Crude on purpose, the alternative being a TypeScript program. What keeps it
 * honest is that it never reads RAW source: it reads two projections from the
 * repository's one JS/TS lexer, `scripts/_lib/strip-comments.mjs`, and both keep
 * every offset and every line break, so a position in either is the same
 * position in the file.
 *
 *   · `code` — comments AND the contents of every literal blanked. The
 *     STRUCTURE is read here: where `.action(` and `.command(` sit, and which
 *     paren closes which. A `.action(` written in a docblock, or a `"(("` inside
 *     a message, is not structure.
 *   · `text` — comments blanked, literals intact. The MESSAGES are read here,
 *     and the `--body <json` option string.
 *
 * 🔴 RAW SOURCE BLINDS THE GATE, AND IT DOES SO IN THE MISSING DIRECTION. One
 * unpaired `"` in prose — a docblock quoting `.option("--body <json` — inverts
 * quote parity for the rest of the file, so every "literal" the gate reads after
 * it is the CODE between two real strings and every real message goes unread.
 * `src/commands/credential/connect.command.ts` discusses this gate in its header and
 * was blind exactly that way: deleting `--body` from both of its refusals left
 * the gate reporting the tree clean.
 *
 * ⚠️ These helpers decide what the gate's population IS, and they decide it
 * from SOURCE TEXT — not from a file list and not from a path key. So they are
 * unaffected by where any source file sits; what breaks them is a command
 * stopping being written as `.command(…).option(…).action(…)`.
 */

/** One command file, read two ways at the same offsets. */
export interface CommandSource {
  /** Comments AND literal contents blanked: the structure. */
  readonly code: string;
  /** Comments blanked, literals intact: the messages. */
  readonly text: string;
}

export function projectCommandSource(source: string): CommandSource {
  return { code: blankCommentsAndLiterals(source), text: blankComments(source) };
}

/**
 * Slice out each `.action(` callback by paren matching on `code`, returning its
 * `text` at the same offsets. A slice that runs late, to the end of the file
 * for a callback that never closes, reads more text rather than less.
 */
export function actionBodies(source: CommandSource): Array<{ start: number; text: string }> {
  const out: Array<{ start: number; text: string }> = [];
  const { code, text } = source;
  const marker = ".action(";
  let from = 0;
  for (;;) {
    const at = code.indexOf(marker, from);
    if (at === -1) return out;
    let depth = 0;
    let i = at + marker.length - 1;
    for (; i < code.length; i++) {
      const ch = code[i];
      if (ch === "(") depth++;
      else if (ch === ")") {
        depth--;
        if (depth === 0) break;
      }
    }
    out.push({ start: at, text: text.slice(at, i + 1) });
    from = i + 1;
  }
}

/**
 * Does the fluent chain this action terminates declare a JSON body flag?
 *
 * The chain runs from the nearest preceding `.command(` to the `.action(`, which
 * is how every command in this package is written.
 */
export function chainTakesJsonBody(source: CommandSource, actionStart: number): boolean {
  const commandAt = source.code.lastIndexOf(".command(", actionStart);
  if (commandAt === -1) return false;
  const chain = source.text.slice(commandAt, actionStart);
  return /\.option\(\s*"--(?:body|data) <json/.test(chain);
}

/** 1-based line number of a character offset, for reporting a finding by line. */
export const lineOf = (source: string, index: number): number =>
  source.slice(0, index).split("\n").length;
