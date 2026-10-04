import type { TestNodeBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { judgeNodeTest, reportNodeTestRefusal } from "../../../node-test-verdict";
import { isJsonMode, printRecord } from "../../../output";
import { asRequestBody, resolveBody } from "../../../util/body";
import { NODE_TEST_NOTES } from "../copy/node-test-notes";

/** `nexus workflow node test` */
export function registerWorkflowNodeTestCommand(node: Command, program: Command): void {
  node
    .command("test")
    .description("Run a test execution of a single node")
    .argument("<wf-id>", "Workflow ID")
    .argument("<node-id>", "Node ID")
    .option(
      "--body <json-or-file-or-->",
      'Optional mock data: {"input":{"<upstreamNodeId|variableName>":<value>}} — replaces the node\'s resolved input'
    )
    .addHelpText("after", NODE_TEST_NOTES)
    .action(async (wfId: string, nodeId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        // `--body` is genuinely optional here (`node test` with no mock data is
        // a documented invocation), and every field of `TestNodeBody` is
        // optional, so `{}` is a usable value of the right type rather than an
        // invented one. The wire delta is an empty JSON object in place of no
        // body at all; the endpoint parses both to the same `{}`.
        const body = (await resolveBody(opts.body)) ?? {};
        const result = await client.workflows.testNode(
          wfId,
          nodeId,
          asRequestBody<TestNodeBody>(body)
        );
        // The SAME judgement as `workflow test-node`, from the same module. Two
        // spellings of one operation cannot disagree about whether the node
        // passed — see `node-test-verdict.ts`.
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
