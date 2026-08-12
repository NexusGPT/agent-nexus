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

  execution.addHelpText(
    "after",
    `
An execution id is a WorkflowExecution UUID. It is NOT what a node test hands
back: "workflow node test" returns a per-node test id, so "execution get" on that
value answers 404 — and the node's output is already in the test response.

Two facts that decide whether you are reading the right thing:
  • THE PER-NODE STATUS ENUM IS NOT THE EXECUTION ENUM. An execution is PENDING,
    RUNNING, COMPLETED, FAILED or CANCELLED. A NODE is PENDING, READY, RUNNING,
    COMPLETED, SKIPPED, WAITING or ERROR — a failed node reads ERROR, never
    FAILED, so filtering per-node results for FAILED silently finds nothing.
  • "execution list" HIDES loop passes and node tests by default. Each pass of a
    loop body and each builder node test is its own execution row, so a count you
    read here is real runs — until you ask for the others, at which point the
    TYPE column is the only thing telling them apart.`
  );

  // ── list ──────────────────────────────────────────────────────────────
  addPaginationOptions(
    execution
      .command("list")
      .description("List workflow executions")
      .option("--workflow-id <id>", "Filter by workflow ID")
      .option(
        "--status <status>",
        "Filter by status (PENDING, RUNNING, COMPLETED, FAILED, CANCELLED)"
      )
      .option(
        "--include-child-executions",
        "Also list loop / do-while body passes (one execution per iteration)"
      )
      .option("--include-test-runs", "Also list builder single-node test runs")
      .addHelpText(
        "after",
        `
Lists real end-to-end runs only. A loop / do-while node records each pass of its
body as its own execution, and the builder records single-node test runs the same
way; both are hidden unless you ask for them, so a row count means what it looks
like it means. The TYPE column names each row (run / loop_iteration / node_test).

Examples:
  $ nexus execution list
  $ nexus execution list --workflow-id wf-123 --limit 5
  $ nexus execution list --status COMPLETED --json
  $ nexus execution list --workflow-id wf-123 --include-child-executions
  $ nexus execution list --workflow-id wf-123 --include-test-runs --limit 1 --json

Notes:
  --status takes PENDING, RUNNING, COMPLETED, FAILED or CANCELLED — five values.
  Anything else is a 400.
  --page defaults to 1 and --limit to 20; above 100 is a 400, not a clamp.
  Newest first.
  THIS IS HOW YOU RECOVER A REAL EXECUTION ID after a test: the id a node test
  returns is a per-node test id that "execution get" cannot resolve. Reading the
  most recent row is the usual trick, and it is only safe while nothing else is
  running — two concurrent tests on the same workflow and you read the other one's
  result. Use --include-test-runs and check the TYPE column.
  nodeStatusCounts in --json counts nodes by status. status COMPLETED with
  nodeStatusCounts.completed == 0 means an execution row exists and NOTHING RAN.`
      )
  ).action(async (opts) => {
    try {
      const client = createClient(program.optsWithGlobals());
      // Unset commander flags are `undefined`, which `appendQuery` drops — so an
      // ordinary `nexus execution list` sends neither scope parameter and gets
      // the server default (real runs only).
      const params: ListExecutionsParams = {
        ...getPaginationParams(opts),
        status: opts.status,
        includeChildExecutions: opts.includeChildExecutions,
        includeTestRuns: opts.includeTestRuns
      };
      // Typed, not `any`. An `any` row makes `Column.key` fall back to a bare
      // `string`, which is what let the STARTED column below name `createdAt`
      // — a field `ExecutionSummary` does not have — and render blank forever.
      const result: PageResponse<ExecutionSummary> = opts.workflowId
        ? await client.workflowExecutions.listByWorkflow(opts.workflowId, params)
        : await client.workflowExecutions.list(params);

      printList(result.data, result.meta, [
        { key: "id", label: "ID", width: 36 },
        { key: "workflowId", label: "WORKFLOW", width: 36 },
        { key: "executionType", label: "TYPE", width: 15 },
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
  $ nexus execution get exec-123 --json

Notes:
  A 404 here usually means the id is not an execution id at all — a node test's
  return value is a per-node test id, not this.
  Type names what the row is: run, loop_iteration or node_test. On a
  loop_iteration, "Loop node" is the graph node whose body this pass ran, so a
  handful of nodes and no trigger is the expected shape rather than a truncated run.
  --json adds triggerType, triggerData, error, outputData, pollingToken and
  nodeStatusCounts.`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const exec = await client.workflowExecutions.get(id);
        printRecord(exec, [
          { key: "id", label: "ID" },
          { key: "workflowId", label: "Workflow" },
          { key: "executionType", label: "Type" },
          { key: "parentNodeId", label: "Loop node" },
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
  $ nexus execution diagnose exec-123 --json

Notes:
  START HERE when a run went wrong: one call gives the execution's status, its
  error, the per-node breakdown with each node's own error, and every loop
  iteration nested under its loop node.
  Per-node status uses the NODE enum — COMPLETED, RUNNING, PENDING, READY, SKIPPED,
  WAITING, ERROR. A failed node reads ERROR.
  SKIPPED is not a failure: it is a node a branch did not select. A whole branch
  reading SKIPPED means the condition chose elsewhere.
  --verbose adds each node's full input and output JSON, which is how you see what
  a reference actually resolved to. Without it you get a one-line output summary.`
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
          console.log(
            `${color.dim("Type:")} ${provenance[diag.executionType] ?? diag.executionType}`
          );
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
    // Commander renders the default itself, so spelling it in the description
    // printed "(default: 2000) (default: "2000")".
    .option("--interval <ms>", "Polling interval in milliseconds (floor 500)", "2000")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus execution poll exec-123
  $ nexus execution poll --token tok-abc
  $ nexus execution poll exec-123 --watch
  $ nexus execution poll exec-123 --watch --interval 5000

Notes:
  The lightest read there is: {executionId, status, outputData, createdAt,
  finishedAt}. For per-node detail use "execution diagnose" or "execution follow".
  --token takes the pollingToken from "execution get --json" and is the way to
  watch a run without holding its id — pass one or the other, not neither.
  --watch stops at COMPLETED, FAILED or CANCELLED and does not time out, so a run
  wedged in RUNNING polls forever. --interval is floored at 500 ms.
  outputData is null until the run finishes.`
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
    // See `poll`: the default is rendered by commander.
    .option("--interval <ms>", "Polling interval in milliseconds (floor 500)", "1500")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus execution follow exec-123
  $ nexus execution follow exec-123 --interval 3000
  $ nexus execution follow exec-123 --json   # NDJSON of per-node state changes

Notes:
  Prints each node as its state changes and exits at a terminal status, so it is
  the read to attach to a run you have just started. "workflow test --follow" does
  the same thing in one command.
  --json emits one NDJSON object per state change, not a single document — read it
  line by line.
  Polling, not streaming: --interval (floored at 500 ms) decides how fast changes
  appear, and a node that starts and finishes inside one interval is reported once.`
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
  $ nexus execution output exec-123 --json

Notes:
  The workflow's FINAL output — what its outputNode produced — as {output,
  outputType}, not the per-node results. Both are null on a run that has not
  finished, and on a workflow with no outputNode, which validate reports only as a
  warning.
  For a node's output use "execution node-result" or "execution diagnose --verbose".`
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
  $ nexus execution cancel exec-123 --json

Notes:
  IT STOPS THE EXECUTOR, NOT JUST THE ROW. The in-memory run is halted and every
  loop-iteration child is cancelled, which is what stops a runaway loop from
  continuing to fire external calls.
  IT DOES NOT UNDO WHAT ALREADY HAPPENED. Emails sent, rows written and payments
  taken by nodes that already completed stay done — cancelling is stopping, not
  rolling back.
  No confirmation prompt and no --dry-run: it acts immediately.
  Answers {success, message}. Cancelling a run that has already finished reports
  the refusal in that message rather than throwing.`
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
  $ nexus execution retry exec-123 node-456

Notes:
  IT REPORTS "RETRYING" AND RETRIES NOTHING. The endpoint is a stub today: it
  echoes {executionId, nodeId, status: "RETRYING"} without re-running the node, and
  without checking that either id exists — so a typo also answers RETRYING.
  Until it is implemented, re-run the single node with
  "nexus workflow node test <wf-id> <node-id>", or the whole chain with
  "nexus workflow test <wf-id>". Neither reuses the failed execution.`
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
  $ nexus execution export exec-123 --json

Notes:
  The whole run in one payload — execution metadata plus every node's record —
  meant for archiving or offline inspection rather than for reading in a terminal.
  Use --json and redirect it; the table rendering of a large run is unusable.`
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
  $ nexus execution node-result exec-123 node-456 --json

Notes:
  <node-id> is the GRAPH node id (from "nexus workflow get"), not a per-execution
  id, and it is not a UUID by rule.
  status uses the NODE enum: COMPLETED, RUNNING, PENDING, READY, SKIPPED, WAITING
  or ERROR. A FAILED NODE READS "ERROR" — filtering for FAILED here finds nothing.
  A node inside a loop is found automatically: the lookup follows the run's loop
  sub-executions up to five levels deep, and returns the pass it finds first.
  Answers input, output, logs, duration, timings and error — the input is what the
  node's references actually resolved to, which is where a null usually shows up.
  A per-node TEST also stamps its id onto the node itself, overwriting the previous
  one, so the last test wins as the node's linked result in the dashboard.`
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

/**
 * `"38 completed, 1 failed"` from a `nodeStatusCounts`-shaped object, or `null`
 * when nothing is worth printing.
 *
 * Keys are already the lowercase public buckets. This used to lowercase them
 * itself, which quietly papered over `diagnose` returning `COMPLETED` where
 * every other command returned `completed` (NEX-3176) — the display looked
 * right while `--json` consumers read `undefined`.
 */
export function summarizeCounts(counts: unknown): string | null {
  if (typeof counts !== "object" || counts === null || Array.isArray(counts)) return null;
  const parts = Object.entries(counts as Record<string, unknown>)
    .filter(([, v]) => typeof v === "number" && v > 0)
    .map(([k, v]) => `${v as number} ${k}`);
  return parts.length > 0 ? parts.join(", ") : null;
}

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
