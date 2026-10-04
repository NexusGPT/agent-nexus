import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printRecord } from "../../../output";

/** `nexus workflow node get` */
export function registerWorkflowNodeGetCommand(node: Command, program: Command): void {
  node
    .command("get")
    .description("Get node details")
    .argument("<wf-id>", "Workflow ID")
    .argument("<node-id>", "Node ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workflow node get 11111111-1111-4111-8111-111111111111 node-456
  $ nexus workflow node get 11111111-1111-4111-8111-111111111111 node-456 --json

Notes:
  THE VERIFICATION READ for every node write, and the required step between the
  two halves of configuring a plugin node (set the action, read it back, then set
  the credential).
  --json is ONE FLAT OBJECT — the node's own fields at the top level, with no
  {data, meta} envelope, no {success} wrapper and no "node" key to unwrap.
  🚨 THE CONFIGURATION IS ONE LEVEL DOWN, UNDER "data". The top level carries
  id, type, configStatus, missingFields, errors and data; everything you SET on
  the node is inside data. So it is .data.label, NOT .label — and the same for
  instructions, code, message and every other node field. jq reading the
  shallow path finds nothing and prints null, which reads as an empty field
  rather than as a wrong path:

    $ nexus workflow node get 11111111-1111-4111-8111-111111111111 node-456 --json | jq '{configStatus, label: .data.label}'

  configStatus and missingFields say whether the node's OWN required fields are
  filled — not that its inputs resolve. deletable appears only when the node
  cannot be deleted, parentId only when it lives inside a loop.
  A webhookTrigger also reports its test and production URLs here.`
    )
    .action(async (wfId: string, nodeId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.workflows.getNode(wfId, nodeId);
        printRecord(result);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
