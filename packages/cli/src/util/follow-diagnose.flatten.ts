import type { DiagnoseNode, DiagnoseResult, FollowEntry } from "./follow-diagnose.model";
import { isIterationDone, isTerminalStatus } from "./follow-diagnose.status";

/**
 * Flatten a diagnose snapshot into an ordered list of printable entries,
 * recursing into loop iterations so each inner node is individually addressable.
 */
export function flattenDiagnose(diag: DiagnoseResult): FollowEntry[] {
  const entries: FollowEntry[] = [];

  const walk = (nodes: DiagnoseNode[] | undefined, keyPrefix: string, labelPrefix: string) => {
    for (const node of nodes ?? []) {
      const nodeId = node.nodeId ?? "unknown";
      const key = keyPrefix ? `${keyPrefix}>${nodeId}` : nodeId;
      const name = node.label ?? nodeId;
      const pathLabel = `${labelPrefix}${name}`;

      const iterations = node.loopIterations ?? null;
      // The diagnose payload only carries iteration entries that have already
      // been spawned, so `iterations.length` equals the planned total ONLY once
      // the loop node itself is terminal. While the loop is still running we
      // know how many iterations are done but not how many remain.
      const loopNodeDone = isTerminalStatus(node.status);
      const loopProgress =
        iterations && iterations.length > 0
          ? {
              done: iterations.filter((i) => isIterationDone(i.status)).length,
              total: loopNodeDone ? iterations.length : null
            }
          : undefined;

      entries.push({
        key,
        pathLabel,
        type: node.nodeType ?? null,
        status: node.status ?? "PENDING",
        duration: node.duration ?? null,
        outputSummary: node.outputSummary ?? null,
        error: node.error ?? null,
        loopProgress
      });

      // Recurse into iterations. Iteration numbers from diagnose are 1-based;
      // present them 0-based to match the issue's `iter 0` convention.
      if (iterations) {
        for (const iter of iterations) {
          walk(iter.nodes, `${key}#iter${iter.iteration}`, `${name} iter ${iter.iteration - 1}: `);
        }
      }
    }
  };

  walk(diag.nodes, "", "");
  return entries;
}
