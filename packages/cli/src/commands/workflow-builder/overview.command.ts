import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printRecord } from "../../output";

/** `nexus workflow overview` */
export function registerWorkflowOverviewCommand(workflow: Command, program: Command): void {
  workflow
    .command("overview")
    .description("Get high-level workflow overview with per-node config status")
    .argument("<wf-id>", "Workflow ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workflow overview 11111111-1111-4111-8111-111111111111
  $ nexus workflow overview 11111111-1111-4111-8111-111111111111 --json

Notes:
  A SHAPE REPORT, NOT A READINESS REPORT. configStatus "complete" means the node's
  own required fields are filled. It says nothing about whether its inputs are
  wired, whether {{upstream.field}} resolves, or whether any value is correct.
  A webhookTrigger, an agentInputTrigger and a loopStart have no required fields
  at all, so they ALWAYS report complete. An outputNode used to be in that list;
  it now reports missingFields ["instructions"] when that field is empty, because
  it is the only field the node reads and it emits "" without one. Advisory only —
  publish is not refused for it.
  readyToTest / readyToPublish here are derived from configStatus and the trigger
  COUNT alone — both go false on a workflow holding more than one trigger, since a
  run starts from one of them and skips the rest, and readyToPublish also wants
  exactly one. "nexus workflow validate" computes the same two flags with the graph
  and variable checks included, so its answer is the one to trust before publishing.
  missingFields per node is what to fix; nodeCount / edgeCount are the totals.`
    )
    .action(async (wfId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.workflows.getOverview(wfId);
        printRecord(result);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
