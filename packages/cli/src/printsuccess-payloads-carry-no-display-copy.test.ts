/**
 * `printSuccess` renders ONE object down two channels, so a `?? "(none)"` in its
 * payload does not only make a null readable in the terminal — it replaces the
 * null a script parses under `--json`. `output.ts` says so at length and ships
 * `absent()` as the split: `null` on the wire, the sentence in the terminal.
 *
 * A doc comment beside the helper is a deferred fix, and it was deferring one:
 * `absent()` had ten correct call sites under `role/**` and two `?? "<literal>"`
 * survivors elsewhere, one of which Cursor bugbot re-found on a promotion train.
 * The idiom is one character away from the correct one and reads fine in review,
 * so nothing but a scan catches the eleventh.
 *
 * Scope is deliberately narrow: only a `??` whose right side is a STRING LITERAL,
 * and only inside a `printSuccess` call. Every spelling of one counts: `"…"`,
 * `'…'` and a template, substitutions or not. `` `${count} none` `` is still a
 * sentence standing where the wire should carry `null`. `?? someVariable` is a real fallback
 * value, and a literal anywhere else in the payload is a value the caller is
 * expected to parse — `output.ts` states that distinction as the contract.
 *
 * The control is its OWN `it`. Folded into the invariant, a scan that matched
 * nothing would satisfy it vacuously and the control meant to catch that would
 * never run.
 */
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { blankComments, blankCommentsAndLiterals } from "../../../scripts/_lib/strip-comments.mjs";

const SRC = path.resolve(__dirname);

/** Embedded skill markdown is documentation, not code. See the sibling specs. */
const isScannable = (file: string): boolean =>
  file.endsWith(".ts") && !file.includes(".generated.") && !file.includes(".test.");

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return isScannable(entry.name) ? [full] : [];
  });
}

/** `key: … ?? <string literal>`, in each of the three quote forms. */
const STRING_FALLBACK =
  /(\w+)\s*:\s*[^\n,]*\?\?\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g;

/**
 * A payload property whose fallback is display copy rather than a value.
 *
 * `printSuccess` calls are found by name and then read to the parenthesis that
 * closes the call, so a `??` in a LATER call cannot be attributed to this one —
 * the failure that would make this scan noisy and get it deleted.
 *
 * Both the name and the parentheses are read on `blankCommentsAndLiterals`
 * output, where every comment and the inside of every string is blank. On raw
 * text a `)` inside the message — `"Unfiled :)"` — closes the call before its
 * payload, and the offender after it is never read. A `printSuccess(` in prose
 * opens a call that is not there and reads on into the next real one. The
 * fallbacks themselves are string literals, so they are read out of
 * `blankComments` output at the same offsets: every projection keeps every
 * offset, and only that one keeps a literal's text. A comment inside the call
 * is blank there too: a commented-out `?? "…"` is not part of the payload.
 */
function displayCopyDefaults(source: string): string[] {
  const found: string[] = [];
  const code = blankCommentsAndLiterals(source);
  const payloads = blankComments(source);
  const call = /printSuccess\s*\(/g;
  let match: RegExpExecArray | null;

  while ((match = call.exec(code)) !== null) {
    let depth = 0;
    let end = match.index + match[0].length - 1;
    for (; end < code.length; end++) {
      if (code[end] === "(") depth++;
      else if (code[end] === ")" && --depth === 0) break;
    }
    const body = payloads.slice(match.index, end);
    for (const hit of body.matchAll(STRING_FALLBACK)) {
      const line = source.slice(0, match.index + (hit.index ?? 0)).split("\n").length;
      found.push(`${line}: ${hit[1]}: … ?? ${hit[2]}`);
    }
  }
  return found;
}

describe("printSuccess payloads carry no display copy", () => {
  it("uses absent() rather than a string fallback, everywhere", () => {
    // The denominator. Without it an empty result means either "no payload
    // carries display copy" or "the recursive listing resolved nothing", and
    // the two print the same pass.
    const scanned = sourceFiles(SRC);
    expect(scanned.length, "the source sweep resolved nothing").toBeGreaterThan(100);

    const offenders = scanned.flatMap((file) =>
      displayCopyDefaults(fs.readFileSync(file, "utf8")).map(
        (hit) => `${path.relative(SRC, file)}:${hit}`
      )
    );

    expect(
      offenders,
      `A "?? \\"literal\\"" in a printSuccess payload reaches --json as that literal, so a ` +
        `script must detect absence by matching English. Use absent("…") from ./output: it ` +
        `emits null on the wire and the sentence in the terminal.\n${offenders.join("\n")}`
    ).toEqual([]);
  });

  it("CONTROL — the scan detects the pattern it forbids", () => {
    const planted = `printSuccess("Deployment unfiled.", {
      deploymentId: opts.deploymentId,
      folderId: folderId ?? "(none)"
    });`;
    expect(displayCopyDefaults(planted)).toHaveLength(1);
  });

  it("CONTROL — the scan accepts absent() and a non-literal fallback", () => {
    const clean = `printSuccess("Updated.", {
      owner: updated.ownerUserId ?? absent("(none)"),
      folderId: folderId ?? fallbackFolderId
    });`;
    expect(displayCopyDefaults(clean)).toEqual([]);
  });

  it("CONTROL — a ?? literal OUTSIDE a printSuccess call is not reported", () => {
    const elsewhere = `const label = name ?? "(unnamed)";
    printSuccess("Done.", { id });`;
    expect(displayCopyDefaults(elsewhere)).toEqual([]);
  });

  it("CONTROL — a parenthesis inside the message does not end the call", () => {
    const planted = `printSuccess("Unfiled :)", {
      folderId: folderId ?? "(none)"
    });`;
    expect(displayCopyDefaults(planted)).toEqual(['2: folderId: … ?? "(none)"']);
  });

  it("CONTROL — printSuccess( in a comment opens no call of its own", () => {
    const planted = `// printSuccess( is the only renderer here.
    printSuccess("Deployment unfiled.", {
      folderId: folderId ?? "(none)"
    });`;
    expect(displayCopyDefaults(planted)).toEqual(['3: folderId: … ?? "(none)"']);
  });

  it("CONTROL — a commented-out fallback inside the call is not reported", () => {
    const clean = `printSuccess("Updated.", {
      // was: folderId: folderId ?? "(none)"
      folderId: folderId ?? absent("(none)")
    });`;
    expect(displayCopyDefaults(clean)).toEqual([]);
  });

  it("CONTROL — a single-quoted fallback is display copy", () => {
    const planted = `printSuccess("Deployment unfiled.", {
      folderId: folderId ?? '(none)'
    });`;
    expect(displayCopyDefaults(planted)).toEqual(["2: folderId: … ?? '(none)'"]);
  });

  it("CONTROL — a template fallback is display copy", () => {
    const planted = `printSuccess("Deployment unfiled.", {
      folderId: folderId ?? \`(none)\`
    });`;
    expect(displayCopyDefaults(planted)).toEqual(["2: folderId: … ?? `(none)`"]);
  });

  it("CONTROL — a template fallback with a substitution is display copy", () => {
    const planted = `printSuccess("Deployment unfiled.", {
      folderId: folderId ?? \`\${count} none\`
    });`;
    expect(displayCopyDefaults(planted)).toEqual(["2: folderId: … ?? `${count} none`"]);
  });
});
