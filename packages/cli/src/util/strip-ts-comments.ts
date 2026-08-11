/**
 * Remove `//` and block comments from TypeScript source, leaving string and
 * template literals intact.
 *
 * Used by the structural specs that scan this package's own source. PROSE ABOUT
 * A SYMBOL IS NOT A USE OF IT: a docblock quoting an import line, or naming the
 * very method a guard demands a caller for, satisfies a raw text scan and makes
 * the guard pass on its own documentation. A check that counts the text
 * explaining it reports a floor it can never reach.
 *
 * It tracks quotes rather than stripping `//` blindly, because a naive strip
 * eats the tail of any string containing a URL.
 *
 * NOT every scanner should use it. `src/wire-types-bundle.test.ts` deliberately
 * scans comments too, and the two guards fail in opposite directions: a false
 * positive there costs a reword, while a false NEGATIVE ships `@nexus/types`
 * inside the published CLI. Do not "harmonise" that one onto this helper.
 */
export function stripTsComments(source: string): string {
  let out = "";
  let i = 0;
  let quote: string | null = null;
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    if (quote !== null) {
      if (ch === "\\") {
        out += `${ch}${next ?? ""}`;
        i += 2;
        continue;
      }
      if (ch === quote) quote = null;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === "/" && next === "/") {
      while (i < source.length && source[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}
