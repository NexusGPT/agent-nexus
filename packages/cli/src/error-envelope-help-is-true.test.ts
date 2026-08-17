import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { refuse } from "./errors";
import { setJsonMode } from "./output";

const SRC = path.resolve(__dirname);

/**
 * THIS FILE IS OUT OF ITS OWN POPULATION, AND THAT IS NOT AN ESCAPE HATCH.
 *
 * A detector has to carry the shapes it must FIRE on, spelled exactly as they
 * appear in the wild — so this file holds the stale two-key spelling on purpose.
 * Scanned like any other source it reports itself, and the only ways out are to
 * stop testing the detector or to spell the fixtures in a form the detector
 * cannot read, which tests nothing.
 *
 * The exclusion is paid for below: `CONTROL: the exclusion is load-bearing`
 * scans this file and REQUIRES violations. So the walk is proven to fire on real
 * bytes on every run, and an empty verdict over the rest of the package is a
 * measurement rather than a scan that resolved to nothing.
 */
const SELF = path.join(SRC, "error-envelope-help-is-true.test.ts");

/**
 * `.generated.` files are excluded by the same MARKER the sibling scans use, not
 * by name. `src/skills-content.generated.ts` alone is megabytes of skill
 * markdown held as string literals, and that prose describes other products'
 * payloads — it is documentation this package does not own.
 */
const isScannable = (file: string): boolean =>
  file.endsWith(".ts") && !file.includes(".generated.");

const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return isScannable(full) ? [full] : [];
  });

/**
 * THE ERROR ENVELOPE IS DESCRIBED IN ELEVEN PLACES AND EMITTED IN ONE.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS GATE EXISTS: THE HELP OUTLIVED THE FIX, AND SAID THE OPPOSITE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `code` was added to the error document — every branch of `handleError` can
 * derive one, so it is REQUIRED rather than optional (see `CliErrorDocument`).
 * Eleven documented workflow refusal codes had been reaching `printCliError` and
 * dying there, on both channels; that is the defect the field closed.
 *
 * The prose did not move with it. `nexus workflow --help` went on telling every
 * reader "THE API'S NAMED ERROR CODES DO NOT REACH THIS CLI … the payload is
 * {"error":{"message":…}} with no code", and the root epilogue went on spelling
 * the document with two keys. Anyone writing error handling against the help
 * deliberately ignored the one field that was present and machine-readable —
 * which is worse than an undocumented field, because it actively steers a
 * caller onto message-matching.
 *
 * Five of the eleven descriptions were stale that way, and every one of them
 * read as a checked fact. Nothing compares prose to behaviour, so nothing could
 * have said so.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE RULE — DERIVED FROM THE EMITTER, NEVER FROM A LIST WRITTEN HERE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The live key set is taken by DRIVING a real refusal under `--json` and reading
 * the keys off what lands on stdout. Then every `{"error":{…}}` fragment in the
 * package must either elide its keys (`{"error":{…}}`, a deliberate "shape not
 * the subject here") or name EXACTLY that set.
 *
 * A hand-written expectation of `["message","hint","code"]` would be a second
 * declaration of the contract, and the two would drift in the same silence this
 * gate exists to break. Adding a fourth key must fail this file until the prose
 * follows — that is the whole point.
 */

/** `{"error":{ … }}` as it is written in prose, with its quoted key names. */
const ENVELOPE = /\{"error":\s*\{[^{}]*\}\}/g;

/**
 * The key names a fragment NAMES. `{"error":{…}}` names none, which is legal;
 * the first `"error"` is the wrapper and is dropped.
 */
function keysNamedBy(fragment: string): readonly string[] {
  return [...fragment.matchAll(/"([A-Za-z_][A-Za-z0-9_]*)"/g)].map((m) => m[1]).slice(1);
}

/** Every envelope fragment in a source text, with the line it sits on. */
function findEnvelopes(text: string): readonly { line: number; fragment: string }[] {
  return [...text.matchAll(ENVELOPE)].map((m) => ({
    line: text.slice(0, m.index).split("\n").length,
    fragment: m[0]
  }));
}

/**
 * The document the code ACTUALLY emits, read off stdout.
 *
 * `refuse` is the cheapest real door — it takes no code parameter, so nothing
 * about this call can pick the shape. Every other printer funnels through the
 * same `printCliError`.
 */
function liveErrorKeys(): readonly string[] {
  const lines: string[] = [];
  const realLog = console.log;
  const previousExitCode = process.exitCode;
  console.log = (...args: unknown[]): void => void lines.push(args.map(String).join(" "));
  setJsonMode(true);
  try {
    refuse("driven by error-envelope-help-is-true.test.ts");
  } finally {
    console.log = realLog;
    setJsonMode(false);
    process.exitCode = previousExitCode;
  }
  const document = JSON.parse(lines.join("\n")) as { error: Record<string, unknown> };
  return Object.keys(document.error).sort();
}

describe("the detector, before anything is measured with it", () => {
  it("reads the keys a fragment names, and reads an elided one as naming none", () => {
    expect(keysNamedBy('{"error":{"message","hint","code"}}')).toEqual(["message", "hint", "code"]);
    expect(keysNamedBy('{"error":{"message":…}}')).toEqual(["message"]);
    expect(keysNamedBy('{"error":{…}}')).toEqual([]);
  });

  it("FIRES on the exact stale spelling this gate was written for", () => {
    const stale = findEnvelopes(' * the payload is {"error":{"message","hint"}} with no code.');
    expect(stale).toHaveLength(1);
    expect(keysNamedBy(stale[0].fragment)).toEqual(["message", "hint"]);
    expect(keysNamedBy(stale[0].fragment)).not.toEqual(["code", "hint", "message"]);
  });

  it("stays silent on prose that merely says the word error", () => {
    expect(findEnvelopes("the error document carries a code")).toEqual([]);
  });
});

describe("every description of the error envelope agrees with the emitter", () => {
  const liveKeys = liveErrorKeys();

  it("a driven refusal really does carry a code", () => {
    // The ticket's claim, asserted directly rather than inferred from the type:
    // `code` is on the wire, so help text saying it is absent is false.
    expect(liveKeys).toContain("code");
  });

  /** Scan one file and report every fragment that disagrees with the emitter. */
  function disagreementsIn(file: string): readonly string[] {
    const text = fs.readFileSync(file, "utf8");
    return findEnvelopes(text)
      .filter(({ fragment }) => {
        const named = keysNamedBy(fragment);
        return named.length > 0 && [...named].sort().join(",") !== liveKeys.join(",");
      })
      .map(({ line, fragment }) => `${path.relative(SRC, file)}:${line}  ${fragment}`);
  }

  it("every fragment in the package names the live key set, or names none", () => {
    const files = walk(SRC).filter((file) => file !== SELF);
    const fragments = files.reduce(
      (total, file) => total + findEnvelopes(fs.readFileSync(file, "utf8")).length,
      0
    );

    // The population control. A scan that resolved to nothing reports zero
    // violations and reads exactly like a clean tree, so the count is asserted
    // before the verdict is believed. Eight was the census when this landed,
    // with five more since corrected; it is a floor, not the number.
    expect(fragments).toBeGreaterThanOrEqual(8);
    expect(files.flatMap(disagreementsIn)).toEqual([]);
  });

  it("CONTROL: the exclusion is load-bearing, and the walk fires on real bytes", () => {
    // This file's own fixtures ARE the stale spelling. If they ever stop being
    // reported, the detector has gone blind and the green above means nothing.
    expect(disagreementsIn(SELF).length).toBeGreaterThan(0);
  });
});
