import type {
  ExecutionDiagnoseNode,
  ExecutionPollResponse,
  ExecutionSummary,
  ListExecutionsParams,
  PageResponse
} from "@agent-nexus/sdk";
import { Command } from "commander";

import { createClient } from "../client";
import { bindCommand, enumOption } from "../contract-binding";
import { handleError, refuse } from "../errors";
import {
  color,
  isJsonMode,
  printList,
  printRecord,
  printSuccess,
  type RecordField
} from "../output";
import { judgeRunStatus, reportRunRefusal } from "../run-verdict";
import { addPaginationOptions, getPaginationParams } from "../util/pagination";
import { firstNonBlankOr } from "../util/present-text";
import { runFollow, shortTag } from "../util/run-follow";
import {
  WORKFLOW_EXECUTION_CANCEL_CONTRACT,
  WORKFLOW_EXECUTION_DIAGNOSE_CONTRACT,
  WORKFLOW_EXECUTION_EXPORT_CONTRACT,
  WORKFLOW_EXECUTION_GET_CONTRACT,
  WORKFLOW_EXECUTION_GET_NODE_RESULT_CONTRACT,
  WORKFLOW_EXECUTION_GET_OUTPUT_CONTRACT,
  WORKFLOW_EXECUTION_LIST__PARAMS_ORDER,
  WORKFLOW_EXECUTION_LIST__PARAMS_SORT_BY,
  WORKFLOW_EXECUTION_LIST__PARAMS_STATUS,
  WORKFLOW_EXECUTION_LIST_CONTRACT,
  WORKFLOW_EXECUTION_POLL_CONTRACT,
  WORKFLOW_EXECUTION_RETRY_NODE_CONTRACT
} from "./execution.contract.generated";

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
  const list = addPaginationOptions(
    execution
      .command("list")
      .description("List workflow executions")
      .option("--workflow-id <id>", "Filter by workflow ID")
      .addOption(
        enumOption("--status <status>", "Filter by status", WORKFLOW_EXECUTION_LIST__PARAMS_STATUS)
      )
      .addOption(
        enumOption("--sort-by <field>", "Sort by field", WORKFLOW_EXECUTION_LIST__PARAMS_SORT_BY)
      )
      .addOption(enumOption("--order <dir>", "Sort order", WORKFLOW_EXECUTION_LIST__PARAMS_ORDER))
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
  $ nexus execution list --workflow-id 22222222-2222-4222-8222-222222222222 --limit 5
  $ nexus execution list --status COMPLETED --json
  $ nexus execution list --workflow-id 22222222-2222-4222-8222-222222222222 --include-child-executions
  $ nexus execution list --workflow-id 22222222-2222-4222-8222-222222222222 --include-test-runs --limit 1 --json

Notes:
  --status, --sort-by and --order are validated LOCALLY against the contract, so
  a bad value is refused here and never becomes a 400.
  --page defaults to 1 and --limit to 20; above 100 is a 400, not a clamp.
  --sort-by defaults to createdAt and --order to desc, so the default is newest
  first. Both defaults live on the SERVER: unset, the CLI sends neither.
  THIS IS HOW YOU RECOVER A REAL EXECUTION ID after a test: the id a node test
  returns is a per-node test id that "execution get" cannot resolve. Reading the
  most recent row is the usual trick, and it is only safe while nothing else is
  running — two concurrent tests on the same workflow and you read the other one's
  result. Use --include-test-runs and check the TYPE column.
  nodeStatusCounts in --json counts nodes by status. status COMPLETED with
  nodeStatusCounts.completed == 0 means an execution row exists and NOTHING RAN.
  THE TYPE COLUMN IS "executionType" IN --json, NOT "type". Reading .type gets
  you undefined, and undefined is indistinguishable from a real run here — every
  row has an executionType, so a missing value means you read the wrong key:
    $ nexus execution list --json | jq -r '.data[] | "\\(.id) \\(.executionType)"'`
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
        sortBy: opts.sortBy,
        order: opts.order,
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
  const get = execution
    .command("get")
    .description("Get execution details")
    .argument("<id>", "Execution ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus execution get 11111111-1111-4111-8111-111111111111
  $ nexus execution get 11111111-1111-4111-8111-111111111111 --json

Notes:
  A 404 here usually means the id is not an execution id at all — a node test's
  return value is a per-node test id, not this.
  Type names what the row is: run, loop_iteration or node_test. On a
  loop_iteration, "Loop node" is the graph node whose body this pass ran, so a
  handful of nodes and no trigger is the expected shape rather than a truncated run.
  --json adds triggerType, triggerData, error, outputData, pollingToken and
  nodeStatusCounts.
  pollingToken IS MINTED ONLY FOR A PRODUCTION WEBHOOK RUN. A run started by
  "workflow test", by a schedule, by an agent or from this API carries null, and
  that is the normal state, not a missing value — "execution poll --token" is
  reachable only for webhook-triggered runs. Poll those other runs by id.`
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
  const diagnose = execution
    .command("diagnose")
    .description("Diagnose execution — per-node status, errors, and data")
    .argument("<id>", "Execution ID")
    .option("--verbose", "Include full input/output JSON for each node")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus execution diagnose 11111111-1111-4111-8111-111111111111
  $ nexus execution diagnose 11111111-1111-4111-8111-111111111111 --verbose
  $ nexus execution diagnose 11111111-1111-4111-8111-111111111111 --json

Notes:
  START HERE when a run went wrong: one call gives the execution's status, its
  error, the per-node breakdown with each node's own error, and every loop
  iteration nested under its loop node.
  Per-node status uses the NODE enum — COMPLETED, RUNNING, PENDING, READY, SKIPPED,
  WAITING, ERROR. A failed node reads ERROR.
  SKIPPED is not a failure: it is a node a branch did not select. A whole branch
  reading SKIPPED means the condition chose elsewhere.
  --verbose adds each node's full input and output JSON, which is how you see what
  a reference actually resolved to. Without it you get a one-line output summary.

  🚨 outputSummary IS A TRUNCATED STRING, NOT THE OUTPUT. It is the node's output
  run through JSON.stringify and cut to the first 100 characters with a "…"
  appended — so a truncated one is 101 characters — and it is a STRING at every
  length. jq'ing into it (.outputSummary.someField) gets undefined, and once it
  has been cut it is no longer parseable JSON either. Treat it as a PREVIEW for
  reading, never as a field to script against.
  ANYTHING YOU MEAN TO PARSE NEEDS --verbose, which adds "input" and "output"
  carrying the real values. WITHOUT IT THOSE TWO KEYS ARE ABSENT, not null: a
  script testing "output === null" cannot tell "the node produced nothing" from
  "you did not pass --verbose". Test for the key.
  A BRANCHING NODE'S CHOICE LIVES IN THAT FULL OUTPUT — read
  .nodes[] | select(.nodeType=="…") | .output under --verbose. It is not on
  outputSummary in any readable form, and it is not a field of its own here.
  THE EXIT CODE CARRIES status. A COMPLETED run exits 0 and a FAILED one exits
  non-zero. A CANCELLED run, and one still PENDING or RUNNING, exit non-zero
  under the UNMEASURED category instead — a run somebody stopped did not fail,
  and a run still going has not been judged at all. "nexus --help" holds the
  code table.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.workflowExecutions.diagnose(id, {
          verbose: !!opts.verbose
        });

        // `run-verdict.ts` owns what a run status MEANS, because `execution poll`
        // reads the same five values and must reach the same exit code.
        const verdict = judgeRunStatus(result.status);

        if (isJsonMode()) {
          // 🚨 UNDER --json A FAILURE IS THE ERROR DOCUMENT AND NOTHING ELSE.
          // Printing the diagnosis first takes stdout, and `emitDocument`'s
          // first-wins rule then diverts the refusal to stderr — so a consumer
          // reading stdout sees a document that parses cleanly and never learns
          // the run failed. `json-one-document.scan.ts` calls that
          // `error-masked`.
          if (verdict.outcome === "completed") {
            console.log(JSON.stringify(result, null, 2));
          } else {
            process.exitCode = reportRunRefusal(verdict, result.executionId);
          }
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

        // The human already has the whole diagnosis above; the exit code is the
        // half a script reads, and it said nothing.
        if (verdict.outcome !== "completed") {
          process.exitCode = reportRunRefusal(verdict, result.executionId);
        }
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── poll ──────────────────────────────────────────────────────────────
  const poll = execution
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
  $ nexus execution poll 11111111-1111-4111-8111-111111111111
  $ nexus execution poll --token tok-abc
  $ nexus execution poll 11111111-1111-4111-8111-111111111111 --watch
  $ nexus execution poll 11111111-1111-4111-8111-111111111111 --watch --interval 5000

Notes:
  The lightest read there is: {executionId, status, outputData, createdAt,
  finishedAt}. For per-node detail use "execution diagnose" or "execution follow".
  --token takes the pollingToken from "execution get --json" and is the way to
  watch a run without holding its id — pass one or the other, not neither.
  ONLY A PRODUCTION WEBHOOK RUN HAS A pollingToken. Every other run — workflow
  test, schedule, agent call, this API — stores null there, so --token has
  nothing to take and polling by id is the only route. A token that matches no
  run is a 404, indistinguishable from a token that was never minted.
  --watch stops at COMPLETED, FAILED or CANCELLED and does not time out, so a run
  wedged in RUNNING polls forever. --interval is floored at 500 ms.
  outputData is null until the run finishes, AND STAYS NULL ON A FINISHED RUN
  WHOSE GRAPH WROTE NOTHING. It is filled from the outputNode's own result, so a
  workflow with no outputNode, or one whose outputNode has no data.instructions
  to render, completes with outputData null and no error anywhere. Read the node
  results with "execution diagnose" when a COMPLETED run polls back empty.
  THE EXIT CODE CARRIES status, WITH OR WITHOUT --watch. A COMPLETED run exits 0
  and a FAILED one exits non-zero. CANCELLED exits non-zero under the UNMEASURED
  category — --watch treats it as terminal, and it is NOT a failure: somebody
  stopped the run before the platform judged it. A one-shot poll of a run still
  PENDING or RUNNING is UNMEASURED too, which makes
  "until nexus execution poll <id>; do sleep 5; done" a wait loop that can tell
  the three apart. "nexus --help" holds the code table.`
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
          process.exitCode = refuse("provide an execution ID or --token");
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
          const verdict = judgeRunStatus(result.status);
          // Same rule as `diagnose`: under --json a refusal is the one document.
          if (verdict.outcome === "completed" || !isJsonMode()) printRecord(result, fields);
          if (verdict.outcome !== "completed") {
            process.exitCode = reportRunRefusal(verdict, result.executionId);
          }
          return;
        }

        // Watch mode: poll until terminal status.
        //
        // Typed off `doPoll` itself rather than restated. `--token` and an id
        // reach two different SDK methods, so naming one method's response type
        // here would be a claim the compiler could not check against the other;
        // this one cannot drift from either. It was `any`, which is what let
        // `printRecord(result, fields)` typecheck against a `fields` array
        // declared for a different shape.
        let result: Awaited<ReturnType<typeof doPoll>>;
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

        // 🚨 THE LOOP ABOVE STOPS AT COMPLETED, FAILED **OR** CANCELLED, AND
        // ANSWERED 0 ON ALL THREE. A wait loop written around this could not
        // tell a run that finished from one that failed without re-reading the
        // document it had just printed.
        const watched = judgeRunStatus(result.status);
        if (watched.outcome === "completed" || !isJsonMode()) printRecord(result, fields);
        if (watched.outcome !== "completed") {
          process.exitCode = reportRunRefusal(watched, result.executionId);
        }
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
  $ nexus execution follow 11111111-1111-4111-8111-111111111111
  $ nexus execution follow 11111111-1111-4111-8111-111111111111 --interval 3000
  $ nexus execution follow 11111111-1111-4111-8111-111111111111 --json   # NDJSON of per-node state changes

Notes:
  Prints each node as its state changes and exits at a terminal status, so it is
  the read to attach to a run you have just started. "workflow test --follow" does
  the same thing in one command.
  --json emits one NDJSON object per state change, not a single document — read it
  line by line.
  Polling, not streaming: --interval (floored at 500 ms) decides how fast changes
  appear, and a node that starts and finishes inside one interval is reported once.
  LOOP ITERATIONS ARE FLATTENED INTO THE SAME STREAM, one line per node per pass,
  labelled "<loop name> iter <n>: <node name>". THE PRINTED ITERATION IS
  ZERO-BASED while the diagnose payload's own iteration number starts at 1, so
  "iter 0" and iteration 1 are the same pass — do not read the two as a run that
  skipped one.
  A line identifies its node by that path label, never by node id. To act on a
  node — "execution node-result", "workflow node get" — take the id from
  "execution diagnose" instead.`
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
  const output = execution
    .command("output")
    .description("Get execution output")
    .argument("<id>", "Execution ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus execution output 11111111-1111-4111-8111-111111111111
  $ nexus execution output 11111111-1111-4111-8111-111111111111 --json

Notes:
  The workflow's FINAL output — what its outputNode produced — as {output}, not
  the per-node results. output is null on a run that has not finished, and on a
  workflow with no outputNode, which validate reports only as a warning.
  THE RESPONSE CARRIES NO outputType, AND THAT IS DELIBERATE. One was published
  until it was removed as unfillable: nothing records the shape a run's output was
  meant to be, so it answered null on every run. To read the SETTING of the same
  name — previous|custom|text — use "nexus workflow node get" and look at the
  outputNode's data.outputType. That one is real and writable.
  A THIRD CASE READS THE SAME, AND IT IS THE ONE THAT WASTES AN AFTERNOON: a
  COMPLETED run whose outputNode also COMPLETED still answers null when that node
  had nothing to render. That SETTING defaults to "previous", which substitutes
  the upstream value into data.instructions — with no instructions set there is
  nothing to substitute into and nothing is written. Nothing validates this:
  publish, validate and the node's own status all pass. Set the outputNode's
  data.instructions with "nexus workflow node update", then run again.
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
  const cancel = execution
    .command("cancel")
    .description("Cancel a running execution and its in-flight loop iterations")
    .argument("<id>", "Execution ID")
    .addHelpText(
      "after",
      `
Cancels a PENDING, RUNNING or FAILED execution. Loop fan-outs run as child
executions, so every iteration the run spawned is cancelled with it.

Examples:
  $ nexus execution cancel 11111111-1111-4111-8111-111111111111
  $ nexus execution cancel 11111111-1111-4111-8111-111111111111 --json

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
  const retry = execution
    .command("retry")
    .description("Retry a failed node in an execution")
    .argument("<id>", "Execution ID")
    .argument("<node-id>", "Node ID to retry")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus execution retry 11111111-1111-4111-8111-111111111111 node-456

Notes:
  IT NEEDS THE RUN TO STILL BE RUNNING, AND THAT IS THE USUAL REFUSAL. The retry
  re-queues the node on the live in-memory executor, so a run that already
  reached FAILED, COMPLETED or CANCELLED has no executor left and answers 400
  "Workflow execution is not running". Retry is for a node that errored inside a
  run that is still going, not for resurrecting a finished one.
  IT ONLY RETRIES A NODE IN ERROR, AND ONLY A RETRYABLE TYPE. A node in any other
  state is a 400, and so is a node whose type is not on the retryable list — the
  list is re-read at retry time, so a type that has since been removed from it
  refuses even on a row recorded as retryable.
  <node-id> TAKES EITHER SPELLING: the graph node id from
  "execution diagnose", or the execution-node row id from
  "execution node-result". The graph id is tried first.
  A 404 means the execution is not yours or does not exist, or the node names
  nothing inside it. A 400 means it was found and refused, and the message says
  which of the reasons above applied.
  "RETRYING" IS ACCEPTANCE, NOT COMPLETION. The node is queued and runs
  asynchronously; watch it with "execution follow <id>".
  To re-run a node OUTSIDE its original execution, use
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
  const exportCmd = execution
    .command("export")
    .description("Export execution data")
    .argument("<id>", "Execution ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus execution export 11111111-1111-4111-8111-111111111111
  $ nexus execution export 11111111-1111-4111-8111-111111111111 --json

Notes:
  IT PRINTS A DOWNLOAD LINK, NOT THE EXPORT. The answer is {url, expiresAt} and
  nothing else — the run itself is the JSON document at that url. The document is
  FLAT, so the url is at .url and NOT at .data.url. Fetch it:
    curl -sL "$(nexus execution export exec-123 --json | jq -r .url)" > run.json
  THE LINK EXPIRES IN ABOUT FIVE MINUTES and carries its own authorization, so
  it needs no API key and it is not re-fetchable afterwards. Download it in the
  same breath as you mint it; re-run the command for a fresh link.
  IT IS A LINK, SO IT IS SHAREABLE — anyone holding it downloads the run's full
  contents, node inputs and outputs included, for as long as it lives.
  What lands in the file is the whole run: root execution metadata plus every
  node's record, and every nested loop sub-execution.`
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
  const nodeResult = execution
    .command("node-result")
    .description("Get result of a specific node in an execution")
    .argument("<id>", "Execution ID")
    .argument("<node-id>", "Node ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus execution node-result 11111111-1111-4111-8111-111111111111 node-456
  $ nexus execution node-result 11111111-1111-4111-8111-111111111111 node-456 --json

Notes:
  <node-id> is the GRAPH node id (from "nexus workflow get"), not a per-execution
  id, and it is not a UUID by rule.
  status uses the NODE enum: COMPLETED, RUNNING, PENDING, READY, SKIPPED, WAITING
  or ERROR. A FAILED NODE READS "ERROR" — filtering for FAILED here finds nothing.
  A node inside a loop is found automatically: the lookup follows the run's loop
  sub-executions up to five levels deep, and returns the pass it finds first.
  input, output and error are the fields that carry data here. The input is what
  the node's references actually resolved to, which is where a null usually
  shows up.
  duration, startedAt AND completedAt ARE REAL NOW. They are derived from the
  node's own createdAt/finishedAt, the same arithmetic "execution diagnose" uses,
  so the two commands agree on a node's duration. They used to come back null on
  every healthy completed node — read off property names no column supplies — and
  this text used to describe that as normal.
  THERE IS NO logs FIELD, AND LOOKING FOR ONE IS THE WASTED STEP THIS LINE SAVES.
  One was published until it was removed as unfillable — nothing in the platform
  stores a per-node log array. A node that captures console output (Browserbase,
  the sandbox nodes) folds those lines into its own result, so read them from
  output.
  startedAt IS THE ROW'S createdAt, so a node that is queued and not yet running
  still reports one; duration and completedAt stay null until it finishes.
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

  // Bound LAST, after every option and positional exists — see `bindCommand`.
  //
  // ONE LEAF IS DELIBERATELY UNBOUND:
  //
  //   · `follow` — it COMPOSES two descriptors rather than choosing between
  //     them: one `WorkflowExecutionGet` for the workflow-id label, then
  //     `WorkflowExecutionDiagnose` in a loop inside `util/run-follow.ts`.
  //     `bindCommand` takes one shape, so either choice would print a contract
  //     block describing half of what the command does. That is not the `poll`
  //     case below, where `--token` picks ONE of two interchangeable routes.
  //
  // `--workflow-id` switches `list` to `WorkflowExecutionListForWorkflow`, which
  // carries the SAME three enums and differs only by taking the workflow id in
  // the path. One leaf, one shape: the default route binds and the twin is
  // recorded `route-twin-bound-elsewhere`, exactly as `channel setup` is.
  bindCommand(list, WORKFLOW_EXECUTION_LIST_CONTRACT);
  bindCommand(get, WORKFLOW_EXECUTION_GET_CONTRACT);
  bindCommand(diagnose, WORKFLOW_EXECUTION_DIAGNOSE_CONTRACT);
  // `--token` switches this leaf to `WorkflowExecutionPollByToken`, which takes a
  // polling token where this takes an execution id and is otherwise the same
  // read. One leaf, two descriptors, one shape — the default branch binds.
  bindCommand(poll, WORKFLOW_EXECUTION_POLL_CONTRACT);
  bindCommand(output, WORKFLOW_EXECUTION_GET_OUTPUT_CONTRACT);
  bindCommand(cancel, WORKFLOW_EXECUTION_CANCEL_CONTRACT);
  bindCommand(retry, WORKFLOW_EXECUTION_RETRY_NODE_CONTRACT);
  bindCommand(exportCmd, WORKFLOW_EXECUTION_EXPORT_CONTRACT);
  bindCommand(nodeResult, WORKFLOW_EXECUTION_GET_NODE_RESULT_CONTRACT);
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
