import { Command } from "commander";

import { createClient } from "../../client";
import { dashboardUrlFor } from "../../dashboard-url";
import { handleError } from "../../errors";
import { printRecord } from "../../output";
import { WORKFLOW_GET_HELP } from "./copy/get-help";

/** `nexus workflow get` — one workflow, with its nodes. */
export function registerWorkflowGetCommand(workflow: Command, program: Command): void {
  workflow
    .command("get")
    .description("Get workflow details")
    .argument("<id>", "Workflow ID")
    .addHelpText("after", WORKFLOW_GET_HELP)
    .action(async (id: string) => {
      try {
        const globals = program.optsWithGlobals();
        const client = createClient(globals);
        const wf = await client.workflows.get(id);
        printRecord({ ...wf, dashboardUrl: dashboardUrlFor("workflow", wf.id, globals) }, [
          { key: "id", label: "ID" },
          { key: "name", label: "Name" },
          { key: "description", label: "Description" },
          { key: "status", label: "Status" },
          { key: "createdAt", label: "Created" },
          { key: "updatedAt", label: "Updated" },
          { key: "dashboardUrl", label: "Dashboard" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
