import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printRecord } from "../../../output";

/** `nexus workflow node output-format` */
export function registerWorkflowNodeOutputFormatCommand(node: Command, program: Command): void {
  node
    .command("output-format")
    .description("Show node output schema")
    .argument("<wf-id>", "Workflow ID")
    .argument("<node-id>", "Node ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workflow node output-format 11111111-1111-4111-8111-111111111111 node-456
  $ nexus workflow node output-format 11111111-1111-4111-8111-111111111111 node-456 --json

Notes:
  Answers {schema, source}, and SOURCE IS THE FIELD THAT MATTERS.
  source "manual" — the node's stored outputFormat, which a test run writes from
  the real output. This is a schema you can trust.
  source "nodeType" — NOTHING HAS RUN; you are reading the node TYPE's own
  declaration. Where the type declares what it emits — cueNode's five keys, a
  loop's array, a trigger's payload — that schema is real and can be wired before
  the first run. Where it declares nothing you get {"type":"object"}, which proves
  nothing about what this node will actually emit, and a downstream node tested
  against it runs on schema defaults.
  An outputNode has no output schema at all, so its schema is null.`
    )
    .action(async (wfId: string, nodeId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.workflows.getOutputFormat(wfId, nodeId);
        printRecord(result);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
