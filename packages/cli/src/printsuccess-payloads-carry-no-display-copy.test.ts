/**
 * `printSuccess` renders ONE object down two channels, so a `?? "(none)"` in its
 * payload does not only make a null readable in the terminal — it replaces the
 * null a script parses under `--json`. `output.ts` says so at length and ships
 * `absent()` as the split: `null` on the wire, the sentence in the terminal.
 *
 * A doc comment beside the helper is a deferred fix, and it was deferring one:
 * `absent()` had ten correct call sites in `role.ts` and two `?? "<literal>"`
 * survivors elsewhere, one of which Cursor bugbot re-found on a promotion train.
 * The idiom is one character away from the correct one and reads fine in review,
 * so nothing but a scan catches the eleventh.
 *
 * Scope is deliberately narrow: only a `??` whose right side is a STRING LITERAL,
 * and only inside a `printSuccess` call. `?? someVariable` is a real fallback
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

/**
 * A payload property whose fallback is display copy rather than a value.
 *
 * `printSuccess` calls are found by name and then read to the end of the object
 * literal a brace-depth walk finds, so a `??` in a LATER call cannot be
 * attributed to this one — the failure that would make this scan noisy and get
 * it deleted.
 */
function displayCopyDefaults(source: string): string[] {
  const found: string[] = [];
  const call = /printSuccess\s*\(/g;
  let match: RegExpExecArray | null;

  while ((match = call.exec(source)) !== null) {
    let depth = 0;
    let end = match.index + match[0].length - 1;
    for (; end < source.length; end++) {
      if (source[end] === "(") depth++;
      else if (source[end] === ")" && --depth === 0) break;
    }
    const body = source.slice(match.index, end);
    for (const hit of body.matchAll(/(\w+)\s*:\s*[^\n,]*\?\?\s*("(?:[^"\\]|\\.)*")/g)) {
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
    // the two print the same pass. 186 files reach the scan today.
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
});
