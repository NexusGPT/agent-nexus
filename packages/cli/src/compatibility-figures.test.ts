import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { eachOrRefuse } from "@nexus/types/testing/each-or-refuse";
import { beforeAll, describe, expect, it } from "vitest";

import {
  COMMAND_CLASSIFICATION,
  deriveCommandLeaves,
  deriveCommandNodes,
  isHiddenCommand
} from "./command-universe";
import { EXEMPT_LEAVES } from "./commands/json-one-document.scan";
import { JSON_SHAPES } from "./json-shape.generated";
import { buildRootProgram, VERSION } from "./root-program";
import { isConfirmable } from "./util/confirm";
import { buildCommandTree } from "./util/global-option-shadowing";

/**
 * EVERY NUMBER `COMPATIBILITY.md` ASSERTS ABOUT THIS PACKAGE, DERIVED.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHAT WENT WRONG
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `COMPATIBILITY.md` is the stability contract this package asks people to hold
 * it to, and it shipped with claims that were false on the day they were
 * written. Two of them contradicted figures the SAME FILE quotes correctly
 * twelve paragraphs away — it said "around forty commands build their own
 * document" beside its own "103 write their own document", and "drives every
 * leaf" for a gate that exempts seven.
 *
 * ── WHY IT ROTTED, WHICH IS THE ONLY THING WORTH FIXING ──────────────────────
 *
 * Nothing read the file. Every figure in it was typed by hand beside a package
 * that derives the same figures in code, and the only reference to it anywhere
 * was a link in `README.md`. A contract nothing checks is a contract that is
 * wrong again by the next release, and being wrong is worse than being absent:
 * a documented promise nobody enforces reads exactly like an enforced one.
 *
 * ── HOW A CLAIM IS PINNED ────────────────────────────────────────────────────
 *
 * Each row below is a REGEX with capture groups plus the derivation those
 * captures must equal. The regex is what anchors a number to its sentence —
 * asserting the file "contains 44" would pass on any 44 anywhere, including the
 * one in a different claim.
 *
 * 🚨 A REGEX THAT STOPS MATCHING IS A FAILURE, NEVER A SKIP. Reword a sentence
 * and its number goes unchecked forever, silently, which is the same rot in a
 * new place. {@link CLAIMS} is driven through `eachOrRefuse`, every row asserts
 * it matched EXACTLY ONCE, and a row that matches zero times fails naming
 * itself.
 *
 * ── WHAT THIS CANNOT DO ──────────────────────────────────────────────────────
 *
 *  - It checks NUMBERS, not prose. "38 of the 44 declare the flag through
 *    `confirmable()`" is pinned on both numerals and on nothing else; if the
 *    helper is renamed the sentence goes stale and this gate stays green.
 *  - It cannot notice a claim nobody pinned. A new paragraph asserting a new
 *    figure is unprotected until someone adds a row here, exactly as the
 *    `--yes` population was unprotected until someone counted it.
 *  - Whitespace is normalized before matching, because the file wraps at ~80
 *    columns and every one of these sentences spans a line break.
 */

const DOC = join(dirname(fileURLToPath(import.meta.url)), "..", "COMPATIBILITY.md");

/** The file as one line, so a wrapped sentence is matchable. */
let doc = "";

/** Everything derived once, because several rows share a walk. */
let derived: Record<string, number> = {};

beforeAll(async () => {
  doc = readFileSync(DOC, "utf-8").replace(/\s+/g, " ");

  const root = buildRootProgram(VERSION);
  const tops = root.commands.filter((command) => command.name() !== "help");
  const nodes = await deriveCommandNodes();
  const leaves = await deriveCommandLeaves();

  const everyCommand = (
    parent: ReturnType<typeof buildCommandTree>,
    trail: string[] = []
  ): Array<[string, (typeof parent.commands)[number]]> =>
    parent.commands.flatMap((child) => {
      const path = [...trail, child.name()];
      return [
        [path.join(" "), child] as [string, (typeof parent.commands)[number]],
        ...everyCommand(child, path)
      ];
    });

  const withYes = everyCommand(buildCommandTree()).filter(([, command]) =>
    command.options.some((option) => option.long === "--yes")
  );
  const scan = await import("./util/destructive-confirmation.scan");
  const candidates = scan.destructiveCandidates(buildCommandTree());

  // The `writes-its-own-json` total is generated into `json-shape.generated.ts`
  // and `json-shape.codegen.test.ts` recomputes that file and fails on any
  // difference, so reading it here is reading a derived artifact rather than a
  // number somebody typed.
  const generated = readFileSync(join(dirname(DOC), "src", "json-shape.generated.ts"), "utf-8");
  const selfJson = /(\d+)\s+writes-its-own-json/.exec(generated);

  derived = {
    topLevel: tops.length,
    // `isHiddenCommand`, never a `_hidden` read. That field is private and
    // undeclared, so a rename upstream yields `undefined`, `undefined === true`
    // is false, and every hidden command would report itself VISIBLE with no
    // compiler error — which is the defect `command-universe.ts` exists to
    // prevent. It asks commander's own help filter what it would render.
    // `hidden` is 0 today, so a broken read and the truth agree; that is
    // precisely when a silent-failing detector stops being noticed.
    visible: tops.filter((command) => !isHiddenCommand(command)).length,
    hidden: tops.filter((command) => isHiddenCommand(command)).length,
    rootOptions: root.options.length,
    nodes: nodes.length,
    leaves: leaves.length,
    classified: Object.keys(COMMAND_CLASSIFICATION).length,
    safe: Object.values(COMMAND_CLASSIFICATION).filter((d) => d === "safe").length,
    declaresYes: withYes.length,
    viaConfirmable: withYes.filter(([, command]) => isConfirmable(command)).length,
    handRolled: withYes.filter(([, command]) => !isConfirmable(command)).length,
    destructiveCandidates: candidates.length,
    confirmsBeforeActing: scan.CONFIRMS_BEFORE_ACTING.length,
    notDestructive: Object.keys(scan.NOT_DESTRUCTIVE).length,
    unconfirmedDestructive: Object.keys(scan.UNCONFIRMED_DESTRUCTIVE).length,
    destructiveVerbs: scan.DESTRUCTIVE_VERBS.length,
    shapeLines: Object.keys(JSON_SHAPES).length,
    exempt: EXEMPT_LEAVES.length,
    driven: leaves.length - EXEMPT_LEAVES.length,
    writesItsOwnJson: selfJson === null ? -1 : Number(selfJson[1])
  };
});

interface Claim {
  /** What the sentence says, for the failure message. */
  readonly claim: string;
  /** Anchored to its sentence. Every capture group is a number to check. */
  readonly pattern: RegExp;
  /** The derivation keys, in capture-group order. */
  readonly keys: readonly string[];
}

const CLAIMS: readonly Claim[] = [
  {
    claim: "the CLI registers N top-level commands, M visible, H hidden",
    pattern:
      /registers \*\*(\d+) top-level commands\*\*, of which \*\*(\d+) are visible\*\* and (\d+) are hidden/,
    keys: ["topLevel", "visible", "hidden"]
  },
  {
    claim: "N command nodes and M invocable leaves",
    pattern: /Under them sit \*\*(\d+) command nodes\*\* and \*\*(\d+) invocable leaves\*\*/,
    keys: ["nodes", "leaves"]
  },
  {
    claim: "the 49 visible namespaces heading",
    pattern: /The (\d+) visible namespaces:/,
    keys: ["visible"]
  },
  {
    claim: "N commands declare --yes",
    pattern: /\*\*(\d+) commands declare `--yes`\*\*/,
    keys: ["declaresYes"]
  },
  {
    claim: "all N declare the flag through confirmable()",
    pattern: /All (\d+) declare the flag through `confirmable\(\)`/,
    keys: ["declaresYes"]
  },
  {
    claim: "destructiveCandidates derives N candidates by verb",
    pattern: /derives \*\*(\d+)\*\* candidates by verb/,
    keys: ["destructiveCandidates"]
  },
  {
    claim: "the three declared sets partition the candidates",
    pattern:
      /`CONFIRMS_BEFORE_ACTING` \| (\d+) \|[^|]*\|[\s\S]*?`NOT_DESTRUCTIVE` \| (\d+) \|[^|]*\|[\s\S]*?`UNCONFIRMED_DESTRUCTIVE` \| (\d+) \|/,
    keys: ["confirmsBeforeActing", "notDestructive", "unconfirmedDestructive"]
  },
  {
    claim: "N destructive commands do not confirm",
    pattern: /AND (\d+) DESTRUCTIVE\s+COMMANDS DO NOT CONFIRM/,
    keys: ["unconfirmedDestructive"]
  },
  {
    claim: "the verb list holds N verbs",
    pattern: /carries none of those (\d+) verbs/,
    keys: ["destructiveVerbs"]
  },
  {
    claim: "the driven gate refuses on all N",
    pattern: /\*\*All (\d+) refuse, and that is DRIVEN/,
    keys: ["declaresYes"]
  },
  {
    claim: "N leaves build their own document",
    pattern: /\*\*(\d+) leaves build their own document with a bare `console\.log`\*\*/,
    keys: ["writesItsOwnJson"]
  },
  {
    claim: "the one-document gate drives N of the M leaves",
    pattern: /which drives \*\*(\d+) of the (\d+) leaves\*\*/,
    keys: ["driven", "leaves"]
  },
  {
    claim: "the reliance line names the driven population",
    pattern: /never choking on a banner — on the (\d+) leaves the gate drives/,
    keys: ["driven"]
  },
  {
    claim: "N of the M leaves carry a derived shape line",
    pattern: /\*\*(\d+) of the (\d+) leaves\*\* carry a derived shape line/,
    keys: ["shapeLines", "leaves"]
  },
  {
    claim: "today: N leaves, M classified safe",
    pattern: /Today: (\d+) leaves, \*\*0 unclassified, 0 stale\*\*, (\d+) classified `safe`/,
    // `leaves`, NOT the size of COMMAND_CLASSIFICATION. The sentence counts
    // LEAVES; the map's size is a different fact that happens to equal it only
    // while nothing is unclassified. Pinning the doc to the map would let a
    // stale leaf count and a stale map agree with each other forever.
    keys: ["leaves", "safe"]
  },
  {
    claim: "upgrade.ts registers N hidden top-level commands",
    pattern: /registers \*\*(\d+)\*\* hidden top-level commands beside/,
    keys: ["hidden"]
  },
  {
    claim: "the walk verified N top-level, M visible, H hidden",
    pattern: /Verified by walking the tree: (\d+) top-level commands, (\d+) visible, (\d+) hidden/,
    keys: ["topLevel", "visible", "hidden"]
  },
  {
    claim: "captureHelp renders all N nodes",
    pattern: /renders all (\d+) nodes/,
    keys: ["nodes"]
  }
];

describe("controls", () => {
  it("reads a COMPATIBILITY.md with content in it", () => {
    // Without this every regex would fail to match on an empty string and the
    // suite would be a wall of identical, meaningless reds.
    expect(doc.length).toBeGreaterThan(20_000);
    expect(doc).toContain("This is the stability contract for the `nexus` binary");
  });

  it("derived every figure the claims below reference", () => {
    const referenced = [...new Set(CLAIMS.flatMap((claim) => claim.keys))];
    const missing = referenced.filter((key) => derived[key] === undefined || derived[key] < 0);
    expect(
      missing,
      "A derivation returned nothing. Every assertion below would then compare a " +
        "number against undefined, which is a red for the wrong reason."
    ).toEqual([]);
  });

  it("NEGATIVE: a pattern that should not match does not", () => {
    // Proves a non-match is detectable, which is what every row's
    // matched-exactly-once assertion rests on.
    expect(/registers \*\*(\d+) top-level penguins\*\*/.test(doc)).toBe(false);
  });
});

describe("every figure COMPATIBILITY.md asserts is the derived one", () => {
  it.each(eachOrRefuse(CLAIMS, "pinned COMPATIBILITY.md figures"))(
    "$claim",
    ({ claim, pattern, keys }) => {
      const matches = [...doc.matchAll(new RegExp(pattern, "g"))];

      expect(
        matches.length,
        `NO SENTENCE MATCHED for "${claim}".\n` +
          `Pattern: ${pattern}\n` +
          `The sentence was reworded, moved or deleted. A number nobody matches is a ` +
          `number nobody checks, which is exactly how this file went wrong — so this ` +
          `is a failure, never a skip. Re-anchor the pattern to the new wording, or ` +
          `delete this row if the claim is genuinely gone.`
      ).toBe(1);

      const found = matches[0].slice(1, keys.length + 1).map(Number);
      const want = keys.map((key) => derived[key]);

      expect(
        found,
        `COMPATIBILITY.md says ${JSON.stringify(found)} where this package derives ` +
          `${JSON.stringify(want)} (${keys.join(", ")}).\n` +
          `The DOCUMENT is what is stale — the derivation reads the live command tree. ` +
          `Update the sentence for "${claim}" and any prose around it that repeats the ` +
          `old number. If your change moved one of these figures deliberately, that is ` +
          `a change to a published stability contract and belongs in CHANGELOG.md too.`
      ).toEqual(want);
    }
  );
});
