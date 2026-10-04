import { Command } from "commander";

import { collect } from "./_shared/collect";
import { WORKFLOW_TEST_HELP } from "./copy/test-help";
import { runWorkflowTest } from "./test.handler";

/** `nexus workflow test` — a test execution, optionally followed. */
export function registerWorkflowTestCommand(workflow: Command, program: Command): void {
  workflow
    .command("test")
    .description("Run a test execution of a workflow")
    .argument("<id>", "Workflow ID")
    .option("--input <json>", "Trigger payload JSON for the test (fed to the trigger node)")
    .option(
      "--body <json>",
      "Request body as JSON, .json file, or '-' for stdin. A flat object is used as the trigger payload; { triggerData, sampleConfig } is used as-is"
    )
    .option("--follow", "Stream per-node progress as the execution runs")
    .option("--stream", "Alias for --follow")
    .option("--interval <ms>", "Follow polling interval in milliseconds (default: 1500)", "1500")
    .option(
      "--sample <n>",
      "Cap the --sample-node loop to at most N items for this test run (no workflow edit)"
    )
    .option("--sample-node <nodeId>", "The loop node id to cap (used with --sample)")
    .option(
      "--limit-array <nodeId=N>",
      "Cap a node's array to N items for this test run (repeatable)",
      collect,
      []
    )
    .addHelpText("after", WORKFLOW_TEST_HELP)
    .action(async (id: string, opts) => {
      await runWorkflowTest(program, id, opts);
    });
}
