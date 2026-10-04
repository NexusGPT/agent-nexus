import type { ExecutionPollResponse } from "@agent-nexus/sdk";
import { Command } from "commander";

import { createClient } from "../../client";
import { handleError, refuse } from "../../errors";
import { color, isJsonMode, printRecord, type RecordField } from "../../output";
import { judgeRunStatus, reportRunRefusal } from "../../run-verdict";

// Hoisted out of the action below so the function fits its own cap. Both are
// constants of this command, not of any one call.
const terminalStatuses = new Set(["COMPLETED", "FAILED", "CANCELLED"]);
const fields: RecordField<ExecutionPollResponse>[] = [
  { key: "executionId", label: "Execution ID" },
  { key: "status", label: "Status" },
  { key: "createdAt", label: "Created" },
  { key: "finishedAt", label: "Finished" },
  { key: "outputData", label: "Output" }
];

/** The body of `nexus execution poll`, one read or a watch loop. */
export async function runPoll(
  program: Command,
  id: string | undefined,
  opts: { token?: string; watch?: boolean; interval: string }
): Promise<void> {
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

    const doPoll = async () =>
      "token" in pollTarget
        ? client.workflowExecutions.pollByToken(pollTarget.token)
        : client.workflowExecutions.poll(pollTarget.id);

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
}
