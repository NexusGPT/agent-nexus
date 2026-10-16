import { stripComments } from "../../../../scripts/_lib/strip-comments.mjs";

/**
 * Remove `//` and block comments from TypeScript source, leaving string,
 * template and pattern literals intact.
 *
 * Used by the structural specs that scan this package's own source. PROSE ABOUT
 * A SYMBOL IS NOT A USE OF IT: a docblock quoting an import line, or naming the
 * very method a guard demands a caller for, satisfies a raw text scan and makes
 * the guard pass on its own documentation. A check that counts the text
 * explaining it reports a floor it can never reach.
 *
 * It delegates to the repository's one comment stripper,
 * `scripts/_lib/strip-comments.mjs`, so the CLI's specs and the build gates read
 * code by the same state machine. A walk that tracks quotes and nothing else
 * reads the inside of a pattern literal as a comment opener — `/"/` opens a
 * string that swallows the following lines, and `/\/*\//` opens a block comment
 * that runs to the next `*\/` in the file — so it deletes real code and the
 * scan above it reports an absence. Newlines inside a block comment are kept,
 * so a line counted on the output is the line in the file.
 *
 * Only this package's SPECS import it. `src/index.ts` never reaches it, so tsup
 * does not bundle it and nothing under `scripts/` enters the published CLI.
 *
 * NOT every scanner should use it. `src/wire-types-bundle.test.ts` deliberately
 * scans comments too, and the two guards fail in opposite directions: a false
 * positive there costs a reword, while a false NEGATIVE ships `@nexus/types`
 * inside the published CLI. Do not "harmonise" that one onto this helper.
 */
export function stripTsComments(source: string): string {
  return stripComments(source);
}
