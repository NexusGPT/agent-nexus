import type { ExecutionDiagnose } from "@agent-nexus/sdk";

import { color } from "../../output";
import { formatDuration, getStatusIcon, printDiagnoseNode } from "./diagnose.print-node";
import { summarizeCounts } from "./diagnose.summarize-counts";

/**
 * The human-readable half of `nexus execution diagnose`.
 *
 * `--json` never reaches here: under it a non-completed run is the error
 * document and nothing else, which the handler decides before calling this.
 */
export function printDiagnosis(diag: ExecutionDiagnose, verbose: boolean): void {
  const statusIcon = getStatusIcon(diag.status);
  const durationStr = diag.duration != null ? formatDuration(diag.duration) : "";

  console.log();
  console.log(
    `${color.bold("Execution")} ${color.dim(diag.executionId)} — ${statusIcon} ${diag.status} ${durationStr ? color.dim(`(${durationStr})`) : ""}`
  );
  if (diag.workflowName) {
    console.log(`${color.dim("Workflow:")} ${diag.workflowName}`);
  }
  // A loop pass looks like a truncated run — a handful of nodes, no
  // trigger, `loopIterations: null` — so say what it is rather than
  // leaving the reader to infer it (NEX-3178).
  if (diag.executionType && diag.executionType !== "run") {
    const provenance: Record<string, string> = {
      loop_iteration: `loop iteration — one pass of the body of node ${diag.parentNodeId ?? "(unknown)"}`,
      node_test: "single-node test run from the builder"
    };
    // An execution type this CLI build predates prints itself rather than
    // borrowing the wrong description from a sibling branch.
    console.log(`${color.dim("Type:")} ${provenance[diag.executionType] ?? diag.executionType}`);
  }
  if (diag.error) {
    console.log(`${color.red("Error:")} ${diag.error}`);
  }

  // Node status counts. `nodeStatusCounts` tallies the nodes printed
  // below; `nodeExecutionStatusCounts` also counts each loop pass, so the
  // two differ exactly when the workflow looped — print the second line
  // only then, rather than repeating the same figures twice.
  const own = summarizeCounts(diag.nodeStatusCounts);
  const deep = summarizeCounts(diag.nodeExecutionStatusCounts);
  if (own) console.log(color.dim(`Nodes: ${own}`));
  if (deep && deep !== own) {
    console.log(color.dim(`Node executions (incl. loop iterations): ${deep}`));
  }

  console.log();

  // Per-node breakdown
  const nodes = diag.nodes ?? [];
  for (const node of nodes) {
    printDiagnoseNode(node, 0, verbose);
  }
  console.log();
}
