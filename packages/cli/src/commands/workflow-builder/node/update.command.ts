import type { UpdateNodeBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printRecord } from "../../../output";
import { asRequestBody, resolveRequiredBody } from "../../../util/body";

/** `nexus workflow node update` */
export function registerWorkflowNodeUpdateCommand(node: Command, program: Command): void {
  node
    .command("update")
    .description("Update node data/config")
    .argument("<wf-id>", "Workflow ID")
    .argument("<node-id>", "Node ID")
    .requiredOption("--body <json-or-file-or-->", "Node data/config JSON")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workflow node update 11111111-1111-4111-8111-111111111111 node-456 --body '{"data":{"label":"Summarize"}}'
  $ nexus workflow node update 11111111-1111-4111-8111-111111111111 node-456 --body '{"parentId":"<loop-node-id>"}'
  $ nexus workflow node update 11111111-1111-4111-8111-111111111111 node-456 --body '{"parentId":null}'
  $ nexus workflow node update 11111111-1111-4111-8111-111111111111 node-456 --body config.json
  $ echo '{"data":{"key":"val"}}' | nexus workflow node update 11111111-1111-4111-8111-111111111111 node-456 --body -

Notes:
  ONLY data AND parentId ARE WRITABLE, AND THE BODY MUST CARRY ONE OF THEM. A
  body naming neither is a 400, so --body '{"label":"NOPE"}' is refused outright
  rather than accepted as a no-op. The silent drop applies only ALONGSIDE a real
  field: send data AND a top-level "label" and the label goes without comment
  while the data lands.
  A TOP-LEVEL "type" IS THE ONE EXCEPTION — IT IS REFUSED BY NAME, WITH OR
  WITHOUT data. A node's type is fixed when it is created. To change the
  workflow's trigger use "nexus workflow trigger <wf-id> --type <triggerType>",
  which replaces the trigger node and reconnects its edges; any other node's type
  is changed by creating the replacement and deleting the old one.
  parentId MOVES THE NODE'S LOOP SCOPE: an id puts it inside that loop, null takes
  it out, and omitting it leaves the scope alone. A cycle, or a loopStart /
  doWhileStart / trigger node, is refused.
  data is MERGED into the stored data, so send only what changes. THE MERGE IS
  RECURSIVE, so this holds INSIDE a nested map too: writing one entry of
  parametersSetup, or one parameter of an agentInputTrigger, leaves the other
  entries alone instead of replacing the map.
  TO REMOVE A NESTED ENTRY, SEND IT AS null:
  --body '{"data":{"parametersSetup":{"city":null}}}' drops "city" and keeps the
  rest. A null at the TOP level of data stores null instead, because several node
  types read a top-level key that is present-and-null differently from an absent
  one. An ARRAY always replaces wholesale, at every depth — send it complete.
  A PARTIAL WRITE IS REFUSED WHEN THE STORED VALUE CANNOT BE MERGED: if the key
  you are writing into holds a string or an array on the stored node rather than
  an object, the call fails and NOTHING is written, so the drifted value is left
  intact for you to read with "workflow node get" and send back whole.
  FIVE data FIELDS ARE READ-ONLY AND SILENTLY STRIPPED FROM YOUR WRITE:
  runOutput, testExecutionId, outputFormat, testWebhookUrl and the editor's own
  state. runOutput is the exception that matters — it IS writable, but only on an
  agentInputTrigger, a webhookTrigger, a pluginTrigger or a humanInput node. On
  any other node, scheduleTrigger included, it is dropped and the 200 says
  nothing.
  Set trigger seed data on the trigger node here; "workflow trigger" refuses it.`
    )
    .action(async (wfId: string, nodeId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const body = await resolveRequiredBody(opts.body);
        const result = await client.workflows.updateNode(
          wfId,
          nodeId,
          asRequestBody<UpdateNodeBody>(body)
        );
        printRecord(result);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
