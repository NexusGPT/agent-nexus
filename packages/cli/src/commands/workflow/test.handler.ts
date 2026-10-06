import { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { color, isJsonMode, printRecord } from "../../output";
import { reportRunRefusal } from "../../run-verdict";
import { resolveBody } from "../../util/body";
import { finishFollow, runFollow, shortTag } from "../../util/run-follow";
import { parseSampleConfig } from "../../util/sample-config";
import { buildTestWorkflowBody, parseInputFlag } from "../../util/test-body";

/** The flags `nexus workflow test` declares, as this handler reads them. */
interface WorkflowTestOptions {
  body?: string;
  input?: string;
  sample?: string;
  sampleNode?: string;
  limitArray?: string[];
  follow?: boolean;
  stream?: boolean;
  interval: string;
}

/** The body of `nexus workflow test`, lifted out so the registrar stays a registrar. */
export async function runWorkflowTest(
  program: Command,
  id: string,
  opts: WorkflowTestOptions
): Promise<void> {
  try {
    const client = createClient(program.optsWithGlobals());
    const base = await resolveBody(opts.body);
    const input = parseInputFlag(opts.input);

    const flagSampleConfig = parseSampleConfig({
      sample: opts.sample,
      sampleNode: opts.sampleNode,
      limitArray: opts.limitArray
    });
    // The /test endpoint expects { triggerData, sampleConfig } and strips
    // any other top-level keys. Normalize --input / --body into that shape
    // so a flat payload feeds the trigger instead of being silently dropped
    // (NEX-2483). Flag-derived caps merge onto body caps; flags win.
    const body = buildTestWorkflowBody(base, input, flagSampleConfig);

    const result = await client.workflows.testWorkflow(id, body);

    const follow = !!(opts.follow || opts.stream);
    const executionId = result?.executionId;

    if (follow && executionId) {
      if (!isJsonMode()) {
        printRecord(result, [
          { key: "executionId", label: "Execution ID" },
          { key: "status", label: "Status" }
        ]);
        console.log();
      }
      const interval = Math.max(500, parseInt(opts.interval, 10) || 1500);
      const finalStatus = await runFollow(client, executionId, {
        interval,
        wfTag: shortTag(id),
        json: isJsonMode()
      });
      const verdict = finishFollow(finalStatus, { json: isJsonMode() });
      if (verdict.outcome !== "completed")
        process.exitCode = reportRunRefusal(verdict, executionId);
      return;
    }

    if (follow && !executionId) {
      printRecord(result);
      if (!isJsonMode()) {
        console.log(
          color.dim(
            "\nNothing to follow — this trigger has no immediate execution (e.g. it is awaiting an external call)."
          )
        );
      }
      return;
    }

    printRecord(result);
  } catch (err) {
    process.exitCode = handleError(err);
  }
}
