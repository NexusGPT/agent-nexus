/**
 * Return `text` with every comment removed, so a textual scan reads only CODE.
 *
 * Newlines inside a block comment are kept, so line positions do not collapse.
 * Nothing else is altered: string, template and pattern contents are copied
 * through verbatim, because a module specifier IS a string literal and removing
 * it would delete the very thing a caller is looking for.
 *
 * ── TWO GATES SHARE THIS, AND THEY FAIL THE SAME WAY WITHOUT IT ─────────────
 *
 * Both scan a built artefact textually for a module specifier, and both are
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
    if (ch === "/" && !closesValue(lastSignificant)) {
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
      lastSignificant = "/";
      continue;
    }

    out += ch;
    if (!/\s/.test(ch)) lastSignificant = ch;
    i += 1;
  }
  return out;
}
