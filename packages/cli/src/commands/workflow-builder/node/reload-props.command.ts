import type { ReloadPropsBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printRecord } from "../../../output";
import { asRequestBody, resolveRequiredBody } from "../../../util/body";

/** `nexus workflow node reload-props` */
export function registerWorkflowNodeReloadPropsCommand(node: Command, program: Command): void {
  node
    .command("reload-props")
    .description("Reload dynamic props for a Pipedream node")
    .argument("<wf-id>", "Workflow ID")
    .argument("<node-id>", "Node ID")
    .requiredOption("--body <json-or-file-or-->", "Configured props JSON")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workflow node reload-props 11111111-1111-4111-8111-111111111111 node-456 --body '{"configuredProps":{"account":"acc-1"}}'
  $ nexus workflow node reload-props 11111111-1111-4111-8111-111111111111 node-456 --body props.json

Notes:
  For Pipedream plugin nodes only. Some props only exist once an earlier prop is
  chosen (pick a spreadsheet, then its sheets appear) — this asks the provider for
  the next set, given what is configured so far.
  Send the props you have already chosen in configuredProps; dynamicPropsId chains
  a second reload onto the first reload's answer.`
    )
    .action(async (wfId: string, nodeId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const body = await resolveRequiredBody(opts.body);
        const result = await client.workflows.reloadProps(
          wfId,
          nodeId,
          asRequestBody<ReloadPropsBody>(body)
        );
        printRecord(result);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
