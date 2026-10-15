import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { confirmable, confirmDestructive } from "../../util/confirm";
import { WORKSPACE_DELETE_CONTRACT } from "../workspace.contract.generated";
import { WORKSPACE_DELETE_HELP } from "./copy/delete-help";

/**
 * `nexus workspace delete` — purges every file and then the record. Not
 * the 72h soft delete `workspace restore` recovers from.
 */
export function registerWorkspaceDeleteCommand(ws: Command, program: Command): void {
  const remove = confirmable(ws.command("delete"))
    .description("Delete a workspace and PURGE every file in it — not a soft delete")
    .argument("<slug>", "Workspace slug")
    .addHelpText("after", WORKSPACE_DELETE_HELP)
    .action(async (slug: string, opts: { yes?: boolean }) => {
      try {
        // ⚠️ A REFUSAL'S `hint` IS THE NEXT STEP FOR *THIS* FAILURE, NEVER A
        // SECOND PLACE FOR THE COMMAND'S NOTES. The hand-rolled version of this
        // gate carried "Needs workspaces:delete, which workspaces:write does not
        // imply" — true, already in `--help`, and about a permission failure that
        // did not happen here. Nothing was refused for scope; it was refused for
        // a missing confirmation, so a script following the hint would go and
        // widen a token that was never the problem. `confirmDestructive` owns the
        // wording now, and it says the one thing that is true of every refusal it
        // emits.
        if (!(await confirmDestructive(`Delete workspace "${slug}" and all its files?`, opts))) {
          return;
        }
        const client = createClient(program.optsWithGlobals());
        await client.workspaces.delete(slug);
        printSuccess(`Deleted workspace "${slug}".`);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(remove, WORKSPACE_DELETE_CONTRACT);
}
