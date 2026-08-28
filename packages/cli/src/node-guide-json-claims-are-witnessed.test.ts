import fs from "node:fs";
import path from "node:path";

import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ResolvedProfile } from "./config";
import { printContextBanner, printRecord, printSuccess, printWarning, setJsonMode } from "./output";

/**
 * A GUIDE THAT DESCRIBES THE CLI'S `--json` OUTPUT MAKES A CLAIM ABOUT THIS
 * PACKAGE, AND HERE THAT CLAIM IS RUN AGAINST THE REAL EMITTER.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE HALF THE BACKEND GATES CANNOT REACH
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `apps/backend/src/public/v1/domain/services/node-type-guides/*.guide.ts` are
 * served verbatim as the `guide` field of
 * `GET /public/v1/workflows/node-types/:nodeType`. Two gates already bind the
 * claims they make about the v1 write doors, and both live beside the guides:
 *
 *   · `node-guide-refusal-claims-are-witnessed.spec.ts` — every POSITIVE claim
 *     ("this door answers `400 X`"), by running the door and reading the code back.
 *   · `node-guide-gap-claims-are-witnessed.spec.ts` — every GAP claim ("this door
 *     checks none of it"), by running the door and asserting it ACCEPTS.
 *
 * Neither can reach a sentence about the **CLI**. A guide that says
 * `nexus … --json | jq` produces something is describing `output.ts` in THIS
 * package, and the backend cannot import it, so the sentence had no witness at
 * all — it could be written, could be wrong, and could survive its own cure.
 *
 * TWO OF THE THREE PARAGRAPHS NEX-4141 DELETED WERE OF EXACTLY THAT KIND:
 *
 *   > **The create response is not valid JSON.** The default `code` stub carries
 *   > raw newlines inside a JSON string, so `nexus workflow node create --type
 *   > customScript --json | jq` fails with `Invalid string: control characters
 *   > from U+0000 through U+001F must be escaped`.
 *
 *   > **The response is not valid JSON.** `jq` fails on it … The scraped
 *   > `content` field carries raw newlines and raw backslashes straight from the
 *   > page, so any pipeline doing `nexus execution node-result … | jq` on this
 *   > node dies.
 *
 * Both are mechanically impossible and always were: every `--json` document this
 * CLI writes goes through the single `JSON.stringify` in {@link emitDocument},
 * which escapes U+0000–U+001F and backslashes by specification. The claims still
 * cost real work — PR #3917 was open and BUILDING A FIX for the non-defect, with
 * two Linear tickets attached to it.
 *
 * The correction shipped. Nothing stopped it regrowing. This file is that stop.
 *
 * ── THE BINDING, IN BOTH DIRECTIONS ─────────────────────────────────────────
 *
 * The sibling gate's shape: run the real door, assert the outcome the prose
 * describes. Here the door is the emitter and the outcome is a PARSE.
 *
 *   · the emitter regresses (a printer that writes a document without
 *     `JSON.stringify`, a diagnostic line that lands on stdout) → the witnesses
 *     below throw, in the commit that breaks it
 *   · a guide regrows the deleted claim → `no guide says a `--json` document is
 *     unparseable` fails, naming the guide and quoting the sentence
 *   · a guide gains a NEW `--json` claim with nothing behind it → no witness row
 *     → `every guide making a `--json` claim has a witness` fails
 *
 * ── THE CANONICAL FORM, AND THE FALSE-POSITIVE RATE IT WAS CHOSEN FOR ───────
 *
 * A gate can only hold a claim it can RECOGNISE, and these guides quote `jq`
 * constantly in ordinary command examples. A claim is recognised here only when
 * BOTH halves are present:
 *
 *   1. an INTEGRITY assertion about a JSON document, from a closed list — "valid
 *      JSON", "safe to pipe through", `jq` within one clause of a verdict verb
 *      (fails / dies / parses / breaks), "control characters", "must be escaped",
 *      `JSON.stringify`;
 *   2. the CLI `--json` SURFACE in the same markdown block — a literal `--json`
 *      or a `| jq` pipe.
 *
 * Measured over the 43 served guides at the tree this landed against:
 *
 *   | rule                             | matches | genuine |
 *   |----------------------------------|---------|---------|
 *   | integrity assertion alone        |    6    |    5    |
 *   | + the `--json` surface marker    |    5    |    5    |
 *
 * The one match the surface marker removes is `jsonManipulation`'s "**An
 * unparseable `object` or `array` keeps the RAW value**", which is about the
 * NODE's run-time coercion and not about this CLI at all. A gate that demanded a
 * witness for it would be asking for one nobody in this package could honestly
 * build — and a gate that refuses correct work gets switched off, after which the
 * real violations flow again.
 *
 * ── SUBJECT: THE DOCUMENT, OR THE MERGED STREAM ─────────────────────────────
 *
 * 🚨 `--json … 2>&1 | jq` REALLY DOES BREAK, AND SAYING SO IS CORRECT PROSE.
 * The document on stdout parses; a warning on stderr is prose, and merging the
 * two feeds `jq` a line it cannot read. So a sentence naming `2>&1` (or the merge
 * itself) is classified as a claim about the MERGED STREAM, and it is bound by
 * `the diagnostic channel never reaches stdout` below rather than by the
 * unparseable check — which would otherwise turn red on the very paragraph that
 * replaced the false one.
 *
 * That carve-out is a hole of exactly one shape: a sentence that says the
 * DOCUMENT is unparseable AND names `2>&1` in the same breath escapes the
 * unparseable check. It still needs a witness row, so it cannot arrive
 * unnoticed — it can only arrive mis-filed.
 *
 * ── THE VACUITY GUARD IS ON FIXTURES, NOT ON THE LIVE CORPUS ────────────────
 *
 * There is deliberately no "the estate makes at least N `--json` claims" floor.
 * A floor over live guides is a lower bound on draining data: a guide is free to
 * stop discussing `--json`, and the person who deletes the last paragraph would
 * be refused by their own cure. The extractor is pinned on FIXTURES instead —
 * including both deleted paragraphs verbatim, which cannot empty.
 *
 * The GUIDE population is floored, because that one is not draining: an extractor
 * that silently read nothing would otherwise report a clean estate.
 *
 * ── WHAT THIS DELIBERATELY DOES NOT DO ─────────────────────────────────────
 *
 * 🚨 IDENTITY IS PER GUIDE, NOT PER SENTENCE, exactly as in the sibling gate.
 * Keying on the sentence would make the key a verbatim quote and every wording
 * tweak a red build.
 *
 * 🚨 A SUBSTITUTION IS NOT READ. A guide is a template literal and `${…}` is
 * kept as its own source text rather than evaluated, so a `--json` claim that
 * lived inside an interpolated helper would be invisible here. None does today —
 * every substitution in the 43 guides is a count, an operator list, or the shared
 * `parametersSetupId*` prose, and none of those mentions `--json` or `jq`. This
 * is an abstention, named, not a pass.
 *
 * 🚨 AN EMITTER THAT PARSES PROVES THE DOCUMENT, NEVER THE ADVICE AROUND IT.
 * Only re-measuring against a live organisation says that.
 */

// ─────────────────────────────────────────────────────────────────────────────
// THE CORPUS — the served guides, cooked out of their template literals
// ─────────────────────────────────────────────────────────────────────────────

const HERE = __dirname;

/** `apps/backend/src/public/v1/domain/services` — read as TEXT, as the SDK scan is. */
const V1_SERVICES = path.resolve(HERE, "../../../apps/backend/src/public/v1/domain/services");
const GUIDES_DIR = path.join(V1_SERVICES, "node-type-guides");
const REGISTRY_SOURCE = path.join(V1_SERVICES, "node-type-registry.service.ts");

/**
 * The guide as a CALLER receives it, not as the file spells it.
 *
 * ⚠️ Reading the file as text would hand every pattern here the ESCAPED form —
 * a guide's backticks are written `\`` inside the template literal and the JS
 * parser has already spent them. A rule written against that matches nothing and
 * reports a clean estate, which is the failure mode this whole file exists to
 * prevent. So the literal is cooked through the TypeScript parser instead.
 *
 * A `${…}` span is kept as its own source text. See the abstention in the header.
 */
function cookGuide(file: string): string | undefined {
  const text = fs.readFileSync(file, "utf8");
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);

  let cooked: string | undefined;

  const visit = (node: ts.Node): void => {
    if (cooked !== undefined) return;

    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text.endsWith("_GUIDE") &&
      node.initializer !== undefined
    ) {
      const init = node.initializer;
      if (ts.isNoSubstitutionTemplateLiteral(init)) {
        cooked = init.text;
      } else if (ts.isTemplateExpression(init)) {
        cooked =
          init.head.text +
          init.templateSpans
            .map((span) => `\${${span.expression.getText(source)}}${span.literal.text}`)
            .join("");
      }
      return;
    }

    ts.forEachChild(node, visit);
  };

  visit(source);
  return cooked;
}

/** Every served guide, keyed by the node type its own first heading names. */
function servedGuides(): Map<string, string> {
  const guides = new Map<string, string>();

  for (const entry of fs.readdirSync(GUIDES_DIR)) {
    if (!entry.endsWith(".guide.ts")) continue;

    const cooked = cookGuide(path.join(GUIDES_DIR, entry));
    // A guide file whose export this cannot read is a FAILURE, never a skip —
    // silently dropping it is how a corpus empties without anything going red.
    if (cooked === undefined) throw new Error(`no *_GUIDE template literal in ${entry}`);

    const type = /^#\s*`([A-Za-z]+)`/.exec(cooked)?.[1];
    if (type === undefined) throw new Error(`${entry}: no \`nodeType\` in the first heading`);

    guides.set(type, cooked);
  }

  return guides;
}

// ─────────────────────────────────────────────────────────────────────────────
// THE EXTRACTOR
// ─────────────────────────────────────────────────────────────────────────────

/** The CLI `--json` surface, named or piped. Half two of the canonical form. */
const JSON_SURFACE = /--json|\| ?jq\b/;

/**
 * An INTEGRITY assertion about a JSON document. Closed list — a wider net catches
 * the ordinary `… --json | jq '.data'` command examples these guides are full of.
 */
const DOCUMENT_CLAIM =
  /\bvalid JSON\b|\bsafe to pipe through\b|`?jq`?[^.!?]{0,60}\b(?:fails?|failed|dies?|died|chokes?|refuses?|parses?|errors? out|breaks?)\b|\b(?:feeds|dies on)\s+`?jq`?|\bJSON\.stringify\b|\bcontrol characters?\b|\bunparse?able\b|\bnot parseable\b|\bmust be escaped\b|\bbreaks? that pipe\b/i;

/** The polarity that costs work: the document itself is asserted to be broken. */
const DOES_NOT_PARSE =
  /\bnot\s+valid JSON\b|\bunparse?able\b|\bnot parseable\b|`?jq`?[^.!?]{0,60}\b(?:fails?|failed|dies?|died|chokes?|refuses?)\b|\bdies on it\b|\bmust be escaped\b/i;

/** The subject is the MERGED stream, not the document. See the header. */
const MERGED_STREAM = /2>&1|merging the other stream|both streams|merged stream/i;

/** Sentences, inside one markdown block. Guides put each gotcha on ONE line. */
const SENTENCE = /[^.!?\n]*[.!?]/g;

/** One claim a guide makes about a `--json` document. */
export interface JsonDocumentClaim {
  readonly sentence: string;
  /** `document` — the payload on stdout. `mergedStream` — stdout with stderr in it. */
  readonly subject: "document" | "mergedStream";
  /** Does the sentence assert the thing does NOT parse? */
  readonly saysBroken: boolean;
}

/** Every `--json` document claim a guide makes, in the form this gate recognises. */
export function findJsonDocumentClaims(text: string): JsonDocumentClaim[] {
  const claims: JsonDocumentClaim[] = [];

  for (const block of text.split("\n")) {
    if (!JSON_SURFACE.test(block)) continue;

    for (const match of block.match(SENTENCE) ?? []) {
      const sentence = match.trim();
      if (!DOCUMENT_CLAIM.test(sentence)) continue;

      claims.push({
        sentence,
        subject: MERGED_STREAM.test(sentence) ? "mergedStream" : "document",
        saysBroken: DOES_NOT_PARSE.test(sentence)
      });
    }
  }

  return claims;
}

/** The sentences that assert the DOCUMENT itself does not parse. */
function brokenDocumentSentences(claims: readonly JsonDocumentClaim[]): string[] {
  return claims.filter((c) => c.subject === "document" && c.saysBroken).map((c) => c.sentence);
}

/** The first claim, for a report. `(none)` rather than an index into an empty list. */
function firstSentence(claims: readonly JsonDocumentClaim[]): string {
  const [first] = claims;
  return first === undefined ? "(none)" : first.sentence.slice(0, 140);
}

/**
 * Every RAW control byte in an emitted document, named, except the newlines the
 * pretty-printer inserts itself.
 *
 * A codepoint walk rather than a regex: `no-control-regex` is an ESLint ERROR in
 * this package, and a lint waiver on the one assertion that reads the bytes would
 * be the wrong thing to make an exception for.
 */
function rawControlBytes(text: string): string[] {
  const found = new Set<string>();
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 0x20 && code !== 0x0a) found.add(`U+${code.toString(16).padStart(4, "0")}`);
  }
  return [...found];
}

// ─────────────────────────────────────────────────────────────────────────────
// THE WITNESSES — the REAL emitter, driven with the value each guide names
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The `customScript` default `code`, READ OUT OF THE REGISTRY.
 *
 * The deleted paragraph blamed this exact string, so the witness uses it rather
 * than a hand-written stand-in: if the default is ever changed to something with
 * a new hazard in it, the witness re-measures the new one instead of continuing
 * to prove a value nobody ships.
 *
 * Anchored to the `customScript` entry and bounded by the NEXT entry, so a `code:`
 * belonging to a different node type can never be picked up. A miss THROWS —
 * an abstention here would quietly downgrade the witness to a fixture.
 */
function customScriptDefaultCode(): string {
  const text = fs.readFileSync(REGISTRY_SOURCE, "utf8");

  const start = text.indexOf("[NodeType.customScript]: {");
  if (start === -1) {
    throw new Error(`node-type-registry.service.ts: no [NodeType.customScript] entry`);
  }

  const next = text.indexOf("[NodeType.", start + 1);
  const entry = text.slice(start, next === -1 ? undefined : next);

  const [, literal] = /defaultData:\s*\{[^}]*?\bcode:\s*("(?:[^"\\]|\\.)*")/.exec(entry) ?? [];
  if (literal === undefined) {
    throw new Error(
      `node-type-registry.service.ts: no defaultData.code on [NodeType.customScript]`
    );
  }

  return JSON.parse(literal) as string;
}

/**
 * Scraped page text of the kind `exaai`'s gotcha 1 names.
 *
 * There is no real value to read for this one — it comes off the live web — so
 * this is a FIXTURE, and it is deliberately a superset of the two hazards the
 * guide names: raw newlines and lone backslashes. A tab, a quote, a bell and a
 * CRLF ride along because the same escape rule covers all of them and a witness
 * that only tested the two named bytes would go green on a half-broken emitter.
 */
const SCRAPED_CONTENT =
  'Home \\ Anthropic\r\n\tClaude "Opus" — see C:\\Users\\nab\\notes\u0007\nnext line\\';

/** One `--json` claim a guide makes, and the emitter run that measures it. */
interface JsonWitness {
  /** Which claim this row stands for, in the guide's own terms. */
  readonly why: string;
  /** The value a `--json` read of this node type puts on the wire. */
  readonly value: () => unknown;
  /**
   * Escape sequences the emitted document MUST contain.
   *
   * 🚨 WITHOUT THIS THE WITNESS GOES GREEN OVER A HARMLESS VALUE. A parse
   * assertion passes on `{"code":"function f() {}"}` just as happily as on the
   * real stub, so a row whose value quietly lost its raw newlines would keep
   * reporting that the guide's sentence is honoured while testing nothing the
   * sentence is about. Naming the escaped bytes ties the row to the hazard.
   */
  readonly escapedInDocument: readonly string[];
}

/**
 * Every CLI `--json` claim a guide makes, keyed by the node type whose guide
 * makes it.
 *
 * A guide claiming something about `--json` with no row here fails the coverage
 * case. A row whose document has STOPPED parsing fails the case above it — which
 * is the whole point: that is the commit in which the guide's paragraph became a
 * lie, and it goes red inside it.
 */
const JSON_WITNESSES: Readonly<Record<string, JsonWitness>> = {
  customScript: {
    why: "gotcha 3 — the create response carrying the multi-line `code` stub is valid JSON",
    value: () => ({
      id: "3f1a0f6e-0000-4000-8000-000000000001",
      type: "customScript",
      position: { x: 0, y: 0 },
      data: {
        language: "js",
        label: "Custom script",
        code: customScriptDefaultCode(),
        inputs: [],
        instructions: ""
      }
    }),
    // The stub's raw newlines, arriving as two characters inside a JSON string.
    escapedInDocument: ["\\n"]
  },

  exaai: {
    why: "gotcha 1 — a node result whose scraped `content` carries raw newlines and backslashes is valid JSON",
    value: () => ({
      nodeId: "3f1a0f6e-0000-4000-8000-000000000002",
      status: "SUCCESS",
      output: {
        items: [
          {
            url: "https://www.anthropic.com/",
            title: "Home \\ Anthropic",
            content: SCRAPED_CONTENT
          }
        ]
      }
    }),
    // Both bytes the guide names — a raw newline and a lone backslash — plus the
    // three that ride along in the same escape rule.
    escapedInDocument: ["\\n", "\\\\", "\\r", "\\t", "\\u0007"]
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// THE HARNESS — capture both channels around a real printer call
// ─────────────────────────────────────────────────────────────────────────────

interface Channels {
  readonly stdout: string[];
  readonly stderr: string[];
}

let channels: Channels;

beforeEach(() => {
  const stdout: string[] = [];
  const stderr: string[] = [];
  channels = { stdout, stderr };

  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    stdout.push(args.join(" "));
  });
  vi.spyOn(process.stderr, "write").mockImplementation(((chunk: string | Uint8Array) => {
    stderr.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
    return true;
  }) as typeof process.stderr.write);

  // `setJsonMode` is what starts a run — it clears the one-document flag. A file
  // running many commands in one process must call it per case or the SECOND
  // case's only document is diverted to stderr and reads as a command that
  // printed nothing.
  setJsonMode(true);
});

afterEach(() => {
  setJsonMode(false);
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// THE CASES
// ─────────────────────────────────────────────────────────────────────────────

describe("the corpus this gate reads", () => {
  it("resolves every served guide, so a silent empty read cannot read as clean", () => {
    const guides = servedGuides();

    // A FLOOR ON THE GUIDES, which is not draining data — this directory only
    // grows. The CLAIM population below is deliberately unfloored; see the header.
    expect(guides.size).toBeGreaterThanOrEqual(40);
    // COOKED, NOT RAW, and this is the assertion that proves it. The file spells
    // that heading with escaped backticks; a plain `readFileSync` would hand every
    // pattern in this file the escaped form, match nothing, and report a clean
    // estate — the exact failure this gate exists to prevent.
    const raw = fs.readFileSync(path.join(GUIDES_DIR, "custom-script.guide.ts"), "utf8");
    expect(raw).toContain("\\`customScript\\`");
    expect(guides.get("customScript")).toContain("`customScript`");
  });
});

describe("the extractor, before any guide is measured with it", () => {
  /** `customScript` gotcha 3 as it SHIPPED, resolved exactly as a caller read it. */
  const CUSTOM_SCRIPT_AS_SHIPPED =
    "3. **The create response is not valid JSON.** The default `code` stub carries raw " +
    "newlines inside a JSON string, so `nexus workflow node create --type customScript " +
    "--json | jq` fails with `Invalid string: control characters from U+0000 through " +
    "U+001F must be escaped`. The node IS created — recover its id from " +
    "`nexus workflow overview`.";

  /** `exaai` gotcha 1 as it SHIPPED. Note it names no `--json` flag, only a `| jq`. */
  const EXAAI_AS_SHIPPED =
    "1. **The response is not valid JSON.** `jq` fails on it: `parse error: Invalid " +
    "string: control characters from U+0000 through U+001F must be escaped`, and a lone " +
    'backslash inside scraped text (`"Home \\\\ Anthropic"`) then breaks strict parsers ' +
    "too. The scraped `content` field carries raw newlines and raw backslashes straight " +
    "from the page, so any pipeline doing `nexus execution node-result … | jq` on this " +
    "node dies. Consume `{{<nodeId>.items}}` inside the workflow, where it never becomes " +
    "text, or read it with a lenient parser.";

  it("FIRES on both sentences that shipped, which is the whole reason this file exists", () => {
    // 🚨 THE NEGATIVE CONTROL FOR THE ENTIRE GATE. Pinned rather than read from
    // the guides, because the guides are CORRECT now — an assertion over the live
    // text would pass against both the broken and the fixed tree and prove
    // nothing.
    const custom = findJsonDocumentClaims(CUSTOM_SCRIPT_AS_SHIPPED);
    expect(brokenDocumentSentences(custom).join(" | ")).toContain(
      "The create response is not valid JSON."
    );

    const exa = findJsonDocumentClaims(EXAAI_AS_SHIPPED);
    expect(brokenDocumentSentences(exa).join(" | ")).toContain("The response is not valid JSON.");
  });

  it("holds the `| jq` half of the surface marker, which `exaai` needed", () => {
    // The exaai paragraph never wrote `--json`; it piped `… | jq`. A surface
    // marker that only knew the flag would have missed the sentence that shipped.
    expect(EXAAI_AS_SHIPPED).not.toContain("--json");
    expect(findJsonDocumentClaims(EXAAI_AS_SHIPPED)).not.toHaveLength(0);
  });

  it("reads the CORRECTED paragraphs as claims that are NOT broken", () => {
    // The same paragraphs rewritten to what the emitter actually does. They still
    // MAKE a claim — so they still need a witness — but no longer assert a defect.
    const corrected =
      "3. **The create response IS valid JSON, multi-line `code` stub and all.** " +
      "`nexus workflow node create --type customScript --json | jq` parses.";

    const claims = findJsonDocumentClaims(corrected);
    expect(claims).not.toHaveLength(0);
    expect(claims.filter((c) => c.subject === "document" && c.saysBroken)).toEqual([]);
  });

  it("files a `2>&1` sentence under the MERGED STREAM, not under the document", () => {
    // Correct prose that a naive polarity check would refuse — and refusing
    // correct work is how a gate gets switched off.
    const claims = findJsonDocumentClaims(
      "What breaks that pipe is merging the other stream into it — warnings go to STDERR " +
        "on purpose, so `--json … 2>&1 | jq` feeds `jq` prose and dies on it."
    );

    expect(claims.map((c) => c.subject)).toEqual(["mergedStream"]);
  });

  it("stays silent on a JSON claim about a surface this CLI does not own", () => {
    // Verbatim from `jsonManipulation`, correct, and about the NODE's run-time
    // coercion. The integrity assertion is there and the `--json` surface is not,
    // so it is never asked for a witness nobody here could honestly build.
    expect(
      findJsonDocumentClaims(
        "4. **An unparseable `object` or `array` keeps the RAW value, references and all.**"
      )
    ).toEqual([]);
  });

  it("stays silent on the ordinary `| jq` command examples these guides are full of", () => {
    // All four verbatim from live guides. Each names the surface and asserts
    // nothing about the document, which is the majority shape in this corpus.
    for (const line of [
      "nexus workflow platform-listener-events --json | jq '.[].type'",
      "Check `node get … | jq '.data.selectedAccount'` yourself.",
      "A freshly created workflow's placeholder has `data` literally empty — `nexus workflow get <wf> --json | jq '.nodes'`.",
      "check `nexus workflow get <childId> --json | jq .status`"
    ]) {
      expect(findJsonDocumentClaims(line)).toEqual([]);
    }
  });

  it("needs BOTH halves, so neither alone can fire it", () => {
    // Proves the two patterns are really ANDed. Without this, one half silently
    // ceasing to matter would widen or empty the gate with nothing turning red.
    expect(findJsonDocumentClaims("The response is not valid JSON.")).toEqual([]);
    expect(findJsonDocumentClaims("`nexus agent list --json` returns every agent.")).toEqual([]);
    expect(findJsonDocumentClaims("`nexus agent list --json` is not valid JSON.")).toHaveLength(1);
  });

  it("would CATCH a fabricated claim, so the coverage case below is not free", () => {
    // Without this, an extractor that quietly stopped matching would make every
    // coverage assertion pass by finding nothing to compare.
    expect(findJsonDocumentClaims("`nexus flux capacitor --json` is not valid JSON.")).toHaveLength(
      1
    );
    expect(Object.keys(JSON_WITNESSES)).not.toContain("fluxCapacitor");
  });
});

describe("every `--json` witness is a document `jq` can read", () => {
  const rows = Object.entries(JSON_WITNESSES);

  it.each(rows.map(([type, w]) => [type, w.why]))("%s — %s", (type) => {
    const witness = JSON_WITNESSES[type as string];
    if (witness === undefined) throw new Error(`no witness row for ${String(type)}`);
    const value = witness.value();

    // THE REAL DOOR. `printRecord` under `--json` is what every scripted read of
    // a node or a node result goes through, and it short-circuits into the one
    // `emitDocument` funnel this whole class of claim is about.
    printRecord(value as object);

    // Exactly one document, on stdout, and nothing else — the promise the root
    // epilogue makes and the precondition for `| jq` at all.
    expect(channels.stdout).toHaveLength(1);
    expect(channels.stderr).toEqual([]);

    const [text = ""] = channels.stdout;

    // The value really was hostile. See `escapedInDocument`: a parse assertion
    // over a harmless value is a green that means nothing.
    for (const escape of witness.escapedInDocument) {
      expect(text).toContain(escape);
    }
    // …and no RAW control byte survived into the document. `JSON.stringify` with
    // an indent inserts newlines of its own between keys and nothing else below
    // U+0020, so any OTHER control character in this text would be a value's raw
    // byte — precisely what the deleted paragraphs said `jq` chokes on.
    expect(rawControlBytes(text)).toEqual([]);

    // A `toBeTruthy` on a parse would pass on `"null"`. The round trip is the
    // assertion: the hostile bytes came back as the values that went in.
    expect(JSON.parse(text)).toEqual(value);
  });
});

/** A resolved profile, fully typed — no cast, so a shape change breaks here. */
const PROFILE: ResolvedProfile = {
  name: "acme",
  source: "active",
  profile: { apiKey: "nxs_test", orgName: "Acme Corp" }
};

/**
 * Run `body` with `process.stderr.isTTY` forced TRUE, and put the descriptor back.
 *
 * `printContextBanner` has TWO guards and a test runner satisfies the second one
 * for free, which is exactly how a deleted first guard reads green.
 */
function asTTY(body: () => void): void {
  const original = Object.getOwnPropertyDescriptor(process.stderr, "isTTY");
  Object.defineProperty(process.stderr, "isTTY", { value: true, configurable: true });
  try {
    body();
  } finally {
    if (original) Object.defineProperty(process.stderr, "isTTY", original);
    else delete (process.stderr as { isTTY?: boolean }).isTTY;
  }
}

describe("the diagnostic channel never reaches stdout under `--json`", () => {
  /**
   * THE OTHER HALF OF BOTH CORRECTED PARAGRAPHS. They now tell a caller that the
   * document is clean and that MERGING THE STREAMS is what breaks the pipe. That
   * is two claims about this package, and both are run here.
   */
  it("a warning goes to stderr, and a second document is diverted there too", () => {
    printRecord({ id: "n-1", content: SCRAPED_CONTENT });
    printWarning("this deployment has no credential", "run `nexus credential list`");
    printSuccess("Node created.");

    // stdout still holds exactly the ONE document, and it still parses.
    expect(channels.stdout).toHaveLength(1);
    const [document = ""] = channels.stdout;
    expect(JSON.parse(document)).toEqual({ id: "n-1", content: SCRAPED_CONTENT });

    // The warning is PROSE on stderr — this is the byte that kills `2>&1 | jq`.
    expect(channels.stderr.join("")).toContain("this deployment has no credential");
    // The second document is diverted rather than concatenated onto stdout.
    expect(channels.stderr.join("")).toContain('"message": "Node created."');
  });

  it("the profile banner writes NOTHING under `--json` — not even to stderr", () => {
    // 🚨 THE CORRECTION INSIDE THE CORRECTION. Both guides said "warnings and the
    // profile banner go to STDERR", and the banner does not: `printContextBanner`
    // returns on `_jsonMode` before it reaches the TTY check, so under `--json` it
    // is suppressed outright and cannot contaminate `2>&1` at all. Naming it as a
    // contaminant sends a reader looking for a line that is never written.
    //
    // 🚨 THE TTY FORCING IS WHAT MAKES THIS CASE MEAN ANYTHING. Under a test
    // runner `process.stderr.isTTY` is undefined, so the SECOND guard suppresses
    // the banner on its own and the assertion below passes whether or not the
    // `_jsonMode` guard exists at all. Measured by mutation: with the guard
    // deleted this case still read green until the TTY was forced true. A fixture
    // that never reaches the line under test is not coverage.
    asTTY(() => {
      // CONTROL — outside JSON mode the same call DOES write, so the silence
      // below is the `_jsonMode` guard and not the harness.
      setJsonMode(false);
      printContextBanner(PROFILE);
      expect(channels.stderr.join("")).toContain("acme");

      channels.stderr.length = 0;
      setJsonMode(true);
      printContextBanner(PROFILE);

      expect(channels.stderr).toEqual([]);
      expect(channels.stdout).toEqual([]);
    });
  });
});

describe("a guide's `--json` claim is one this CLI still honours", () => {
  const claiming = [...servedGuides()]
    .map(([type, guide]) => ({ type, claims: findJsonDocumentClaims(guide) }))
    .filter(({ claims }) => claims.length > 0);

  // No floor on this population, deliberately — see the header. An estate that
  // stopped discussing `--json` is a healthy one here, and it is green.
  it("every guide making a `--json` claim has a witness for it", () => {
    const unwitnessed = claiming
      .filter(({ type }) => JSON_WITNESSES[type] === undefined)
      .map(({ type, claims }) => ({ type, sentence: firstSentence(claims) }));

    expect(unwitnessed).toEqual([]);
  });

  it("no guide says a `--json` document is unparseable, because it demonstrably parses", () => {
    // The witnesses above ran the real emitter over the exact values these guides
    // blame and got documents back that `JSON.parse` accepts. A guide asserting
    // the opposite is the paragraph NEX-4141 deleted, regrown.
    const contradicted = claiming.flatMap(({ type, claims }) =>
      claims
        .filter((c) => c.subject === "document" && c.saysBroken)
        .map((c) => ({ type, sentence: c.sentence.slice(0, 140) }))
    );

    expect(contradicted).toEqual([]);
  });
});
