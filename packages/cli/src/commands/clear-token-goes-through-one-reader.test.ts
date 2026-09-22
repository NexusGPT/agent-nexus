import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { listFilesRecursively } from "../util/list-files-recursively";

const SRC_DIR = dirname(fileURLToPath(import.meta.url));

/**
 * The token that means "clear this field" is READ IN ONE PLACE.
 *
 * A PATCH leaves an omitted field alone, so absence already means "don't touch
 * this". A nullable field needs a second thing said — "clear it" — and absence
 * cannot say both, so this CLI invents a literal token for it. Nine commands
 * had each written that decision out by hand:
 *
 *   flags.parentId = opts.parentId === "null" ? null : opts.parentId;
 *
 * Nine copies of one contract, pinned by no test. Every one of them was
 * CORRECT — this gate is not repairing a divergence, it is closing the window
 * in which the tenth is written differently and nothing notices. The
 * comparison is invisible to `tsc` (both sides are `string`) and to lint, and
 * its failure mode is silent on both sides: a missed token sends the literal
 * string `"null"` as a uuid, and a token read too loosely blanks a field the
 * operator meant to set.
 *
 * ── WHAT THIS GATE ASSERTS ───────────────────────────────────────────────────
 *
 * The comparison is never applied DIRECTLY to a commander option. It goes
 * through a named reader — `readClearableFlag` in `util/body.ts`, or one of the
 * `role` readers below — so there is one place to change and one place to test.
 *
 * That is why the pattern is keyed on `opts.` rather than on the token alone.
 * Four readers legitimately still compare the token, and each takes its value
 * as a PARAMETER rather than reaching into `opts`:
 *
 *   commands/role/_shared/read-owner.ts
 *   commands/role/_shared/read-nullable-number.ts
 *   commands/role/_shared/read-nullable-string.ts
 *   commands/permissions.ts          (resolveVisibility)
 *
 * Those read a WIDER vocabulary — they accept `"none"` too — because their
 * fields are things like a currency code or an enum, where `"none"` cannot be a
 * real value. The fields `readClearableFlag` serves include free text, where
 * `nexus deployment update --description none` must set the description to the
 * string `"none"`. The two vocabularies are a decision, not drift, and this
 * gate is deliberately shaped so it does not demand they be merged.
 */

/** The literal token, spelled here so this gate does not import what it judges. */
const TOKEN = '"null"';

/**
 * The offending shape: the token compared straight against a commander option.
 *
 * `opts` is the name commander's `.action((…, opts) =>)` binds at every call
 * site in this package, so a reader that takes a parameter cannot match.
 */
const INLINE_COMPARISON = /\bopts\.\w+\s*===\s*"null"/g;

/**
 * The same comparison against ANY subject. Used only as this gate's control —
 * see the final test.
 */
const ANY_COMPARISON = /===\s*"null"/g;

interface Finding {
  file: string;
  line: number;
  text: string;
}

const describeFinding = (f: Finding): string =>
  `${f.file}:${f.line}  ${f.text}  — read it through readClearableFlag() from util/body.ts`;

function scan(pattern: RegExp): { findings: Finding[]; filesRead: number } {
  const files = listFilesRecursively(
    SRC_DIR,
    (name) => name.endsWith(".ts") && !name.endsWith(".test.ts")
  );
  const findings: Finding[] = [];

  for (const file of files) {
    const lines = readFileSync(join(SRC_DIR, file), "utf8").split("\n");
    lines.forEach((text, index) => {
      // A fresh regex per line: the shared literal carries `g`, and a `g` regex
      // keeps `lastIndex` between calls, so reusing one silently skips every
      // other match.
      if (new RegExp(pattern.source).test(text)) {
        findings.push({ file, line: index + 1, text: text.trim() });
      }
    });
  }

  return { findings, filesRead: files.length };
}

describe("the clear token is read in one place", () => {
  it("is never compared directly against a commander option", () => {
    const { findings } = scan(INLINE_COMPARISON);
    expect(findings.map(describeFinding)).toEqual([]);
  });

  it("CONTROL — the scan reads real files and can see the token it hunts", () => {
    // Without this, every assertion above is satisfiable by a walk that read
    // nothing: a zero from a broken search and a zero from a clean tree are the
    // same value. So prove the machinery works by finding the token where it is
    // SUPPOSED to be — the four readers named in this file's header.
    const { findings, filesRead } = scan(ANY_COMPARISON);

    expect(filesRead).toBeGreaterThan(20);
    expect(findings.length).toBeGreaterThanOrEqual(4);

    // And prove it is the readers that carry it, not a call site that slipped
    // past the pattern above.
    for (const f of findings) {
      expect(f.text).toContain("none");
    }
  });

  it("CONTROL — the pattern matches the shape it claims to, on a known string", () => {
    // The gate's own regex, exercised on the exact line nine commands used to
    // carry. An anchor that matches nothing fails in the reassuring direction.
    const wasWritten = 'flags.parentId = opts.parentId === "null" ? null : opts.parentId;';
    expect(new RegExp(INLINE_COMPARISON.source).test(wasWritten)).toBe(true);

    const goesThroughTheReader = "flags.parentId = readClearableFlag(opts.parentId);";
    expect(new RegExp(INLINE_COMPARISON.source).test(goesThroughTheReader)).toBe(false);

    // A reader taking its value as a parameter is not the offending shape.
    const reader = `return raw === "none" || raw === ${TOKEN} ? null : raw;`;
    expect(new RegExp(INLINE_COMPARISON.source).test(reader)).toBe(false);
  });
});
