import { Command } from "commander";
import { describe, expect, it } from "vitest";

import { indexCommandTree } from "./command-tree-index";
import { captureHelp } from "./command-universe";
import { bindCommand, boundCommand, enumOption } from "./contract-binding";
import type { ProjectedDescriptor } from "./contract-help.render";
import { buildRootProgram, VERSION } from "./root-program";

/**
 * `bindCommand` MUST BE CALLED LAST, AND THIS IS THE ONLY THING THAT SAYS SO.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE EXISTS: A GATE THAT WAS CLAIMED AND DID NOT EXIST
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `contract-binding.ts` instructed every caller to call `bindCommand` last and
 * asserted, in its own docblock, that the gate would turn a wrong order into a
 * red build. It would not. `commands/contract-help.test.ts` — the gate it meant
 * — reads `boundCommand(cmd)`, `cmd.options`, `argChoices` and `bodyOnly`, every
 * one of them a property of the FULLY BUILT command. Those are
 * order-INDEPENDENT by construction, not weakly: no number of such assertions
 * can ever refuse a wrong order, because the object they inspect is identical
 * whichever order produced it. Fifteen green tests sat over the hole.
 *
 * ── WHAT THE ORDER ACTUALLY DECIDES ─────────────────────────────────────────
 *
 * `bindCommand` appends the generated contract block through
 * `addHelpText("after", …)`, and commander emits every `after` text in
 * REGISTRATION order. So the call's position decides where the generated block
 * lands relative to the command's own hand-written `Examples:` and `Notes:` —
 * the half carrying the meaning no schema holds. Measured on commander 13.1.0,
 * one synthetic command, the two orders differing in nothing else, by
 * {@link https://github.com/tj/commander.js | commander}'s own rendering:
 *
 *   bind-LAST   generated@295  Examples@227  Notes@263  --print-contract@105
 *   bind-FIRST  generated@227  Examples@338  Notes@374  --print-contract@41
 *
 * Bound first, the generated reference prints ABOVE the prose a human wrote and
 * `--print-contract` jumps to the top of the options table. Shape generated,
 * meaning hand-written, and the operator reads them in the wrong order. The
 * second case below pins that inversion rather than describing it.
 *
 * ── WHY IT READS THE RENDERED TEXT AND NOT THE COMMAND ──────────────────────
 *
 * 🚨 `helpInformation()` IS NOT THE ARTIFACT. It stops at the options table and
 * omits every `addHelpText` block, so the whole subject of this file is absent
 * from it. {@link captureHelp} drives `outputHelp()` through a captured writer,
 * which is the only text an operator ever sees. Reusing it rather than repeating
 * its save/restore dance is deliberate — that function's header says why a
 * second copy drifts.
 *
 * ── THE POPULATION IS DERIVED, NOT LISTED ───────────────────────────────────
 *
 * Every bound command in the REAL root program, found by asking
 * `boundCommand()`. A command added tomorrow is in the population the moment it
 * is registered, and a list in this file would go stale in silence. The floors
 * below are the counts the scan observed, so a walk that quietly stops finding
 * commands fails instead of passing over an empty loop.
 */

/**
 * The command's own prose, as it appears in rendered help.
 *
 * ⚠️ MATCHED ON THE SECTION HEADER, NOT ON THE AFTER-TEXT OBJECT. The
 * `afterHelp` listeners can be read back and partitioned by registration order,
 * and asserting on THAT would be circular: commander renders in registration
 * order, so "every text registered before the block appears before the block"
 * is true by construction and refuses nothing. The header is an independent
 * handle on the same prose — it says where a human's writing is, without
 * reference to when it was registered.
 *
 * Measured across the live tree: all 242 bound commands that render a block
 * carry one of these headers, and NO tree-wide footer does — so this cannot miss
 * the subject and cannot be tripped by a global epilogue.
 */
const PROSE_HEADER = /^(Examples|Notes):$/gm;

/** Where the command's own prose ENDS — the last header in the rendering. */
function lastProseHeaderAt(help: string): number {
  let last = -1;
  for (const match of help.matchAll(PROSE_HEADER)) last = match.index;
  return last;
}

interface Verdict {
  readonly checked: number;
  readonly boundTotal: number;
  /** Bound, but the descriptor renders no block at all — nothing to order. */
  readonly noBlock: string[];
  /** The block is registered and does not appear in the rendering. */
  readonly anchorUnlocatable: string[];
  /** No hand-written header, so there is nothing to order the block against. */
  readonly noProse: string[];
  /** The generated block prints ABOVE the prose. The defect. */
  readonly inverted: string[];
}

function scan(): Verdict {
  const index = indexCommandTree(buildRootProgram(VERSION));
  const verdict: Verdict = {
    checked: 0,
    boundTotal: 0,
    noBlock: [],
    anchorUnlocatable: [],
    noProse: [],
    inverted: []
  };
  const counts = { checked: 0, boundTotal: 0 };

  for (const [path, command] of index) {
    const binding = boundCommand(command);
    if (!binding) continue;
    counts.boundTotal += 1;

    // The anchor is DERIVED from the binding the command itself carries, never
    // typed in: a route renamed upstream would otherwise make every search miss
    // and every command pass.
    const anchor = `Contract (${binding.shape.method} ${binding.shape.route}):`;
    const help = captureHelp(command);

    const generatedAt = help.indexOf(anchor);
    const proseAt = lastProseHeaderAt(help);

    if (generatedAt === -1) {
      // Two different facts wearing one symptom. An empty descriptor renders no
      // block on purpose; a non-empty one whose block is missing from the
      // rendering is a real failure, and reporting both as "absent" would bury
      // it. `renderHelpBlock` returns "" only when there are no fields.
      if (binding.shape.fields.length === 0) verdict.noBlock.push(path);
      else verdict.anchorUnlocatable.push(`${path} — expected ${anchor}`);
      continue;
    }

    if (proseAt === -1) {
      verdict.noProse.push(path);
      continue;
    }

    counts.checked += 1;
    // 🚨 BOTH OFFSETS ARE PROVEN PRESENT ABOVE, AND THAT IS NOT CEREMONY. A
    // missing needle is -1, and `-1 > anything` is false — so an unlocatable
    // anchor or absent prose would satisfy this comparison and read as
    // CORRECTLY ORDERED. The guards are what stop a broken search scoring as a
    // pass.
    if (generatedAt < proseAt) {
      verdict.inverted.push(
        `${path}: the generated contract block prints at ${generatedAt}, ABOVE the ` +
          `hand-written prose at ${proseAt} — call bindCommand AFTER addHelpText`
      );
    }
  }

  return { ...verdict, checked: counts.checked, boundTotal: counts.boundTotal };
}

const VERDICT = scan();

describe("the generated contract block prints below the hand-written prose", () => {
  it("has no command whose generated block prints above its own Examples or Notes", () => {
    expect(VERDICT.inverted).toEqual([]);
  });

  it("locates the block in the rendering of every command that registers one", () => {
    // A block that is registered and unfindable in the text makes the assertion
    // above vacuous for that command, so it is a failure in its own right rather
    // than a skip.
    expect(VERDICT.anchorUnlocatable).toEqual([]);
  });

  it("checked a population the size the scan observed", () => {
    // 🚨 THE FLOOR IS WHAT KEEPS THE ARM ABOVE HONEST. Every assertion here is
    // an `expect([]).toEqual([])` over a DISCOVERED population, which passes
    // perfectly over zero commands — and a renamed export, a failed registrar
    // walk or a `boundCommand` that stopped resolving all produce exactly that.
    //
    // Measured 2026-10-08: 250 bound commands, 242 rendering a block and
    // carrying prose, 8 with an empty descriptor and no block. The floors sit
    // below those so an ordinary command landing or leaving does not move them;
    // re-derive rather than trusting these numbers:
    //
    //   pnpm --filter @agent-nexus/cli exec vitest run \
    //     src/contract-binding.help-order.test.ts
    expect(VERDICT.boundTotal).toBeGreaterThanOrEqual(200);
    expect(VERDICT.checked).toBeGreaterThanOrEqual(200);
    // Every bound command is accounted for in exactly one bucket: no row is
    // silently dropped on the way through the scan.
    expect(
      VERDICT.checked +
        VERDICT.noBlock.length +
        VERDICT.noProse.length +
        VERDICT.anchorUnlocatable.length
    ).toBe(VERDICT.boundTotal);
  });
});

/**
 * THE IN-SUITE NEGATIVE CONTROL.
 *
 * The three assertions above are green on a correctly ordered tree, and a green
 * assertion is a hypothesis until something has been seen to break it. This pair
 * breaks it on purpose, in a synthetic command, so the arm's ability to tell the
 * two orders apart is pinned permanently rather than only on the day somebody
 * ran the mutation by hand.
 *
 * It also carries the one consequence the live tree cannot show. The generated
 * block prints `Not offered: <values> — <reason>` for a declared NARROWING, and
 * `bindCommand` collects those by reading `command.options` at call time — so
 * bound first, the reason a value is withheld disappears from `--help`
 * altogether. Measured across the live tree: 9 divergences are declared and
 * every one is a WIDENING (`alsoAccepts`), so `omit` is empty everywhere and
 * that line renders on NO shipped command. An arm asserting it against the real
 * tree would have a denominator of zero. Here the denominator is one, and it is
 * real.
 */
const SHAPE = {
  name: "Thing",
  method: "POST",
  route: "/public/v1/things",
  fields: [
    { path: "Body.name", slot: "Body", type: "string", required: true, depth: 0 },
    {
      path: "Body.kind",
      slot: "Body",
      type: "string",
      required: true,
      depth: 0,
      enumValues: ["A", "B", "C"]
    }
  ]
} as const satisfies ProjectedDescriptor;

const SOURCE = { path: "Thing.Body.kind", contractValues: ["A", "B", "C"] } as const;

function renderProbe(bindFirst: boolean): string {
  const program = new Command();
  program.name("nexus").exitOverride();
  const command = program.command("thing");

  const addOwnSurface = (): void => {
    command.addOption(
      enumOption("--kind <k>", "The kind", SOURCE, { omit: ["C"], because: "C answers 500" })
    );
    command.addHelpText(
      "after",
      "\nExamples:\n  $ nexus thing --kind A\n\nNotes:\n  Hand-written meaning."
    );
  };

  if (bindFirst) {
    bindCommand(command, SHAPE);
    addOwnSurface();
  } else {
    addOwnSurface();
    bindCommand(command, SHAPE);
  }

  command.action(() => undefined);
  return captureHelp(command);
}

describe("the order is what decides it — commander 13.1.0", () => {
  it("puts the block below the prose when bindCommand is called LAST", () => {
    const help = renderProbe(false);
    const generatedAt = help.indexOf("Contract (POST /public/v1/things):");
    const proseAt = lastProseHeaderAt(help);

    expect(generatedAt).toBeGreaterThan(-1);
    expect(proseAt).toBeGreaterThan(-1);
    expect(generatedAt).toBeGreaterThan(proseAt);
    // The declared narrowing's reason reaches the operator.
    expect(help).toContain("Not offered: C — C answers 500");
    // And `--print-contract`, which bindCommand registers itself, sits below the
    // command's own flags rather than ahead of them.
    expect(help.indexOf("--print-contract")).toBeGreaterThan(help.indexOf("--kind"));
  });

  it("INVERTS all three when bindCommand is called FIRST", () => {
    const help = renderProbe(true);
    const generatedAt = help.indexOf("Contract (POST /public/v1/things):");
    const proseAt = lastProseHeaderAt(help);

    expect(generatedAt).toBeGreaterThan(-1);
    expect(proseAt).toBeGreaterThan(-1);
    // The whole finding, in one assertion: nothing about the built command
    // changes between these two cases, and the rendering does.
    expect(generatedAt).toBeLessThan(proseAt);
    // The option was added after the block was rendered, so the block never saw
    // the divergence and the reason is gone from shipped output.
    expect(help).not.toContain("Not offered:");
    expect(help.indexOf("--print-contract")).toBeLessThan(help.indexOf("--kind"));
  });
});
