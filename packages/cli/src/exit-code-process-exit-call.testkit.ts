import { codeOnly } from "./exit-code-sources.testkit";
import type { ExitCategory } from "./exit-codes";

/** `.success` or `["not-found"]` — whichever way the source can spell the key. */
function categoryAccessor(category: ExitCategory): string {
  return /^[a-z][a-zA-Z0-9]*$/.test(category) ? `.${category}` : `["${category}"]`;
}

/**
 * `source` CALLS `process.exit(EXIT_CODES.<category>)` — in code, not in prose.
 *
 * 🚨 A RAW `includes` HERE LETS A DOCBLOCK STAND IN FOR THE PRODUCER.
 * `run-app-logs-follow.ts` quotes `process.exit(EXIT_CODES.interrupted)` in the
 * docblock above the call it describes, so a raw read found the category
 * produced with the call deleted. A producer check that a sentence satisfies
 * passes in the silent direction: it reports a category reachable that nothing
 * reaches.
 *
 * ⚠️ THE SOURCE IS READ TWICE, BECAUSE {@link codeOnly} ALONE LOSES A PRODUCER.
 * It answers WHERE code is, and it is what refuses a call spelled inside a
 * comment, a string or a template's text — generated source like
 * `version-check.refresh-script.ts` returns one. But it blanks string CONTENTS,
 * so the key of `EXIT_CODES["not-found"]` reads as spaces and a real producer
 * spelled that way would be lost. So the call is matched on the source as
 * written, and a match counts only where {@link codeOnly} still holds
 * `process.exit(EXIT_CODES` at the same offset; it keeps offsets, so both
 * readings describe the same characters.
 *
 * Once that head is code, the rest of the match is code or a string key and
 * never a comment, because the accessor follows the head directly and no
 * comment opens on `.` or `[`. So the name needs no comment blank of its own:
 * reading it from `blankComments` instead kills no mutant this read survives.
 */
export function callsProcessExitWith(source: string, category: ExitCategory): boolean {
  const call = `process.exit(EXIT_CODES${categoryAccessor(category)})`;
  const code = codeOnly(source);
  for (let at = source.indexOf(call); at !== -1; at = source.indexOf(call, at + 1)) {
    if (code.startsWith("process.exit(EXIT_CODES", at)) return true;
  }
  return false;
}
