import type { ExecutionDiagnoseNode } from "@agent-nexus/sdk";

import { color } from "../../output";
import { firstNonBlankOr } from "../../util/present-text";

/** The per-node lines under `nexus execution diagnose`, and their status glyphs. */
export function getStatusIcon(status: string): string {
  switch (status) {
    case "COMPLETED":
      return color.green("✅");
    case "ERROR":
    case "FAILED":
      return color.red("❌");
    case "RUNNING":
      return color.yellow("🔄");
    case "SKIPPED":
      return color.dim("⏭️");
    case "WAITING":
      return color.yellow("⏳");
    default:
      return color.dim("⬜");
  }
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const totalSecs = Math.round(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins}m${secs}s`;
}

export function printDiagnoseNode(
  node: ExecutionDiagnoseNode,
  depth: number,
  verbose: boolean
): void {
  const indent = "  ".repeat(depth + 1);
  const icon = getStatusIcon(node.status);
  const label = firstNonBlankOr([node.label, node.nodeId], "unknown");
  const nodeType = node.nodeType ? color.dim(`[${node.nodeType}]`) : "";
  const duration = node.duration != null ? color.dim(`(${formatDuration(node.duration)})`) : "";
  const outputSummary = node.outputSummary && !verbose ? color.dim(` — ${node.outputSummary}`) : "";

  console.log(`${indent}${icon} ${label} ${nodeType} ${duration}${outputSummary}`);

  if (node.error) {
    console.log(`${indent}   ${color.red("Error:")} ${node.error}`);
  }

  if (verbose && node.input !== undefined) {
    console.log(
      `${indent}   ${color.dim("Input:")} ${JSON.stringify(node.input, null, 2).split("\n").join(`\n${indent}   `)}`
    );
  }
  if (verbose && node.output !== undefined) {
    console.log(
      `${indent}   ${color.dim("Output:")} ${JSON.stringify(node.output, null, 2).split("\n").join(`\n${indent}   `)}`
    );
  }

  // Loop iterations
  const iterations = node.loopIterations;
  if (iterations && iterations.length > 0) {
    const completedCount = iterations.filter((i) => i.status === "COMPLETED").length;
    const failedCount = iterations.filter(
      (i) => i.status === "ERROR" || i.status === "FAILED"
    ).length;
    console.log(
      `${indent}   ${color.dim(`${iterations.length} iterations: ${completedCount} completed${failedCount > 0 ? `, ${failedCount} failed` : ""}`)}`
    );

    for (const iter of iterations) {
      const iterIcon = getStatusIcon(iter.status);
      console.log(`${indent}   ${iterIcon} ${color.dim(`Iteration ${iter.iteration}:`)}`);
      for (const iterNode of iter.nodes ?? []) {
        printDiagnoseNode(iterNode, depth + 2, verbose);
      }
    }
  }
}
