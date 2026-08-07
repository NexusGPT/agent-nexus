import type {
  ExecutionDiagnoseNode,
  ExecutionPollResponse,
  ExecutionSummary,
  ListExecutionsParams,
  PageResponse
} from "@agent-nexus/sdk";
import { Command } from "commander";

import { createClient } from "../client";
import { handleError } from "../errors";
import {
  color,
  isJsonMode,
  printList,
  printRecord,
  printSuccess,
  type RecordField
} from "../output";
import { addPaginationOptions, getPaginationParams } from "../util/pagination";
import { runFollow, shortTag } from "../util/run-follow";

export function registerExecutionCommands(program: Command): void {
  const execution = program.command("execution").description("View workflow execution history");

  // ── list ──────────────────────────────────────────────────────────────
  addPaginationOptions(
    execution
      .command("list")
      .description("List workflow executions")
      .option("--workflow-id <id>", "Filter by workflow ID")
      .option("--status <status>", "Filter by status")
      .addHelpText(
        "after",
        `
Examples:
  $ nexus execution list
  $ nexus execution list --workflow-id wf-123 --limit 5
  $ nexus execution list --status COMPLETED --json`
      )
  ).action(async (opts) => {
    try {
      const client = createClient(program.optsWithGlobals());
      const params: ListExecutionsParams = { ...getPaginationParams(opts), status: opts.status };
      // Typed, not `any`. An `any` row makes `Column.key` fall back to a bare
      // `string`, which is what let the STARTED column below name `createdAt`
      // — a field `ExecutionSummary` does not have — and render blank forever.
      const result: PageResponse<ExecutionSummary> = opts.workflowId
        ? await client.workflowExecutions.listByWorkflow(opts.workflowId, params)
        : await client.workflowExecutions.list(params);

      printList(result.data, result.meta, [
        { key: "id", label: "ID", width: 36 },
        { key: "workflowId", label: "WORKFLOW", width: 36 },
        { key: "status", label: "STATUS", width: 12 },
        { key: "startedAt", label: "STARTED", width: 20 }
      ]);
    } catch (err) {
      process.exitCode = handleError(err);
    }
  });

  // ── get ───────────────────────────────────────────────────────────────
  execution
    .command("get")
    .description("Get execution details")
    .argument("<id>", "Execution ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus execution get exec-123
  $ nexus execution get exec-123 --json`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const exec = await client.workflowExecutions.get(id);
        printRecord(exec, [
          { key: "id", label: "ID" },
          { key: "workflowId", label: "Workflow" },
          { key: "status", label: "Status" },
          { key: "startedAt", label: "Started" },
          { key: "completedAt", label: "Completed" },
          { key: "duration", label: "Duration" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── diagnose ──────────────────────────────────────────────────────────
  execution
    .command("diagnose")
    .description("Diagnose execution — per-node status, errors, and data")
    .argument("<id>", "Execution ID")
    .option("--verbose", "Include full input/output JSON for each node")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus execution diagnose exec-123
  $ nexus execution diagnose exec-123 --verbose
  $ nexus execution diagnose exec-123 --json`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.workflowExecutions.diagnose(id, {
          verbose: !!opts.verbose
        });

        if (isJsonMode()) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        const diag = result;
        const statusIcon = getStatusIcon(diag.status);
        const durationStr = diag.duration != null ? formatDuration(diag.duration) : "";

        console.log();
        console.log(
          `${color.bold("Execution")} ${color.dim(diag.executionId)} — ${statusIcon} ${diag.status} ${durationStr ? color.dim(`(${durationStr})`) : ""}`
        );
        if (diag.workflowName) {
          console.log(`${color.dim("Workflow:")} ${diag.workflowName}`);
        }
        if (diag.error) {
          console.log(`${color.red("Error:")} ${diag.error}`);
        }

        // Node status counts
        const counts = diag.nodeStatusCounts;
        if (counts && Object.keys(counts).length > 0) {
          const parts = Object.entries(counts)
            .filter(([, v]) => v > 0)
            .map(([k, v]) => `${v} ${k.toLowerCase()}`);
          if (parts.length > 0) {
            console.log(color.dim(`Nodes: ${parts.join(", ")}`));
          }
        }

        console.log();

        // Per-node breakdown
        const nodes = diag.nodes ?? [];
        for (const node of nodes) {
          printDiagnoseNode(node, 0, !!opts.verbose);
        }
        console.log();
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── poll ──────────────────────────────────────────────────────────────
  execution
    .command("poll")
    .description("Poll execution status and output data")
    .argument("[id]", "Execution ID")
    .option("--token <token>", "Poll by polling token instead of execution ID")
    .option("--watch", "Poll repeatedly until execution reaches a terminal status")
    .option("--interval <ms>", "Polling interval in milliseconds (default: 2000)", "2000")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus execution poll exec-123
  $ nexus execution poll --token tok-abc
  $ nexus execution poll exec-123 --watch
  $ nexus execution poll exec-123 --watch --interval 5000`
    )
    .action(async (id: string | undefined, opts) => {
      try {
        // Resolve the poll target inside the guard itself. `id` is only
        // narrowed to `string` on this branch, and that narrowing does NOT
        // survive into the `doPoll` closure below — TypeScript cannot prove
        // `id` is unassigned between the closure being created and called.
        // Capturing the decision here is what the old `poll(id!)` assertion
        // was standing in for.
        const token: string | undefined = opts.token;
        let pollTarget: { token: string } | { id: string };
        if (token) {
          pollTarget = { token };
        } else if (id) {
          pollTarget = { id };
        } else {
          console.error("Error: provide an execution ID or --token");
          process.exitCode = 1;
          return;
        }

        const client = createClient(program.optsWithGlobals());
        const interval = Math.max(500, parseInt(opts.interval, 10) || 2000);
        const terminalStatuses = new Set(["COMPLETED", "FAILED", "CANCELLED"]);

        const doPoll = async () =>
          "token" in pollTarget
            ? client.workflowExecutions.pollByToken(pollTarget.token)
            : client.workflowExecutions.poll(pollTarget.id);

        const fields: RecordField<ExecutionPollResponse>[] = [
          { key: "executionId", label: "Execution ID" },
          { key: "status", label: "Status" },
          { key: "createdAt", label: "Created" },
          { key: "finishedAt", label: "Finished" },
          { key: "outputData", label: "Output" }
        ];

        if (!opts.watch) {
          const result = await doPoll();
          printRecord(result, fields);
          return;
        }

        // Watch mode: poll until terminal status
        let result: any;
        while (true) {
          result = await doPoll();
          const status = result?.status ?? "UNKNOWN";
          const statusColor =
            status === "COMPLETED" ? color.green : status === "FAILED" ? color.red : color.yellow;
          process.stdout.write(`\r${color.dim("Status:")} ${statusColor(status)}  `);

          if (terminalStatuses.has(status)) {
            process.stdout.write("\n");
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, interval));
        }

        printRecord(result, fields);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── follow ────────────────────────────────────────────────────────────
  execution
    .command("follow")
    .description("Follow a running execution, printing per-node progress as it happens")
    .argument("<id>", "Execution ID")
    .option("--interval <ms>", "Polling interval in milliseconds (default: 1500)", "1500")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus execution follow exec-123
  $ nexus execution follow exec-123 --interval 3000
  $ nexus execution follow exec-123 --json   # NDJSON of per-node state changes`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const interval = Math.max(500, parseInt(opts.interval, 10) || 1500);

        // Best-effort: derive the workflow id for the [wf …] prefix.
        let wfTag = shortTag(id);
        try {
          const exec = await client.workflowExecutions.get(id);
          if (exec?.workflowId) wfTag = shortTag(exec.workflowId);
        } catch {
          // fall back to the execution short id
        }

        const finalStatus = await runFollow(client, id, {
          interval,
          wfTag,
          json: isJsonMode()
        });

        if (!isJsonMode()) {
          const paint =
            finalStatus === "COMPLETED"
              ? color.green
              : finalStatus === "FAILED" || finalStatus === "ERROR" || finalStatus === "CANCELLED"
                ? color.red
                : color.yellow;
          console.log(`\n${color.dim("Final status:")} ${paint(finalStatus)}`);
        }
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── output ────────────────────────────────────────────────────────────
  execution
    .command("output")
    .description("Get execution output")
    .argument("<id>", "Execution ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus execution output exec-123
  $ nexus execution output exec-123 --json`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const output = await client.workflowExecutions.getOutput(id);
        printRecord(output);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── cancel ─────────────────────────────────────────────────────────────
  execution
    .command("cancel")
    .description("Cancel a running execution and its in-flight loop iterations")
    .argument("<id>", "Execution ID")
    .addHelpText(
      "after",
      `
Cancels a PENDING, RUNNING or FAILED execution. Loop fan-outs run as child
executions, so every iteration the run spawned is cancelled with it.

Examples:
  $ nexus execution cancel exec-123
  $ nexus execution cancel exec-123 --json`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.workflowExecutions.cancel(id);
        printSuccess("Execution cancelled.", { executionId: id, ...result });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── retry ──────────────────────────────────────────────────────────────
  execution
    .command("retry")
    .description("Retry a failed node in an execution")
    .argument("<id>", "Execution ID")
    .argument("<node-id>", "Node ID to retry")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus execution retry exec-123 node-456`
    )
    .action(async (id: string, nodeId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.workflowExecutions.retryNode(id, nodeId);
        // `result` carries `executionId` and `nodeId` as required fields and is
        // spread last, so it always won — naming them again ahead of it was
        // dead. Dropping them is byte-identical at runtime; the `as any` is
        // what stopped the compiler saying so.
        printSuccess("Node retry initiated.", { ...result });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── export ─────────────────────────────────────────────────────────────
  execution
    .command("export")
    .description("Export execution data")
    .argument("<id>", "Execution ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus execution export exec-123
  $ nexus execution export exec-123 --json`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const data = await client.workflowExecutions.export(id);
        printRecord(data);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── node-result ────────────────────────────────────────────────────────
  execution
    .command("node-result")
    .description("Get result of a specific node in an execution")
    .argument("<id>", "Execution ID")
    .argument("<node-id>", "Node ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus execution node-result exec-123 node-456
  $ nexus execution node-result exec-123 node-456 --json`
    )
    .action(async (id: string, nodeId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.workflowExecutions.getNodeResult(id, nodeId);
        printRecord(result);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}

// ── diagnose helpers ──────────────────────────────────────────────────

function getStatusIcon(status: string): string {
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

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const totalSecs = Math.round(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins}m${secs}s`;
}

function printDiagnoseNode(node: ExecutionDiagnoseNode, depth: number, verbose: boolean): void {
  const indent = "  ".repeat(depth + 1);
  const icon = getStatusIcon(node.status);
  const label = node.label ?? node.nodeId ?? "unknown";
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
