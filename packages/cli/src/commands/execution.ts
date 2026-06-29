import { Command } from "commander";

import { createClient } from "../client";
import { handleError } from "../errors";
import { color, isJsonMode, printList, printRecord, printSuccess } from "../output";
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
      let result: any;

      if (opts.workflowId) {
        result = await client.workflowExecutions.listByWorkflow(opts.workflowId, {
          ...getPaginationParams(opts),
          status: opts.status
        } as any);
      } else {
        result = await client.workflowExecutions.list({
          ...getPaginationParams(opts),
          status: opts.status
        } as any);
      }

      const data = result.data ?? result;
      const meta = result.meta;

      printList(Array.isArray(data) ? data : [data], meta, [
        { key: "id", label: "ID", width: 36 },
        { key: "workflowId", label: "WORKFLOW", width: 36 },
        { key: "status", label: "STATUS", width: 12 },
        { key: "createdAt", label: "STARTED", width: 20 }
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
        printRecord(exec as unknown as Record<string, unknown>, [
          { key: "id", label: "ID" },
          { key: "workflowId", label: "Workflow" },
          { key: "status", label: "Status" },
          { key: "createdAt", label: "Started" },
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

        const diag = result as Record<string, any>;
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
        const counts = diag.nodeStatusCounts as Record<string, number> | undefined;
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
        const nodes = (diag.nodes ?? []) as any[];
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
        if (!id && !opts.token) {
          console.error("Error: provide an execution ID or --token");
          process.exitCode = 1;
          return;
        }

        const client = createClient(program.optsWithGlobals());
        const interval = Math.max(500, parseInt(opts.interval, 10) || 2000);
        const terminalStatuses = new Set(["COMPLETED", "FAILED", "CANCELLED"]);

        const doPoll = async () => {
          if (opts.token) {
            return client.workflowExecutions.pollByToken(opts.token);
          }
          return client.workflowExecutions.poll(id!);
        };

        const fields = [
          { key: "executionId", label: "Execution ID" },
          { key: "status", label: "Status" },
          { key: "createdAt", label: "Created" },
          { key: "finishedAt", label: "Finished" },
          { key: "outputData", label: "Output" }
        ];

        if (!opts.watch) {
          const result = await doPoll();
          printRecord(result as Record<string, unknown>, fields);
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

        printRecord(result as Record<string, unknown>, fields);
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
          const exec = (await client.workflowExecutions.get(id)) as Record<string, unknown>;
          if (exec?.workflowId) wfTag = shortTag(exec.workflowId as string);
        } catch {
          // fall back to the execution short id
        }

        const finalStatus = await runFollow(client as any, id, {
          interval,
          wfTag,
          json: isJsonMode()
        });

        if (!isJsonMode()) {
          const paint =
            finalStatus === "COMPLETED"
              ? color.green
              : finalStatus === "FAILED" ||
                  finalStatus === "ERROR" ||
                  finalStatus === "CANCELLED"
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
        const output = await (client.workflowExecutions as any).getOutput(id);
        printRecord(output as Record<string, unknown>);
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
        printSuccess("Node retry initiated.", { executionId: id, nodeId, ...(result as any) });
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
        const data = await (client.workflowExecutions as any).export(id);
        printRecord(data as Record<string, unknown>);
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
        const result = await (client.workflowExecutions as any).getNodeResult(id, nodeId);
        printRecord(result as Record<string, unknown>);
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

function printDiagnoseNode(node: Record<string, any>, depth: number, verbose: boolean): void {
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
  const iterations = node.loopIterations as any[] | null;
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
