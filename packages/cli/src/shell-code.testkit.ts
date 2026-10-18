/**
 * The shell half of reading CODE, never prose about code: {@link shellCode}
 * blanks what bash does not run, so a presence pin over its output cannot be
 * satisfied by a comment, a heredoc or a multi-line string quoting the
 * statement. `source-code.testkit.ts` says how a pin uses it.
 *
 * It imports nothing outside this package's own testkits. The public mirror
 * ships every `packages/cli/src/` file, so a dependency here is one the mirror
 * has to be able to build.
 */

import type { PendingHeredoc, ShellContext } from "./shell-code-context.testkit";
import { shellCodeLine } from "./shell-code-line.testkit";

/**
 * Is this whole line a `#` comment — nothing but whitespace before the `#`?
 *
 * 🚨 THIS IS `isHashCommentLine` FROM `@nexus/types/testing/hash-comments`, AND
 * IT CANNOT BE IMPORTED FROM HERE. The public mirror ships every file under
 * `packages/cli/src/` and strips `@nexus/types` from the mirrored manifest, so an
 * import of it from this file is a bundle the mirror cannot build —
 * `mirror-manifests.spec.ts` refuses it by name.
 *
 * So the predicate is restated, and `shell-code.testkit.test.ts` holds it EQUAL
 * to the shared one over every line of the scripts these pins read. A drift
 * between the two reds there, not silently here.
 */
export function isShellCommentLine(line: string): boolean {
  return /^\s*#/.test(line);
}

/**
 * The CODE of a shell script, line for line: the result has exactly as many
 * lines as `text`, and every line bash does not run as code is blank or
 * shortened. It blanks:
 * - full-line `#` comments, which {@link isShellCommentLine} recognises;
 * - trailing `#` comments, where the `#` starts a word. The comment and the
 *   whitespace before it are cut, so `$` anchors still see the end of the code;
 * - heredoc bodies and their terminator lines, for `<<WORD`, `<<'WORD'`,
 *   `<<"WORD"` and `<<-WORD`. A `<<<` here-string is not a heredoc;
 * - the characters of a quoted string that sit on a line after the one it
 *   opened on. Its opening line is kept, because pins assert on quoted
 *   arguments like `"$transcript"`.
 *
 * To know where a comment or a string starts, it tracks `'…'`, `"…"`, `$'…'`,
 * `$(…)`, backquotes, `${…}` and `$((…))`. That is enough to read a `#` in
 * `$#`, `${x#y}`, `${x%% #*}` or `"a # b"` as code. A `run:` string from a
 * parsed workflow is already de-indented by YAML, so a heredoc inside it
 * terminates where the shell would end it.
 *
 * It fails in the LOUD direction. An unterminated heredoc or string blanks the
 * rest of the text, so a positive pin goes red rather than green.
 */
export function shellCode(text: string): string {
  const stack: ShellContext[] = [{ kind: "code", depth: 0 }];
  const heredocs: PendingHeredoc[] = [];
  return text
    .split("\n")
    .map((line, lineNo) => {
      const [heredoc] = heredocs;
      if (heredoc !== undefined) {
        const terminator = heredoc.stripTabs ? line.replace(/^\t+/, "") : line;
        if (terminator === heredoc.word) heredocs.shift();
        return "";
      }
      if (stack.length === 1 && isShellCommentLine(line)) return "";
      return shellCodeLine(line, lineNo, stack, heredocs);
    })
    .join("\n");
}
