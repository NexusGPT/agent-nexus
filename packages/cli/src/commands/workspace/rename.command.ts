import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { isJsonMode, printRecord } from "../../output";
import { WORKSPACE_RENAME_CONTRACT } from "../workspace.contract.generated";
import { WORKSPACE_RENAME_HELP } from "./copy/rename-help";

/** `nexus workspace rename` — the display name only; the slug is immutable. */
export function registerWorkspaceRenameCommand(ws: Command, program: Command): void {
  const rename = ws
    .command("rename")
    .description("Rename a workspace — the DISPLAY NAME only, the slug never changes")
    .argument("<slug>", "Workspace slug")
    .argument("<name>", "New name")
    .addHelpText("after", WORKSPACE_RENAME_HELP)
    .action(async (slug: string, name: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const workspace = await client.workspaces.rename(slug, { name });
        if (isJsonMode()) {
          console.log(JSON.stringify(workspace, null, 2));
          return;
        }
        printRecord(workspace);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(rename, WORKSPACE_RENAME_CONTRACT);
}
