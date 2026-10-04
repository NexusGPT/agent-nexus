import { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { judgeNodeTest, reportNodeTestRefusal } from "../../node-test-verdict";
import { isJsonMode, printRecord } from "../../output";
import { resolveBody } from "../../util/body";
import { buildTestNodeBody, parseInputFlag } from "../../util/test-body";
import { WORKFLOW_TEST_NODE_HELP } from "./copy/test-node-help";

/** `nexus workflow test-node` — one node, with an input you supply. */
export function registerWorkflowTestNodeCommand(workflow: Command, program: Command): void {
  workflow
    .command("test-node")
    .description("Test-execute a single node in a workflow")
    .argument("<workflowId>", "Workflow ID")
    .argument("<nodeId>", "Node ID")
    .option("--input <json>", "Input JSON for the node")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText("after", WORKFLOW_TEST_NODE_HELP)
    .action(async (workflowId: string, nodeId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const input = parseInputFlag(opts.input);
        // The node-test endpoint expects { input } and strips other top-level
        // keys; normalize a flat --input / --body so it isn't dropped (NEX-2483).
        const body = buildTestNodeBody(base, input);
        const result = await client.workflows.testNode(workflowId, nodeId, body);
        // `node-test-verdict.ts` owns what this response MEANS, because
        // `workflow node test` sends the identical request and must reach the
        // identical exit code. `status` is the RUN's status; the NODE's outcome
        // is in `data`, which is what `judgeNodeTest` reads.
        const verdict = judgeNodeTest(result);
        if (verdict.outcome === "passed") {
          printRecord(result);
        } else {
          // 🚨 UNDER --json A FAILURE IS THE ERROR DOCUMENT AND NOTHING ELSE.
          // Printing the record first takes stdout, and `emitDocument`'s
          // first-wins rule then diverts the refusal to stderr — so a consumer
          // reading stdout sees a payload and never learns the node failed.
          // `json-one-document.scan.ts` calls that `error-masked` and it is a
          // defect, not a trade-off. In prose the record is the only place
          // `data.errorDetails` is visible, so a human still gets it.
          if (!isJsonMode()) printRecord(result);
          process.exitCode = reportNodeTestRefusal(verdict);
        }
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
