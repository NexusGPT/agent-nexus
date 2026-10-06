/**
 * Return `text` with every comment removed, so a textual scan reads only CODE.
 *
 * Newlines inside a block comment are kept, so line positions do not collapse.
 * Nothing else is altered: string, template and pattern contents are copied
 * through verbatim, because a module specifier IS a string literal and removing
 * it would delete the very thing a caller is looking for.
 *
 * ── THE BUILD GATES SHARE THIS, AND THEY FAIL THE SAME WAY WITHOUT IT ───────
 *
 * Two scan a built artefact textually for a module specifier, and both are
 * therefore blind to the difference between a specifier and a sentence ABOUT one.
 *
 * - `scripts/assert-published-imports.mjs` reads the published declarations and
 *   requires every specifier to resolve for a consumer. Measured against the
 *   SDK's own 112 declarations before this existed: two of the eight things it
 *   reported were English — a JSDoc `@example` line naming the package, and a
 *   sentence whose words happened to read as an import.
 * - `apps/backend/scripts/assert-dist-specifiers.mjs` reads the compiled backend
 *   and refuses a lazy load whose quoted argument starts with a workspace
 *   top-level directory, because SWC does not rewrite that argument and it
 *   reaches the artefact verbatim. SWC also PRESERVES COMMENTS into `dist`, so a
 *   docblock that merely QUOTES that anti-pattern — prose warning against it —
 *   failed the build with no defect anywhere in the file. Measured on a
 *   promotion: the flagged line was such a warning, and the gate's own prescribed
 *   remedy, convert it to a static import, was unwritable because there was no
 *   import to convert.
 *
 * A third reader scans SOURCE rather than an artefact:
 * `scripts/__tests__/admin-catalog-grants-are-served.spec.ts` discovers which
 * admin resource paths a guard or a gate names, and must not count a path that
 * only appears in a doc comment.
 *
 * A gate that reds on correct work is deleted by the first person it blocks, and
 * then the real defect flows again. That is why this is shared rather than copied:
 * one subtle state machine, one spec per consumer, no second copy to drift.
 *
 * ── WHY THIS CANNOT BE A REGEX ─────────────────────────────────────────────
 *
 * 🔴 The naive fix is to delete from `//` to end of line before scanning. It is
 * wrong in the direction that matters — it makes a gate SILENTLY WEAKER, which is
 * the whole failure class these gates exist to catch.
 *
 * A `//` is only a comment in one of the states a JavaScript file moves through,
 * and a regex cannot know which state it is in:
 *
 * - inside a STRING, `//` is data. A URL carries one, and deleting from there to
 *   end of line deletes any real specifier that follows it on that line — turning
 *   a genuine defect green.
 * - a BLOCK comment spans lines and can contain quotes, so a line-by-line pass
 *   re-enters the wrong state on every line of one.
 * - a TEMPLATE literal spans lines and can contain both comment openers.
 * - a PATTERN literal can contain quotes and an escaped `/` pair, so a walk that
 *   does not know about it can read the inside of a pattern as a comment opener.
 *
 * So the state is TRACKED one character at a time, which is what this does.
 *
 * ── The two deliberate conservatisms ───────────────────────────────────────
 *
 * `/` is ambiguous between division and the start of a pattern, and guessing
 * wrong is not free either way. Two choices keep every mis-read on the STRICT
 * side — scanning text that is not code is a false finding a reader can see,
 * while skipping text that IS code is a missed defect nobody sees:
 *
 * - a pattern may only begin where the last significant character cannot END a
 *   value. Where that is unclear the `/` is read as division, which leaves the
 *   region being scanned as code.
 * - a `/` written straight after `<` is never a pattern. In JSX it closes a tag,
 *   and a pattern read there copies the rest of the line through verbatim, so a
 *   comment after `</div>` would survive and be scanned as code. This walk is not a
 *   JSX parser: `//` inside JSX TEXT is still dropped as a comment, which hides a
 *   match and never invents one.
 * - an unterminated quoted string resynchronises at the newline too, since only a
 *   template literal can span a line. JSX text is the case that matters: the
 *   apostrophe in `Google's token` opens a string that, left alone, would carry
 *   to the next quote anywhere below and invert the state for the rest of the
 *   file, copying every later comment through.
 * - an unterminated pattern resynchronises at the newline, because a pattern
 *   cannot span a line. A bad guess therefore costs one line, never the rest of
 *   the file.
 *
 * A template literal is copied whole rather than parsed, so a `${...}`
 * substitution stays scannable. That is the strict direction too: real code
 * inside a substitution is still judged.
 *
 * Zero dependencies, plain `node`: both callers run as `node scripts/<name>.mjs`
 * with no tsx and no bundler, so anything imported here would have to be plain
 * `.mjs` as well.
 */

/**
 * @param {string} text JavaScript or TypeScript declaration source
 * @returns {string} the same text with comments removed
 */
export function stripComments(text) {
  let out = "";
  let i = 0;
  // The last character that decides whether a `/` divides or opens a regex.
  let lastSignificant = "";
  const closesValue = (ch) => /[)\]}\w$'"`]/.test(ch);

  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === "/" && next === "/") {
      while (i < text.length && text[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) {
        if (text[i] === "\n") out += "\n";
        i += 1;
      }
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      out += ch;
      i += 1;
      while (i < text.length) {
        if (text[i] === "\\") {
          out += text.slice(i, i + 2);
          i += 2;
          continue;
        }
        // Only a template can span a line. A quote that has not closed by the
        // newline was never a string: JSX text such as `Google's token` opens one.
        if (text[i] === "\n" && quote !== "`") break;
        out += text[i];
        if (text[i] === quote) {
          i += 1;
          break;
        }
        i += 1;
      }
      lastSignificant = quote;
      continue;
    }
    // A `/` straight after `<` is never a pattern: in JSX it closes a tag
    // (`</div>`, `</>`), and in TypeScript `a </b` is a comparison.
    if (ch === "/" && !closesValue(lastSignificant) && text[i - 1] !== "<") {
      // A regex literal. Copy it whole so its contents cannot be read as code.
      out += ch;
      i += 1;
      let inClass = false;
      while (i < text.length) {
        if (text[i] === "\\") {
          out += text.slice(i, i + 2);
          i += 2;
          continue;
        }
        if (text[i] === "[") inClass = true;
        else if (text[i] === "]") inClass = false;
        out += text[i];
        if (text[i] === "/" && !inClass) {
          i += 1;
          break;
        }
        if (text[i] === "\n") {
          // Not a regex after all — an unterminated one cannot span a line.
          i += 1;
          break;
        }
        i += 1;
      }
      // `lastSignificant` is left alone: a pattern only opens where it cannot end
      // a value, so it already holds a non-value character, and the body never
      // moves it.
      continue;
    }

    out += ch;
    if (!/\s/.test(ch)) lastSignificant = ch;
    i += 1;
  }
  return out;
}
