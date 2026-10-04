import type { CreateWorkflowBody } from "@agent-nexus/sdk";
import { Command } from "commander";

import { createClient } from "../../client";
import { dashboardUrlFor } from "../../dashboard-url";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../../util/body";
import { WORKFLOW_CREATE_HELP } from "./copy/create-help";

/** `nexus workflow create` — a new workflow. */
export function registerWorkflowCreateCommand(workflow: Command, program: Command): void {
  workflow
    .command("create")
    .description("Create a new workflow")
    .requiredOption("--name <name>", "Workflow name")
    .option("--description <text>", "Workflow description")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText("after", WORKFLOW_CREATE_HELP)
    .action(async (opts) => {
      try {
        const globals = program.optsWithGlobals();
        const client = createClient(globals);
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, {
          ...(opts.name !== undefined && { name: opts.name }),
          ...(opts.description !== undefined && { description: opts.description })
        });

        const wf = await client.workflows.create(asRequestBody<CreateWorkflowBody>(body));
        printSuccess("Workflow created.", {
          id: wf.id,
          name: wf.name,
          dashboardUrl: dashboardUrlFor("workflow", wf.id, globals)
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
