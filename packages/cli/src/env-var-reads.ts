import { blankComments, blankCommentsAndLiterals } from "../../../scripts/_lib/strip-comments.mjs";

/** `process.env.NEXUS_X` and `process.env["NEXUS_X"]`, in that order. */
const ENV_READ =
  /process\s*\.\s*env\s*(?:\.\s*(NEXUS_[A-Z0-9_]+)|\[\s*["'`](NEXUS_[A-Z0-9_]+)["'`]\s*\])/g;

/**
 * Every `NEXUS_*` variable ONE source text reads, sorted and without duplicates.
 *
 * 🔴 A SENTENCE ABOUT A READ IS NOT A READ. The gate asserts the declaration map
 * EQUALS this read-set, so a variable that stops being read must leave it. Matched
 * on raw text, a comment left where the read used to be (`// was:
 * process.env.NEXUS_X`) or a help string quoting the expression keeps the name in
 * the set, and the half of the gate that catches a dropped read passes over the
 * very edit it exists for. So the match runs on two projections of one walk,
 * `scripts/_lib/strip-comments.mjs`, which keep every offset:
 *
 *  - `blankComments` for the match itself. Comments are spaces, and string
 *    contents are KEPT, because `process.env["NEXUS_X"]` holds its name in a
 *    literal. Blanking literals before matching would delete that form outright.
 *  - `blankCommentsAndLiterals` to keep only a match whose `process` is CODE. Inside
 *    a string or template text it is blank there, so a literal quoting the
 *    expression is dropped. Code inside `${…}` stays code in both, so a read
 *    interpolated into a template still counts.
 *
 * The walk and not the TypeScript parse (`@nexus/types/testing/blank-comments-ts`):
 * this package has no `.tsx`, so JSX text, the one place the walk reads a comment
 * that is not one, cannot occur, and over every file this scan reads the two
 * projections are byte-identical.
 */
export function envVarNamesIn(source: string): string[] {
  const code = blankComments(source);
  const bare = blankCommentsAndLiterals(source);
  const found = new Set<string>();
  for (const match of code.matchAll(ENV_READ)) {
    if (!bare.startsWith("process", match.index)) continue;
    const name = match[1] ?? match[2];
    if (name !== undefined) found.add(name);
  }
  return [...found].sort();
}
