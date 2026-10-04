import { indexCommandTree } from "../../command-tree-index";
import { deriveCommandLeaves } from "../../command-universe";
import type { DriveDeps } from "./drive-deps";
import { driveOne } from "./drive-one";
import { EXEMPT_LEAVES } from "./leaves";
import type { ErrorOutcome, LeafRun, Outcome, ScanReport } from "./outcome";
import { synthesizeArgv } from "./synthesize-argv";

export async function runOneDocumentScan(deps: DriveDeps): Promise<ScanReport> {
  const leaves = await deriveCommandLeaves();
  // The scan drives the REAL command, so it needs the live tree keyed by path.
  // `indexCommandTree` takes the program rather than building one — see its
  // header on why that argument is the design and not a convenience.
  const index = indexCommandTree(deps.buildProgram());

  const runs: LeafRun[] = [];
  let runsWithSynthesizedArgs = 0;

  for (const leaf of leaves) {
    if (EXEMPT_LEAVES.includes(leaf)) continue;

    const command = index.get(leaf);
    if (command === undefined) {
      runs.push({
        key: leaf,
        leaf,
        argv: [],
        outcome: "undrivable",
        detail: "the real root program registers no command at this path",
        errorOutcome: "not-an-error",
        errorDetail: "",
        errorCode: undefined,
        requestsAttempted: 0,
        refusedByCommander: false
      });
      continue;
    }

    const plan = synthesizeArgv(leaf, command, deps.sandboxDir);
    if (plan.synthesized) runsWithSynthesizedArgs += 1;

    runs.push(await driveOne(leaf, leaf, plan.argv, deps));

    // A `--dry-run` arm is a DIFFERENT terminal result of the same command, and
    // three of them printed prose and returned. Derived from the declaration, so
    // a new one joins the population by being declared.
    if (plan.hasDryRun) {
      runs.push(await driveOne(`${leaf} --dry-run`, leaf, [...plan.argv, "--dry-run"], deps));
    }
  }

  const counts: Record<Outcome, number> = {
    clean: 0,
    violation: 0,
    "error-path": 0,
    silent: 0,
    undrivable: 0
  };
  for (const run of runs) counts[run.outcome] += 1;

  const errorCounts: Record<ErrorOutcome, number> = {
    "not-an-error": 0,
    "error-document": 0,
    "error-prose": 0,
    "error-mute": 0,
    "error-masked": 0,
    "error-miscoded": 0
  };
  for (const run of runs) errorCounts[run.errorOutcome] += 1;

  return {
    leafCount: leaves.length,
    runs,
    violations: runs.filter((run) => run.outcome === "violation"),
    counts,
    runsWithSynthesizedArgs,
    errorCounts,
    errorViolations: runs.filter(
      (run) =>
        run.errorOutcome === "error-prose" ||
        run.errorOutcome === "error-mute" ||
        run.errorOutcome === "error-masked"
    ),
    miscoded: runs.filter((run) => run.errorOutcome === "error-miscoded"),
    commanderRefusals: runs.filter((run) => run.refusedByCommander).length
  };
}
