import type { UpdateWorkflowBody } from "@agent-nexus/sdk";
import { Command } from "commander";

import { createClient } from "../../client";
import { dashboardUrlFor } from "../../dashboard-url";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../../util/body";
import { WORKFLOW_UPDATE_HELP } from "./copy/update-help";

/** `nexus workflow update` — a PATCH over a workflow's own fields. */
export function registerWorkflowUpdateCommand(workflow: Command, program: Command): void {
  workflow
    .command("update")
    .description("Update a workflow")
    .argument("<id>", "Workflow ID")
    .option("--name <name>", "Workflow name")
    .option("--description <text>", "Workflow description")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText("after", WORKFLOW_UPDATE_HELP)
    .action(async (id: string, opts) => {
      try {
        const globals = program.optsWithGlobals();
        const client = createClient(globals);
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, {
          ...(opts.name !== undefined && { name: opts.name }),
          ...(opts.description !== undefined && { description: opts.description })
        });

        await client.workflows.update(id, asRequestBody<UpdateWorkflowBody>(body));
        printSuccess("Workflow updated.", {
          id,
          dashboardUrl: dashboardUrlFor("workflow", id, globals)
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
