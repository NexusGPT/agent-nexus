/**
 * Three projections of JavaScript or TypeScript source, from ONE walk, so a textual
 * scan reads only CODE.
 *
 * - `stripComments` REMOVES every comment. Newlines inside a block comment are
 *   kept, so line positions do not collapse. Nothing else is altered: string,
 *   template and pattern contents are copied through verbatim, for a caller that
 *   needs a literal's TEXT (a path, a key) but must not read prose as code.
 * - `blankComments` replaces every comment with spaces and copies every literal
 *   through verbatim. Line breaks and every offset stay where they were, so it is
 *   `stripComments` for a caller that reports a column or reads two projections at
 *   one offset — a module specifier is a string, and an edge scan must still see it.
 * - `blankCommentsAndLiterals` replaces every comment AND the contents of every
 *   string, template text and pattern with spaces. Delimiters, `${`, `}`, line
 *   breaks and every offset stay where they were, so a match found in the
 *   projection names the same span in the original.
 *
 * And one question asked of them: is a match AT A CODE POSITION? `matchesInCode`,
 * `firstMatchInCode`, `includesInCode` and `codePositionsOf` match on the text as
 * written and keep a match only where the code projection still holds its head —
 * so a comment or a string quoting the code cannot stand in for it, while a pinned
 * string argument after the head is still read. They also read plain CSS. The
 * section above `codePositionsOf` says how, and `strip-comments.fixtures.mjs` is the
 * table every position check is held to.
 *
 * ── THE BUILD GATES SHARE THIS, AND THEY FAIL THE SAME WAY WITHOUT IT ───────
 *
 * Two scan a built artefact textually for a module specifier, and a textual scan
 * cannot tell a specifier from a sentence ABOUT one — in a comment, or in a
 * string.
 *
 * - `scripts/assert-published-imports.mjs` reads the published declarations and
 *   requires every specifier to resolve for a consumer.
 * - `apps/backend/scripts/assert-dist-specifiers.mjs` reads the compiled backend
 *   and refuses a lazy load whose quoted argument starts with a workspace
 *   top-level directory, because SWC does not rewrite that argument and it
 *   reaches the artefact verbatim.
 *
 * SWC PRESERVES COMMENTS into `dist`, and both artefacts carry string data: help
 * text, child-process source, sandbox scripts, scanner fixtures. A keyword next
 * to a quote occurs in all of them. Measured on the published CLI bundle,
 * help text such as `the difference from "fail"` read as five imports of packages
 * named `fail`, `mark-failed`, `nobody`, `lines` and `tasks`, and the gate refused
 * a correct build. So each gate matches its KEYWORD on
 * `blankCommentsAndLiterals` output, where a quote that opens a real literal is
 * still a quote and everything inside one is blank, and reads the quoted
 * specifier out of the ORIGINAL text at the same offsets. A specifier IS a string
 * literal, so blanking the text and then matching on it alone would delete the
 * very thing the gate is looking for.
 *
 * Other readers scan SOURCE rather than an artefact through `stripComments` —
 * `scripts/__tests__/admin-catalog-grants-are-served.spec.ts` discovers which
 * admin resource paths a guard or a gate names, and must not count a path that
 * only appears in a doc comment.
 *
 * A gate that reds on correct work is deleted by the first person it blocks, and
 * then the real defect flows again. That is why this is shared rather than copied:
 * one subtle state machine, one spec per consumer, no second copy to drift. All three
 * projections are built from the same list of regions, so they cannot disagree
 * about where a comment or a literal is — which is what lets a caller match on
 * `blankCommentsAndLiterals` and read the text at that offset out of
 * `blankComments`.
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
 * So the state is TRACKED one character at a time, which is what this does. The
 * OUTPUT is not built that way: the walk records each comment and each literal's
 * contents as a REGION, and a projection slices the text between regions out
 * whole. Appending one character at a time builds a chain of one-character string
 * nodes per input character, which exhausted a test worker's heap over a
 * ~29k-file corpus.
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
 * A pattern also begins after a KEYWORD that cannot end a value — `return`,
 * `typeof`, `case` and the rest of `PATTERN_KEYWORDS`. Each ends in a word
 * character, so the character rule alone reads the `/` after `return` as
 * division; a pattern there whose body holds an escaped slash followed by a star
 * then opens a block comment that swallows code up to the next block closer. A
 * keyword reached through `.` is a property (`a.in / 2`), so it still divides.
 *
 * A template literal's TEXT is a literal; its `${...}` substitutions are walked as
 * code. That is the strict direction too: real code inside a
 * substitution is still judged, and a comment there is still a comment. A
 * substitution can hold strings and templates of its own, nested to any depth, so
 * the walk keeps one open-brace count per substitution it is inside and returns
 * to the template only at the `}` that closes it. Copying a template "whole" up
 * to its next backtick is wrong the moment a substitution holds a template: that
 * backtick is the nested OPENER, the state inverts, and the rest of the file is
 * read inside out — a URL's `//` in a later template drops the line after it.
 *
 * ── What blanking leaves alone ────────────────────────────────────────────
 *
 * Only a literal that CLOSES is blanked, so every misread is bounded and fails
 * toward scanning text as code, never toward hiding code:
 *
 * - a quote that never closes on its line was never a string, and its line stays
 *   as written;
 * - a pattern that never closes on its line was never a pattern, likewise;
 * - template text that runs to the end of the file never closed, and stays as
 *   written.
 *
 * A block comment that never closes is a comment to the end of the file in both
 * projections — that is what JavaScript reads it as.
 *
 * Zero dependencies, plain `node`: both gates run as `node scripts/<name>.mjs`
 * with no tsx and no bundler, so anything imported here would have to be plain
 * `.mjs` as well. The file is mirrored to the public repository with them.
 */

/**
 * Keywords after which a `/` opens a pattern. Each ends in a word character, so
 * the character rule alone reads the `/` after it as division.
 */
const PATTERN_KEYWORDS = new Set([
  "return",
  "typeof",
  "instanceof",
  "case",
  "default",
  "do",
  "else",
  "in",
  "of",
  "new",
  "delete",
  "void",
  "throw",
  "yield",
  "await"
]);

/**
 * Every comment, and the contents of every literal that closes, as `[start, end,
 * kind]` regions in source order. `kind` is `"comment"` or `"literal"`. A
 * literal region excludes its delimiters; `end` may run past `text.length` for a
 * construct the file never closes, and `slice` clamps it.
 *
 * @param {string} text JavaScript or TypeScript source
 * @returns {Array<[number, number, "comment" | "literal"]>}
 */
function regionsOf(text) {
  /** @type {Array<[number, number, "comment" | "literal"]>} */
  const regions = [];
  let i = 0;
  // The last character that decides whether a `/` divides or opens a regex, and
  // where it sits, so a word ending there can be read whole.
  let lastSignificant = "";
  let lastSignificantAt = -1;
  // One entry per `${...}` substitution the walk is inside, innermost last: the
  // number of `{` opened in it and not yet closed. The `}` met at a count of zero
  // closes the substitution and returns the walk to that template's text.
  /** @type {number[]} */
  const substitutions = [];
  const closesValue = (ch) => /[)\]}\w$'"`]/.test(ch);
  /** The word ending at the last significant character, or "" after a property dot. */
  const lastWord = () => {
    let start = lastSignificantAt;
    while (start > 0 && /[\w$]/.test(text[start - 1])) start -= 1;
    return text[start - 1] === "." ? "" : text.slice(start, lastSignificantAt + 1);
  };
  const slashOpensPattern = () => {
    // A `/` straight after `<` is never a pattern: in JSX it closes a tag
    // (`</div>`, `</>`), and in TypeScript `a </b` is a comparison.
    if (text[i - 1] === "<") return false;
    if (!closesValue(lastSignificant)) return true;
    return /[\w$]/.test(lastSignificant) && PATTERN_KEYWORDS.has(lastWord());
  };
  /**
   * Walk a template's text from `i`, just past its opening backtick or past the
   * `}` that closed a substitution, to its closing backtick or its next `${`.
   * Text that runs to the end of the file never closed and is not a region.
   */
  const walkTemplateText = () => {
    const textStart = i;
    while (i < text.length) {
      if (text[i] === "\\") {
        i += 2;
        continue;
      }
      if (text[i] === "`") {
        regions.push([textStart, i, "literal"]);
        i += 1;
        lastSignificant = "`";
        return;
      }
      if (text[i] === "$" && text[i + 1] === "{") {
        regions.push([textStart, i, "literal"]);
        i += 2;
        substitutions.push(0);
        lastSignificant = "{";
        lastSignificantAt = i - 1;
        return;
      }
      i += 1;
    }
  };

  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === "/" && next === "/") {
      const start = i;
      while (i < text.length && text[i] !== "\n") i += 1;
      regions.push([start, i, "comment"]);
      continue;
    }
    if (ch === "/" && next === "*") {
      const start = i;
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i += 1;
      i += 2;
      regions.push([start, i, "comment"]);
      continue;
    }
    if (ch === "`") {
      i += 1;
      walkTemplateText();
      continue;
    }
    if (substitutions.length > 0 && (ch === "{" || ch === "}")) {
      const innermost = substitutions.length - 1;
      if (ch === "}" && substitutions[innermost] === 0) {
        substitutions.pop();
        i += 1;
        walkTemplateText();
        continue;
      }
      substitutions[innermost] += ch === "{" ? 1 : -1;
    }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      i += 1;
      const bodyStart = i;
      while (i < text.length) {
        if (text[i] === "\\") {
          i += 2;
          continue;
        }
        // Only a template can span a line. A quote that has not closed by the
        // newline was never a string: JSX text such as `Google's token` opens one.
        if (text[i] === "\n") break;
        if (text[i] === quote) {
          regions.push([bodyStart, i, "literal"]);
          i += 1;
          break;
        }
        i += 1;
      }
      lastSignificant = quote;
      continue;
    }
    if (ch === "/" && slashOpensPattern()) {
      // A regex literal. Skip it whole so its contents cannot be read as code.
      i += 1;
      const bodyStart = i;
      let inClass = false;
      while (i < text.length) {
        if (text[i] === "\\") {
          i += 2;
          continue;
        }
        if (text[i] === "[") inClass = true;
        else if (text[i] === "]") inClass = false;
        if (text[i] === "/" && !inClass) {
          regions.push([bodyStart, i, "literal"]);
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
      // `lastSignificant` is left alone and the body never moves it. A `/` can
      // only follow a pattern directly in `/a/ / b`, which no program writes.
      continue;
    }

    if (!/\s/.test(ch)) {
      lastSignificant = ch;
      lastSignificantAt = i;
    }
    i += 1;
  }
  return regions;
}

/**
 * @param {string} text JavaScript or TypeScript declaration source
 * @returns {string} the same text with comments removed
 */
export function stripComments(text) {
  /** @type {string[]} */
  const chunks = [];
  let kept = 0;
  for (const [start, end, kind] of regionsOf(text)) {
    if (kind !== "comment") continue;
    chunks.push(text.slice(kept, start));
    // A block comment's newlines stay, so the lines below it keep their numbers.
    if (text[start + 1] === "*") chunks.push(text.slice(start, end).replace(/[^\n]/g, ""));
    kept = end;
  }
  chunks.push(text.slice(kept));
  return chunks.join("");
}

/**
 * @param {string} text JavaScript or TypeScript source
 * @returns {string} the same text, the same length, with every comment replaced by
 *   spaces. String, template and pattern contents are copied through. Line breaks
 *   inside a comment stay.
 */
export function blankComments(text) {
  /** @type {string[]} */
  const chunks = [];
  let kept = 0;
  for (const [start, end, kind] of regionsOf(text)) {
    if (kind !== "comment") continue;
    chunks.push(text.slice(kept, start));
    chunks.push(text.slice(start, end).replace(/[^\r\n]/g, " "));
    kept = end;
  }
  chunks.push(text.slice(kept));
  return chunks.join("");
}

/**
 * `text` with every region replaced by spaces, line breaks kept, so every offset
 * names the same character in both.
 *
 * @param {string} text
 * @param {Array<[number, number, "comment" | "literal"]>} regions in source order
 * @returns {string}
 */
function blankRegions(text, regions) {
  /** @type {string[]} */
  const chunks = [];
  let kept = 0;
  for (const [start, end] of regions) {
    chunks.push(text.slice(kept, start));
    chunks.push(text.slice(start, end).replace(/[^\r\n]/g, " "));
    kept = end;
  }
  chunks.push(text.slice(kept));
  return chunks.join("");
}

/**
 * @param {string} text JavaScript or TypeScript source
 * @returns {string} the same text, the same length, with every comment and the
 *   contents of every closed string, template text and pattern replaced by
 *   spaces. Line breaks inside them stay.
 */
export function blankCommentsAndLiterals(text) {
  return blankRegions(text, regionsOf(text));
}

/**
 * Every comment and the contents of every closed string in a CSS stylesheet, as
 * the same `[start, end, kind]` regions {@link regionsOf} returns.
 *
 * CSS is not read through the JavaScript walk, because the two grammars disagree
 * in both directions. CSS has no `//` comment, so `url(http://x)` would end a line
 * early under the JavaScript rules, and CSS has no pattern literal, so the `/` in
 * `calc(100% / 3)` would open one. Here a comment is `/* … *\/` and nothing else,
 * and a string is a quoted run that closes before an unescaped newline. A string
 * left open at the newline is a CSS bad-string, never a string, so its line stays
 * as written: the same strict direction as the JavaScript walk.
 *
 * Plain CSS only. SCSS adds `//` comments, and no caller reads SCSS through this.
 *
 * @param {string} text CSS source
 * @returns {Array<[number, number, "comment" | "literal"]>}
 */
function cssRegionsOf(text) {
  /** @type {Array<[number, number, "comment" | "literal"]>} */
  const regions = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "/" && text[i + 1] === "*") {
      const start = i;
      const close = text.indexOf("*/", i + 2);
      i = close === -1 ? text.length : close + 2;
      regions.push([start, i, "comment"]);
      continue;
    }
    if (ch === '"' || ch === "'") {
      i += 1;
      const bodyStart = i;
      while (i < text.length) {
        if (text[i] === "\\") {
          i += 2;
          continue;
        }
        if (text[i] === "\n") break;
        if (text[i] === ch) {
          regions.push([bodyStart, i, "literal"]);
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }
    i += 1;
  }
  return regions;
}

/** The grammars {@link codePositionsOf} reads, by the name a caller passes. */
const CODE_PROJECTIONS = {
  js: blankCommentsAndLiterals,
  css: (text) => blankRegions(text, cssRegionsOf(text))
};

/**
 * ── WHERE A MATCH SITS: CODE, OR TEXT THAT QUOTES CODE ──────────────────────
 *
 * A positive pin — "this file CALLS x", "this file DECLARES y" — that matches raw
 * text is satisfied by a comment quoting the code, and blanking comments first is
 * not enough: a STRING that quotes the code satisfies it too, and so does a
 * template's text. The obvious cure, matching on `blankCommentsAndLiterals`, deletes
 * every pinned argument along with the strings, so a pin on
 * `.option("--no-auto-update"` could never match at all.
 *
 * So the match is made on the text AS WRITTEN, and it counts only where its HEAD —
 * its first non-whitespace character — is still the same character in the code
 * projection at the same offset. The projection keeps every offset and blanks only
 * comments and literal contents, so a preserved head is code, or the delimiter
 * that opens a real literal. Everything after the head may be a literal's contents,
 * which is how the pinned argument survives.
 *
 * ⚠️ ONLY THE HEAD IS JUDGED. A pattern that spans a gap — `if \(!ok\)[\s\S]{0,400}exit` —
 * has its far end judged by nothing, so a caller that needs both ends in code
 * matches each end on its own.
 *
 * A match the walk rejects advances the search by ONE character, never past the
 * match, so a quoted copy that overlaps a real one cannot hide it. That is the
 * strict direction for a positive pin, and a detection scan that projected its
 * population through this would lose nothing a raw scan finds at a code position.
 *
 * `options.language` picks the grammar: `"js"` (the default; JavaScript and
 * TypeScript, with the walk's limits stated above — `//` in JSX TEXT reads as a
 * comment, which rejects a match and never invents one) or `"css"` (plain CSS
 * stylesheets, through {@link cssRegionsOf}).
 */

/**
 * @param {{ language?: "js" | "css" } | undefined} options
 * @returns {(text: string) => string}
 */
function projectionFor(options) {
  const language = options?.language ?? "js";
  const project = Object.hasOwn(CODE_PROJECTIONS, language)
    ? CODE_PROJECTIONS[language]
    : undefined;
  if (project === undefined) {
    throw new TypeError(
      `codePositionsOf: no grammar for language ${JSON.stringify(language)} (js, css)`
    );
  }
  return project;
}

/**
 * A predicate over offsets into `text`: is the span at `index` at a CODE position?
 * It judges the span's first non-whitespace character, and a span with none is not
 * code. The projection is built once, so a scan that judges many matches in one
 * file pays for one walk.
 *
 * @param {string} text the source as written
 * @param {{ language?: "js" | "css" }} [options]
 * @returns {(index: number, length?: number) => boolean}
 */
export function codePositionsOf(text, options) {
  const code = projectionFor(options)(text);
  return (index, length = 1) => {
    const end = Math.min(text.length, index + Math.max(1, length));
    for (let at = Math.max(0, index); at < end; at += 1) {
      if (/\s/.test(text[at])) continue;
      return code[at] === text[at];
    }
    return false;
  };
}

/**
 * `pattern` as a fresh global regex: a string matches literally, a regex keeps its
 * own flags apart from `y`, which would stop the one-character advance.
 *
 * @param {string | RegExp} pattern
 * @returns {RegExp}
 */
function globalPattern(pattern) {
  if (typeof pattern === "string") {
    if (pattern.length === 0)
      throw new TypeError("matchesInCode: an empty pattern has no head to judge");
    return new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
  }
  const flags = pattern.flags.replace(/[gy]/g, "");
  return new RegExp(pattern.source, `${flags}g`);
}

/**
 * Every match of `pattern` in `text` whose head is at a code position, in source
 * order, as `RegExpExecArray`s over the ORIGINAL text — so `index`, captures and
 * groups read the source as written, string contents included.
 *
 * @param {string} text the source as written
 * @param {string | RegExp} pattern a string matches literally
 * @param {{ language?: "js" | "css" }} [options]
 * @returns {RegExpExecArray[]}
 */
export function matchesInCode(text, pattern, options) {
  const isCode = codePositionsOf(text, options);
  const regex = globalPattern(pattern);
  /** @type {RegExpExecArray[]} */
  const kept = [];
  for (let match = regex.exec(text); match !== null; match = regex.exec(text)) {
    if (match[0].length === 0) {
      throw new TypeError(
        `matchesInCode: ${regex} matched the empty string, which has no head to judge`
      );
    }
    if (isCode(match.index, match[0].length)) {
      kept.push(match);
      regex.lastIndex = match.index + match[0].length;
    } else {
      regex.lastIndex = match.index + 1;
    }
  }
  return kept;
}

/**
 * The first match of `pattern` whose head is at a code position, or `null`. For a
 * VALUE read out of a declaration: a raw `exec` takes the first match in the file,
 * and a comment above the declaration that quotes an older value comes first.
 *
 * @param {string} text the source as written
 * @param {string | RegExp} pattern a string matches literally
 * @param {{ language?: "js" | "css" }} [options]
 * @returns {RegExpExecArray | null}
 */
export function firstMatchInCode(text, pattern, options) {
  const isCode = codePositionsOf(text, options);
  const regex = globalPattern(pattern);
  for (let match = regex.exec(text); match !== null; match = regex.exec(text)) {
    if (match[0].length === 0) {
      throw new TypeError(
        `firstMatchInCode: ${regex} matched the empty string, which has no head to judge`
      );
    }
    if (isCode(match.index, match[0].length)) return match;
    regex.lastIndex = match.index + 1;
  }
  return null;
}

/**
 * Does `text` hold `pattern` at a code position? The positive pin's question.
 *
 * @param {string} text the source as written
 * @param {string | RegExp} pattern a string matches literally
 * @param {{ language?: "js" | "css" }} [options]
 * @returns {boolean}
 */
export function includesInCode(text, pattern, options) {
  return firstMatchInCode(text, pattern, options) !== null;
}
