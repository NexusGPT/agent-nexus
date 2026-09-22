import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { eachOrRefuse } from "@nexus/types/testing/each-or-refuse";
import { shrinkOnlyLedger } from "@nexus/types/testing/shrink-only-ledger";
import { describe, expect, it } from "vitest";

import { listFilesRecursively } from "./util/list-files-recursively";

/**
 * A SHRINK-ONLY LEDGER OF FILE SIZES OVER `packages/cli/src`, SO NO FILE IN THIS
 * PACKAGE CAN GROW WITHOUT SOMEBODY TYPING A BIGGER NUMBER INTO THIS TABLE.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * EVERY ROW IS A CLAIM: "this file is EXACTLY this many lines". Not a budget, not
 * a target — a measurement. A row may only ever go DOWN.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * ── WHAT THIS IS FOR ────────────────────────────────────────────────────────
 *
 * `commands/role.ts` was one multi-thousand-line file. It was split into one
 * file per subcommand, and the split is held in place by an ESLint `max-lines`
 * cap of 150 armed at the END of the root `eslint.config.js` — scoped to
 * `commands/role.ts` and `commands/role/**` and nothing else. That scoping is
 * deliberate and correct: arming the flat rule over the whole package would red
 * 152 files at once, and a gate that reds 152 files on the day it lands gets
 * reverted rather than obeyed.
 *
 * So the rest of the package had NO ceiling at all. `command-universe.ts` is
 * 1,618 lines and could become 5,000 one "small addition" at a time, with
 * nothing to point at — which is exactly how `role.ts` got to where it was.
 *
 * This table is the ceiling for everything the flat rule cannot yet reach. It
 * absorbs today's sizes so the gate can refuse tomorrow's growth.
 *
 * ── WHY IT CAN ONLY SHRINK ──────────────────────────────────────────────────
 *
 * The four properties below pin each row to its file from BOTH sides: a file
 * bigger than its row reds, and a row bigger than its file reds too. There is no
 * headroom anywhere in this table, and that is the whole design.
 *
 * 🚨 SLACK IS THIS GATE SWITCHED OFF — those are the shipped primitive's own
 * words about its `ceiling`, and they are why this ledger pins each row instead
 * of treating it as an upper bound. A row of 4,204 over a 3,000-line file is not
 * a generous budget; it is 1,204 lines of growth that will never be seen by
 * anybody, because a file that shrinks and keeps its old number has simply
 * banked the difference.
 *
 * ── THE ONE LEGAL WAY TO CHANGE A NUMBER ────────────────────────────────────
 *
 * Make the file smaller, and lower its row in the SAME COMMIT.
 *
 * Split it, delete dead code, move a concern into its own file. When the file
 * drops to 150 lines or fewer, DELETE its row and lower `LEDGER_CEILING` by one
 * in the same diff — at which point the file is also clean under the same
 * `max-lines` 150 the role ratchet enforces, so a file leaves this ledger
 * exactly when it becomes ratchet-clean. That alignment is the point of the
 * number 150: this ledger and that lint rule are the same gate at two
 * granularities.
 *
 * ⚠️ RAISING A ROW IS NOT ON THAT LIST, AND THE FRICTION IS THE FEATURE. Adding
 * 40 lines to `command-universe.ts` reds this spec until somebody edits `1618`
 * to `1658` — a one-line diff that a reviewer sees and can argue with. The gate
 * does not forbid growth; it forbids growth NOBODY DECIDED. If the bigger number
 * is genuinely right, write it, and say in the commit why the file had to grow
 * rather than split.
 *
 * ── HOW THE LINES ARE COUNTED ───────────────────────────────────────────────
 *
 * {@link countLines} is ESLint's `max-lines` algorithm under
 * `skipBlankLines: false, skipComments: false`, reproduced exactly: split on
 * ESLint's own `lineBreakPattern`, then drop ONE trailing empty line. Verified
 * against the real thing rather than assumed, and RE-DERIVED rather than quoted
 * — from `packages/cli`, redirected because the JSON runs to megabytes:
 *
 * ```
 * pnpm exec eslint src --rule '{"max-lines":["error",{"max":1,"skipBlankLines":false,"skipComments":false}]}' -f json
 * ```
 *
 * `max: 1` makes every file exceed the cap and report its own line count in the
 * refusal, and every count ESLint reports equals the number this function
 * returns. That is what makes "the row reached 150 and the file is now
 * lint-clean" a true statement and not a hopeful one.
 *
 * ⚠️ NO CARDINAL FOR THAT RUN IS WRITTEN HERE, AND THE POPULATION IS WHY. It
 * lints every `.ts` file under `src` — `*.test.ts` and generated files included
 * — which is WIDER than this ledger's own {@link isSource}, so its count is
 * neither `POPULATION.length` nor anything else this spec holds. A figure for it
 * moves with every file anyone adds, sits on a line nothing re-derives, and goes
 * on reading as a checked fact; worse, a reader comparing it against this
 * ledger's population is comparing two different sets and will find a
 * disagreement that was never there.
 *
 * ⚠️ THE DISCRIMINATING CONTROL IS THE TRAILING-EMPTY-LINE POP. Drop it and the
 * agreement falls to ZERO rather than to nearly-all, because every file in this
 * package ends in a newline — so the pop is load-bearing on every single one. An
 * agreement measured without that control is a comparison that would have looked
 * identical whatever this function did.
 *
 * ── WHAT IS DELIBERATELY NOT IN THE POPULATION ──────────────────────────────
 *
 * `*.test.ts` files, which have no size gate anywhere in this repository — the
 * role ratchet carries the same `ignores: ["**\/*.test.ts"]`. This spec is
 * itself a `.test.ts`, so the table does not have to carry a row for the file
 * that holds it, and adding a row cannot change its own number.
 *
 * GENERATED files ARE in the population (`*.generated.ts`, `*.ledger.ts`). A
 * generated file that grows without bound is still a file that grows without
 * bound, and an exclusion list is the hole this gate exists to close.
 */

/**
 * The size at which a file needs a row. The same 150 the role ratchet enforces,
 * so the two gates hand off to each other exactly.
 */
const CEILING_LINES = 150;

/**
 * EXACT CURRENT LINE COUNT, per non-test file over {@link CEILING_LINES}.
 * Sorted by path so a row moves only when its own file does.
 */
const LEDGER: Readonly<Record<string, number>> = {
  "admin-wire-types.conformance.ts": 487,
  "admin-wire-types.ts": 262,
  "auth-probe.ts": 318,
  "cli-surface.baseline.generated.ts": 539,
  "cli-surface.generated.ts": 629,
  "cli-surface.model.ts": 159,
  "cli-surface.project.ts": 417,
  "client.ts": 240,
  "command-universe.ts": 1627,
  "commands/access-card.ts": 355,
  "commands/admin-vibe-build-job.ts": 246,
  "commands/admin-vibe-consumption-cap.ts": 208,
  "commands/admin-vibe-cost-safety.ts": 307,
  "commands/admin-vibe-cron-sweeps.ts": 174,
  "commands/admin-vibe-deployment.ts": 288,
  "commands/admin-vibe-tenant-cluster.ts": 448,
  "commands/agent-collection.ts": 179,
  "commands/agent-skill.ts": 724,
  "commands/agent-tool.ts": 406,
  "commands/agent.contract.generated.ts": 293,
  "commands/agent.ts": 665,
  "commands/analytics.contract.generated.ts": 169,
  "commands/analytics.ts": 520,
  "commands/api.ts": 269,
  "commands/apps-deploy-state.ts": 277,
  "commands/apps-git-local.ts": 197,
  "commands/apps-logs.ts": 485,
  "commands/apps-rollback-target.ts": 317,
  "commands/apps-starter.ts": 206,
  // Arrived whole from origin/staging with `nexus apps vendor-package` (#6206),
  // which landed while this branch was splitting commands/apps.ts. Rowed rather
  // than split: re-cutting a feature merged hours ago, inside a merge
  // resolution, would change code neither side of this merge wrote. Splitting
  // them is its own change against staging.
  "commands/apps-vendor-package-plan.ts": 223,
  "commands/apps-vendor-package.ts": 271,
  "commands/apps-watch.ts": 463,
  "commands/asset.ts": 272,
  "commands/channel.contract.generated.ts": 167,
  "commands/channel.ts": 1390,
  "commands/chat.ts": 697,
  "commands/claude-code.ts": 587,
  "commands/cloud-import.ts": 623,
  "commands/collection.contract.generated.ts": 155,
  "commands/collection.ts": 762,
  "commands/contract-help.ledger.ts": 561,
  "commands/contract-help.namespaces.ts": 522,
  "commands/conversation.contract.generated.ts": 168,
  "commands/conversation.ts": 1017,
  "commands/credential.ts": 500,
  "commands/cue.ts": 182,
  "commands/custom-model.ts": 326,
  "commands/customer.contract.generated.ts": 151,
  "commands/customer.ts": 393,
  "commands/deployment.contract.generated.ts": 304,
  "commands/deployment.ts": 1384,
  "commands/docs.ts": 297,
  "commands/document.ts": 850,
  "commands/emulator.ts": 701,
  "commands/envelope-narrowing.scan.ts": 451,
  "commands/eval-run-render.ts": 283,
  "commands/eval-run.ts": 432,
  "commands/eval.contract.generated.ts": 219,
  "commands/eval.ts": 717,
  "commands/evaluation.ts": 563,
  "commands/execution.ts": 878,
  "commands/external-tool.ts": 884,
  "commands/folder.ts": 296,
  "commands/help-suggestions.ledger.ts": 2258,
  "commands/html-message-template.ts": 381,
  "commands/json-error-document.static-scan.ts": 650,
  "commands/json-one-document.scan.ts": 838,
  "commands/json-shape.command-path.ts": 162,
  "commands/json-shape.project.ts": 166,
  "commands/json-shape.scan.ts": 746,
  "commands/mcp.ts": 608,
  "commands/permissions.contract.generated.ts": 167,
  "commands/permissions.ts": 462,
  "commands/phone-number.ts": 375,
  "commands/prompt-assistant.ts": 615,
  "commands/prompt.ts": 525,
  "commands/role-body-shapes.ts": 554,
  "commands/role-coverage-copy.ts": 164,
  "commands/role.contract.generated.ts": 552,
  "commands/score.ts": 209,
  "commands/skill-folder.ts": 268,
  "commands/skills.ts": 452,
  "commands/status-verdict.scan.ts": 689,
  "commands/task.contract.generated.ts": 263,
  "commands/task.ts": 803,
  "commands/template.ts": 614,
  "commands/ticket.ts": 757,
  "commands/tool.ts": 815,
  "commands/tracing.contract.generated.ts": 232,
  "commands/tracing.ts": 934,
  "commands/tracks.contract.generated.ts": 581,
  "commands/upgrade.ts": 510,
  "commands/user-group.ts": 309,
  "commands/version.ts": 392,
  "commands/workflow-builder.ts": 1163,
  "commands/workflow.ts": 894,
  "commands/workspace-credential-process.ts": 391,
  "commands/workspace-mount-direct.ts": 500,
  "commands/workspace-mount-gateway.ts": 217,
  "commands/workspace-mount-shared.ts": 747,
  "commands/workspace-mount.ts": 661,
  "commands/workspace-remount.ts": 269,
  "commands/workspace-status.ts": 404,
  "commands/workspace-unmount.ts": 187,
  "commands/workspace.ts": 547,
  "config.ts": 589,
  "contract-binding.ts": 430,
  "contract-help.codegen.ts": 237,
  "contract-help.render.ts": 183,
  "deprecation-cycle.ts": 660,
  "docs-page.frontmatter.ts": 375,
  "docs-page.model.ts": 191,
  "docs-page.render.ts": 198,
  "errors.ts": 814,
  "exit-codes.ts": 304,
  "external-tool-wire-types.conformance.ts": 198,
  "id-graph.leaf-residue.ts": 161,
  "id-graph.race.ts": 161,
  "id-graph.ts": 252,
  "id-graph.uncovered.generated.ts": 350,
  "index.ts": 630,
  "json-shape.generated.ts": 464,
  "json-terminal-contract.ts": 369,
  "mount-registry.ts": 718,
  "node-test-verdict.ts": 179,
  "output.ts": 751,
  "probe-barrier.ts": 700,
  "skills-corpus/platform.ts": 163,
  "skills-corpus/select-skill-dirs.ts": 242,
  "util/body-satisfies-required.ts": 398,
  "util/body.ts": 263,
  "util/confirm.ts": 182,
  "util/destructive-confirmation.scan.ts": 549,
  "util/follow-diagnose.ts": 207,
  "util/global-option-shadowing.ts": 152,
  "util/mcp-client-config.ts": 219,
  "util/mcp-rpc.ts": 377,
  "util/mcp-stdio.ts": 227,
  "util/required-field-refusals-name-both-paths.ts": 156,
  "util/resolve-on-path.ts": 284,
  "util/secret-file.ts": 173,
  "util/skill-bundle.ts": 316,
  "util/skills-install.ts": 725,
  "util/tenant-http.ts": 530,
  "util/test-body.ts": 160,
  "util/track-blockers.render.ts": 171,
  "util/track-blockers.ts": 393,
  "util/version-check.ts": 677,
  "util/zip.ts": 173,
  "vibe-wire-types.conformance.ts": 832,
  "vibe-wire-types.ts": 875,
  "workspace-direct-mount.ts": 1477
};

/**
 * How many rows this ledger holds, written out BY HAND.
 *
 * 🚨 It must equal `Object.keys(LEDGER).length` exactly. The primitive THROWS at
 * construction when a ceiling sits above its own ledger, because that gap is
 * slack and slack is the non-growth arm switched off for as many additions as
 * the gap is wide.
 *
 * It is hand-written rather than derived on purpose: `Object.keys(LEDGER).length`
 * would make the arm tautological and prove nothing at all. Adding a row
 * therefore costs a second edit, on this line, in the same diff — which IS the
 * explicit decision this gate exists to buy. Draining rows lowers it in the same
 * change and passes in silence.
 */
const LEDGER_CEILING = 152;

/** The directory this spec lives in, which IS `packages/cli/src`. */
const SRC_ROOT = dirname(fileURLToPath(import.meta.url));

/**
 * ESLint's own `lineBreakPattern`, built from escape sequences so that no
 * source-level line terminator can be introduced here by an editor or a
 * formatter.
 */
const LINE_BREAK = new RegExp("\\r\\n|[\\r\\n\\u2028\\u2029]", "u");

/**
 * ESLint's `max-lines` count under `skipBlankLines: false, skipComments: false`,
 * reproduced exactly.
 *
 * The trailing-empty-line pop is ESLint's, including its `length > 1` guard: a
 * file ending in a newline splits into one extra empty entry that is not a real
 * line, while a wholly empty file still counts as one.
 */
function countLines(text: string): number {
  const lines = text.split(LINE_BREAK);
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return lines.length;
}

const isSource = (name: string): boolean => name.endsWith(".ts") && !name.endsWith(".test.ts");

/**
 * Every non-test source file under `src`, at any depth.
 *
 * `listFilesRecursively` rather than a walker written here: it filters FILES by
 * base name and filters no DIRECTORY at all, so `_`- and `.`-prefixed
 * directories are walked. Its own spec pins that, and a walker that skipped them
 * would quietly drop gated source out of this population while every arm below
 * stayed green.
 */
const POPULATION = listFilesRecursively(SRC_ROOT, isSource);

interface SourceFile {
  readonly path: string;
  readonly lines: number;
}

const MEASURED: readonly SourceFile[] = POPULATION.map((path) => ({
  path,
  lines: countLines(readFileSync(join(SRC_ROOT, path), "utf8"))
}));

const MEASURED_BY_PATH = new Map(MEASURED.map((file) => [file.path, file.lines] as const));

/** The findings: every file that needs a row right now. */
const OVERSIZED = MEASURED.filter((file) => file.lines > CEILING_LINES);

interface LiveRow {
  readonly path: string;
  /** What the ledger claims. */
  readonly row: number;
  /** What the file is. */
  readonly actual: number;
}

const LIVE_ROWS: LiveRow[] = [];
/** Rows naming a path the walk no longer finds. */
const ROWS_NAMING_NOTHING: string[] = [];

for (const [path, row] of Object.entries(LEDGER)) {
  const actual = MEASURED_BY_PATH.get(path);
  if (actual === undefined) ROWS_NAMING_NOTHING.push(path);
  else LIVE_ROWS.push({ path, row, actual });
}

/**
 * The shipped primitive carries four of this gate's arms: the SUBSET arm
 * (property 3 — a file over the ceiling with no row), the non-growth ceiling,
 * the duplicate-key check, and the drain-proof control that gives this spec its
 * denominator floor.
 *
 * 🔴 IT CANNOT CARRY THE TWO NUMERIC ARMS, AND `ledgerCounts` IS NOT THE ANSWER.
 * A `ledgerCounts` row bounds "the most FINDINGS that key may report" — a COUNT
 * of findings, not a magnitude carried by one finding — so expressing a line
 * count that way means emitting one finding PER LINE, and the subset arm's
 * refusal would then print 1,618 entries when `command-universe.ts` loses its row.
 * And even then it only reaches property 1: the primitive states outright that a
 * count ABOVE what the tree reports is "LEGAL AND SILENT", because for a DEBT
 * count the gap is transient and ends when the row drains to nothing.
 *
 * A file never drains to nothing. Its row never goes away, so the gap is
 * PERMANENT HEADROOM — the gate switched off for that file until it regrows past
 * its old size. That is the same thing the primitive refuses for its `ceiling`,
 * one granularity down, which is why properties 1 and 2 are written out below.
 */
const GATE = shrinkOnlyLedger({
  population: `non-test .ts files under packages/cli/src over ${CEILING_LINES} lines`,
  findings: OVERSIZED,
  keyOf: (file) => file.path,
  locate: (file) => `${file.path} (${file.lines} lines)`,
  ledgerKeys: Object.keys(LEDGER),
  ceiling: LEDGER_CEILING,
  remedy:
    "SPLIT IT. A NEW file over 150 lines is the thing this ledger exists to stop — it is " +
    "how commands/apps.ts reached 4,204 lines, one reasonable addition at a time. Move a " +
    "concern into its own file until every part is 150 lines or fewer, and no row is needed " +
    "at all. Writing a row instead is the option of last resort, and it costs a +1 on " +
    "LEDGER_CEILING in the same diff.",
  drainProofControl: {
    // Not the findings, deliberately: the findings are meant to reach zero. A
    // file that drops under the ceiling STAYS in this population, so this floor
    // cannot be tripped by fixing anything — and splitting a file, the cure this
    // gate drives, only ever ADDS members. It moves away from the floor, never
    // toward it. 200 against the 359 present when this landed.
    name: "every non-test .ts file under packages/cli/src, whatever its size",
    keys: POPULATION,
    floor: 200
  },
  rowCheck: {
    // A row at or below the ceiling could never BE a finding, so it exempts
    // nothing while still counting against LEDGER_CEILING. The staleness arm
    // below cannot see it — that file exists and is perfectly healthy.
    name: `every row is an integer ABOVE ${CEILING_LINES}`,
    offender: (key) => {
      const row = LEDGER[key];
      if (Number.isInteger(row) && row > CEILING_LINES) return null;
      return `${key} -> ${JSON.stringify(row)}`;
    }
  }
});

const SHRINK_ONLY =
  "\nThis ledger is SHRINK-ONLY. The one legal way to change a number is to make the file " +
  "smaller and lower its row in the SAME COMMIT.\n";

describe("packages/cli/src file sizes are ledgered and can only shrink", () => {
  // The primitive's own arms, one `it` each so a red names the property it broke
  // rather than the first arm above it in a shared block.
  //
  // 🚨 `eachOrRefuse` RATHER THAN A ROW IN `scripts/each-table-refusal.ledger.ts`,
  // AND THE DIFFERENCE IS NOT COSMETIC. `shrinkOnlyLedger`'s header says `checks`
  // holds a fixed number of rows whatever the ledger holds, so this table cannot
  // vanish when the ledger drains — but that is a fact about ANOTHER FILE, and
  // `scripts/each-table-scan.ts` stops resolving at the file boundary on purpose:
  // following imports would make the verdict depend on a resolver, and a resolver
  // that quietly stops resolving changes the gate's demands with no diff. So this
  // file genuinely cannot PROVE its table has rows, and the honest disposition is
  // to assert it at collect time rather than to write the claim down and be
  // believed.
  //
  // It costs nothing on the cure path this gate drives: `GATE.checks` never
  // drains, so the refusal can only fire if the primitive stops emitting arms —
  // which would silently delete the subset arm, the non-growth ceiling, the
  // duplicate-key check AND the drain-proof control in one go, with this spec
  // still reporting PASSED. That is exactly the failure `eachOrRefuse` exists
  // for, one layer up from the ledger it guards.
  it.each(
    eachOrRefuse(
      GATE.checks.map((check) => [check.name, check] as const),
      "the arms shrinkOnlyLedger emits for this file-size ledger"
    )
  )("%s", (_name, check) => {
    expect(check.actual, check.message).toEqual(check.expected);
  });

  /**
   * PROPERTY 1 — the arm that refuses growth. A file that has outgrown the row
   * naming it, with both numbers in the refusal.
   */
  it("reports no listed file that has GROWN past its row", () => {
    const grown = LIVE_ROWS.filter((live) => live.actual > live.row).map(
      (live) =>
        `${live.path}: the ledger claims ${live.row} lines, the file is ${live.actual} ` +
        `(+${live.actual - live.row})`
    );

    expect(
      grown,
      `${grown.length} file(s) grew past the size this ledger records for them.${SHRINK_ONLY}` +
        "Split the file back under its row. If the growth is genuinely right, raise the row " +
        "to the number printed above and say in the commit why the file had to grow instead " +
        "of split — that one-line diff is the whole point of this gate.\n"
    ).toEqual([]);
  });

  /**
   * PROPERTY 2 — the arm that refuses SLACK, and the one the shipped primitive
   * deliberately does not carry for a debt count. A row above its file is
   * banked growth: the file may regrow to that number with nothing going red.
   */
  it("reports no row LARGER than the file it names", () => {
    const slack = LIVE_ROWS.filter((live) => live.actual < live.row).map(
      (live) =>
        `${live.path}: the ledger claims ${live.row} lines, the file is ${live.actual} ` +
        `(${live.row - live.actual} line(s) of unclaimed headroom)`
    );

    expect(
      slack,
      `${slack.length} row(s) sit ABOVE the file they name, which is this gate switched off ` +
        `for exactly that many lines of regrowth.${SHRINK_ONLY}` +
        "Somebody made these files smaller without lowering their rows — good work, finish " +
        "it: write the real number printed above. A row at or below 150 should be DELETED " +
        "instead, with LEDGER_CEILING lowered by one in the same diff.\n"
    ).toEqual([]);
  });

  /**
   * PROPERTY 4 — a staleness arm, which the meta-gate in
   * `@nexus/types/testing/ledger-assertion-scan` reports as an ADVISORY and
   * never refuses, because it stays quiet under a complete cure: the file goes
   * and its row goes in one change.
   *
   * It earns its place because these rows are not exemptions, they are CLAIMS
   * about a measurable fact. A row naming a deleted file is a claim that has
   * quietly become uncheckable, and it still counts against LEDGER_CEILING — so
   * the ledger's own cardinality stops describing the tree.
   */
  it("reports no row naming a file that no longer exists", () => {
    expect(
      ROWS_NAMING_NOTHING,
      `${ROWS_NAMING_NOTHING.length} row(s) name a path this walk no longer finds — deleted, ` +
        `renamed, or split away.${SHRINK_ONLY}` +
        "Delete each row and lower LEDGER_CEILING by that many in the same diff. If the file " +
        "was RENAMED, add the new path as its own row. A row nothing can be measured against " +
        "is a number no reader can check.\n"
    ).toEqual([]);
  });
});
