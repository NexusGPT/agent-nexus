import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { isJsonMode, printSuccess } from "../../output";
import { WORKSPACE_CREATE_CONTRACT } from "../workspace.contract.generated";
import { WORKSPACE_CREATE_HELP } from "./copy/create-help";

/** `nexus workspace create` — a new DRIVE workspace; the slug is derived and permanent. */
export function registerWorkspaceCreateCommand(ws: Command, program: Command): void {
  const create = ws
    .command("create")
    .description("Create a new workspace — the slug is derived from the name and is permanent")
    .argument("<name>", "Workspace name (the slug is derived from it)")
    .addHelpText("after", WORKSPACE_CREATE_HELP)
    .action(async (name: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const workspace = await client.workspaces.create({ name });
        if (isJsonMode()) {
          console.log(JSON.stringify(workspace, null, 2));
          return;
        }
        printSuccess(`Created workspace "${workspace.name}"`, { slug: workspace.slug });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(create, WORKSPACE_CREATE_CONTRACT);
}
