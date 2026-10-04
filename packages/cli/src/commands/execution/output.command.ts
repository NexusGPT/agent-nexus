import { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { printRecord } from "../../output";
import { WORKFLOW_EXECUTION_GET_OUTPUT_CONTRACT } from "../execution.contract.generated";

/** `nexus execution output` — the run's output payload alone. */
export function registerExecutionOutputCommand(execution: Command, program: Command): void {
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
  COMPLETED run whose outputNode also COMPLETED still answers empty when that node
  had nothing to render. That SETTING defaults to "previous", which emits the
  value data.instructions REFERENCES — the incoming edge does not select it — so
  with no instructions set there is nothing to emit. "workflow validate", the
  node's own configStatus and "workflow overview" all report it now
  (missingFields ["instructions"]); publish still accepts it. Set the outputNode's
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

  // Bound LAST, after every option and positional exists — see `bindCommand`.
  bindCommand(output, WORKFLOW_EXECUTION_GET_OUTPUT_CONTRACT);
}
