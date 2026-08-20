#!/usr/bin/env tsx
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CLI_SURFACE_BASELINE } from "../src/cli-surface.baseline.generated";
import { projectCliSurface } from "../src/cli-surface.project";
import { resolvesToInvocableLeaf } from "../src/command-path";
import {
  auditDeprecationRecords,
  auditSurfaceRemovals,
  changelogSections,
  compareVersions,
  nextBaseline,
  renderBaselineModule
} from "../src/deprecation-cycle";
import { DEPRECATIONS } from "../src/deprecations";
import { buildRootProgram, VERSION } from "../src/root-program";

/**
 * MOVE `src/cli-surface.baseline.generated.ts` FORWARD ONE RELEASE.
 *
 *   pnpm --filter @agent-nexus/cli run gen:cli-surface-baseline
 *   pnpm --filter @agent-nexus/cli run gen:cli-surface-baseline -- --check
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * RUN IT AT A RELEASE, AND ONLY AT A RELEASE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The baseline is the promise the LAST RELEASE made. Advancing it mid-cycle
 * would quietly re-promise whatever the tree happens to say today, which is the
 * one thing that makes the removal gate meaningless — so this script REFUSES to
 * run while the package version has not moved past the baseline's.
 *
 * That makes the moment to run it "any pull request after a release has shipped",
 * NOT the release pull request itself. `release/version-packages` is force-pushed
 * by its own workflow, so a hand commit onto it is overwritten and the
 * regeneration would silently disappear.
 *
 * ── THE REFUSAL IS THE MECHANISM ────────────────────────────────────────────
 *
 * 🚨 THIS SCRIPT WILL NOT DROP A LEAF WHOSE CYCLE HAS NOT BEEN SERVED. It runs
 * the same audit `deprecation-cycle.test.ts` runs, against the baseline
 * currently on disk, and writes NOTHING when any finding is refused. So the
 * sanctioned path cannot be used to launder a removal, and the unsanctioned one
 * is a hand-edit of a file whose header says GENERATED.
 *
 * The output path is resolved from THIS FILE rather than from the working
 * directory. A `--out` resolved against the cwd is how the docs generator once
 * wrote 47 pages into a phantom tree and reported success.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, "../src/cli-surface.baseline.generated.ts");
const CHANGELOG = path.resolve(HERE, "../CHANGELOG.md");

async function main(): Promise<void> {
  // ── `--check` asks ONE question: is the baseline still a release behind? ──
  //
  // It runs before anything else and touches no command tree, so it stays fast
  // enough to be worth putting in front of a release checklist. It deliberately
  // does NOT re-derive the file and compare bytes: the baseline is SUPPOSED to
  // lag the working tree between releases, so a byte comparison would be red for
  // the whole of every cycle and would teach its reader to ignore it.
  if (process.argv.includes("--check")) {
    const drift = compareVersions(VERSION, CLI_SURFACE_BASELINE.version);
    if (drift === 0) {
      console.log(`up to date — the baseline is at ${VERSION}, the released version`);
      return;
    }
    if (drift === null) {
      console.error(
        `UNPARSEABLE: package ${JSON.stringify(VERSION)} vs baseline ` +
          `${JSON.stringify(CLI_SURFACE_BASELINE.version)}. Both must be x.y.z.`
      );
      process.exitCode = 1;
      return;
    }
    if (drift < 0) {
      console.error(
        `IMPOSSIBLE: the baseline claims ${CLI_SURFACE_BASELINE.version} and this ` +
          `package is ${VERSION}. A baseline from the future is a hand edit.`
      );
      process.exitCode = 1;
      return;
    }
    console.error(
      `BEHIND: the baseline is at ${CLI_SURFACE_BASELINE.version} and ${VERSION} has ` +
        "shipped.\n" +
        "  Until it is advanced, a deprecation announced in that release cannot be\n" +
        "  spent, so a removal that has served its cycle will still be refused.\n" +
        "  fix: pnpm --filter @agent-nexus/cli run gen:cli-surface-baseline"
    );
    process.exitCode = 1;
    return;
  }

  // 🚨 A BASELINE MAY ONLY BE ADVANCED BY A RELEASE, AND THIS IS THE CHECK.
  //
  // The baseline says what the LAST RELEASE promised, so advancing it while the
  // version has not moved re-promises whatever the tree happens to say today —
  // and that is the one move that turns a declared deprecation into a spendable
  // one inside a single cycle. Running this mid-cycle would put the shape into
  // `deprecations` with no release between the announcement and the removal,
  // which is precisely what that field exists to make impossible.
  //
  // The first capture passes on its own: the bootstrap file says `0.0.0`, so the
  // comparison is true without a flag. There is deliberately no `--force`.
  const advance = compareVersions(VERSION, CLI_SURFACE_BASELINE.version);
  if (advance === null || advance <= 0) {
    console.error(
      `REFUSED: the baseline is already at ${CLI_SURFACE_BASELINE.version} and this ` +
        `package is at ${VERSION}.\n` +
        "  A baseline is advanced BY A RELEASE. Ship the version bump first, then run\n" +
        "  this again — a deprecation announced in that release becomes spendable one\n" +
        "  release later, which is what COMPATIBILITY.md promises."
    );
    process.exitCode = 1;
    return;
  }

  const projection = await projectCliSurface();
  const program = buildRootProgram(VERSION);
  const changelog = changelogSections(fs.readFileSync(CHANGELOG, "utf8"));

  const current = projection.leaves.map((leaf) => ({
    path: leaf.path,
    shape: leaf.shape,
    tier: leaf.tier
  }));

  const violations = auditDeprecationRecords({
    baseline: CLI_SURFACE_BASELINE,
    current,
    records: DEPRECATIONS,
    changelog
  });

  const refused = auditSurfaceRemovals({
    baseline: CLI_SURFACE_BASELINE,
    current,
    resolves: (leafPath) => resolvesToInvocableLeaf(program, leafPath),
    records: DEPRECATIONS,
    changelog
  }).filter((finding) => !finding.permitted);

  if (violations.length > 0 || refused.length > 0) {
    console.error("REFUSED: the baseline was not advanced, and nothing was written.\n");
    for (const violation of violations) {
      console.error(`  record ${violation.shape} (${violation.path}): ${violation.problem}`);
    }
    for (const finding of refused) {
      console.error(`  ${finding.verdict}: ${finding.reason}`);
    }
    process.exitCode = 1;
    return;
  }

  fs.writeFileSync(
    OUT,
    renderBaselineModule(nextBaseline({ version: VERSION, leaves: current, records: DEPRECATIONS }))
  );
  // A record whose leaf this baseline no longer promises has been SPENT, and this
  // is the one moment deleting it is safe: before the advance the removal gate
  // still needs it, and after the advance the hygiene rule refuses to let it sit
  // there naming nothing. Saying so here means nobody has to discover the order.
  const promised = new Set(current.map((leaf) => leaf.shape));
  const spent = DEPRECATIONS.filter((record) => !promised.has(record.shape));

  console.log(
    `wrote ${current.length} promised paths at ${VERSION};` +
      ` ${DEPRECATIONS.length - spent.length} declared deprecation(s) carried forward`
  );

  if (spent.length > 0) {
    console.log(
      `\n${spent.length} deprecation record(s) are now SPENT — their leaves are gone ` +
        "and this baseline no longer promises them.\n" +
        "  Delete them from src/deprecations.ts now; doing it before this advance " +
        "would have made the removal gate refuse.\n" +
        spent.map((record) => `    ${record.shape}  ${record.path}\n`).join("")
    );
  }
}

void main();
