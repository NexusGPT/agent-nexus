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
 * The key names a fragment NAMES. `{"error":{…}}` names none, which is legal.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔴 WHY THIS READS POSITION AND NOT JUST SHAPE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * This used to take every identifier-shaped quoted token in the fragment and drop
 * the first as the `"error"` wrapper. That is correct for the prose spellings the
 * gate was written against — `{"error":{"message","hint","code"}}` — because they
 * carry key names and no values.
 *
 * It is wrong the moment a fragment carries a real VALUE that is also
 * identifier-shaped. `{"error":{"message":"…","hint":null,"code":"FEATURE_NOT_ENABLED"}}`
 * names three keys and was read as naming FOUR, so a fragment that agrees with the
 * emitter exactly was reported as disagreeing with it — with a diff that names a
 * "key" the reader can plainly see is a value.
 *
 * 🚨 THAT IS THE FAILURE MODE THAT GETS A GATE DELETED. A detector that reports
 * correct work as wrong, in a way its victim cannot make sense of, is uninstalled
 * by the third person who hits it — and its true positives go with it. Same
 * economics as a guard that refuses correct work.
 *
 * So a quoted token counts as a KEY only where a key can appear: at the start of
 * the object or straight after a comma. Anything after a `:` is a value and is not
 * a name this gate has any opinion about.
 *
 * ⚠️ THE OBVIOUS REPAIR — "a key is a token followed by `:`" — IS WRONG HERE, AND
 * IT FAILS SILENTLY IN THE DIRECTION THAT MATTERS. The prose spellings carry no
 * colons at all, so that rule reads `{"error":{"message","hint"}}` as naming NO
 * keys, and a fragment naming none is legal by this gate's own rule. The exact
 * stale spelling the gate exists to fire on would pass. Keys are found by where
 * they SIT, never by what follows them.
 *
 * The `"error"` wrapper is excluded structurally rather than by dropping the first
 * hit: only the INNER object is read. Dropping the first hit also assumed the
 * wrapper always parses as one token, which the position rule makes moot.
 */
function keysNamedBy(fragment: string): readonly string[] {
  const inner = fragment.slice(
    fragment.indexOf("{", fragment.indexOf("{") + 1) + 1,
    fragment.lastIndexOf("}}")
  );

  const keys: string[] = [];
  let index = 0;
  // True where a KEY may legally begin: the start of the object, or after a comma.
  let atKeyPosition = true;

  while (index < inner.length) {
    if (inner[index] === '"') {
      let end = index + 1;
      // Walk to the closing quote, stepping over an escaped character so a `\"`
      // inside a message cannot end the token early and turn the rest of that
      // message into apparent keys.
      while (end < inner.length && inner[end] !== '"') end += inner[end] === "\\" ? 2 : 1;
      const token = inner.slice(index + 1, end);
      if (atKeyPosition && /^[A-Za-z_][A-Za-z0-9_]*$/.test(token)) keys.push(token);
      atKeyPosition = false;
      index = end + 1;
      continue;
    }
    if (inner[index] === ",") atKeyPosition = true;
    index += 1;
  }

  return keys;
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

  // ── The false positive, and the two ways a repair for it goes wrong ────────

  it("does NOT count an identifier-shaped VALUE as a key", () => {
    // 🔴 THE REGRESSION THIS PAIR EXISTS FOR. A realistic fixture — the document
    // `printCliError` actually emits, values and all — names exactly the three
    // live keys. Read by shape alone it appeared to name FOUR, because
    // `FEATURE_NOT_ENABLED` is identifier-shaped and sits in value position, and
    // a correct fragment was reported as disagreeing with the emitter.
    const real =
      '{"error":{"message":"API error (403): This organization has opted out of this feature",' +
      '"hint":null,"code":"FEATURE_NOT_ENABLED"}}';
    expect(keysNamedBy(real)).toEqual(["message", "hint", "code"]);
    expect(findEnvelopes(real)).toHaveLength(1);
  });

  it("still counts every key when the values are identifier-shaped too", () => {
    // A value that is a bare word, on every field, so nothing about the shape of
    // the value can be what separates a key from a value here.
    expect(keysNamedBy('{"error":{"message":"alpha","hint":"beta","code":"gamma"}}')).toEqual([
      "message",
      "hint",
      "code"
    ]);
  });

  it("still FIRES on a JSON-form fragment whose key set is genuinely wrong", () => {
    // 🚨 THE HALF A LOOSENED REPAIR DESTROYS. Making the false positive go away
    // is trivial — return fewer keys, or none — and a detector that names nothing
    // is worse than the false positive, because it reports a clean tree forever.
    // A fragment in the SAME form as the one above, differing only in that it
    // names a key the emitter does not, must still be read as naming three.
    const wrong = '{"error":{"message":"x","hint":null,"detail":"y"}}';
    expect(keysNamedBy(wrong)).toEqual(["message", "hint", "detail"]);
    expect([...keysNamedBy(wrong)].sort().join(",")).not.toBe(
      ["code", "hint", "message"].join(",")
    );
  });

  it("still reads the COLONLESS prose spelling, which the obvious repair breaks", () => {
    // ⚠️ THE TRAP INSIDE THE FIX. "A key is a token followed by `:`" removes the
    // false positive and reads the prose spellings as naming NO keys — and a
    // fragment naming none is LEGAL here. The exact stale spelling this gate was
    // written to catch would sail through, silently, forever.
    expect(keysNamedBy('{"error":{"message","hint"}}')).toEqual(["message", "hint"]);
    expect(keysNamedBy('{"error":{"message","hint"}}')).not.toEqual([]);
  });

  it("steps over an escaped quote, so the keys after it are still found", () => {
    // Without the escape step the value token ends at the escaped quote, the rest
    // of the message is walked as if it were structure, and the keys that follow
    // are never reached — this fragment reads as naming `message` ALONE, which
    // disagrees with the emitter. So the missing escape step is not a cosmetic
    // gap; it is the same false positive this repair exists to remove, arriving
    // by a second route.
    //
    // 🚨 THE PAYLOAD IS ODD-QUOTED ON PURPOSE, AND A REALISTIC ONE DOES NOT TEST
    // THIS. An EVEN number of escaped quotes re-syncs the parser — the token ends
    // early, then the next one ends early again, and the walk lands back in step
    // with the same answer either way. So the tempting fixture, a message quoting
    // a term (`unknown field \"detail\"`), passes WITH and WITHOUT the escape
    // step and proves nothing. Measured over 2,800 generated payloads: 1,013
    // differ, and every one carries an odd number of escaped quotes.
    //
    // The first fixture written here was the even, realistic one. It passed
    // against both implementations and was caught only by mutating the escape
    // step away and watching this test stay green.
    const oddlyQuoted = '{"error":{"message":"unterminated quote: \\"","hint":null,"code":"X"}}';
    expect(keysNamedBy(oddlyQuoted)).toEqual(["message", "hint", "code"]);
    expect(keysNamedBy(oddlyQuoted)).not.toEqual(["message"]);
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
