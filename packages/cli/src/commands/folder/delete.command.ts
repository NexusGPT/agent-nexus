import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { confirmable, confirmDestructive } from "../../util/confirm";
import { FOLDER_DELETE_CONTRACT } from "../folder.contract.generated";

/** `nexus folder delete` */
export function registerFolderDeleteCommand(folder: Command, program: Command): void {
  const remove = confirmable(folder.command("delete"))
    .description("Delete a folder — agents are unassigned, child folders are promoted to root")
    .argument("<id>", "Folder ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus folder delete 11111111-1111-4111-8111-111111111111
  $ nexus folder delete 11111111-1111-4111-8111-111111111111 --yes

Notes:
  UNASSIGNS, DOES NOT DELETE. The agents in this folder survive and become
  unfoldered — their assignment rows go with the folder. The response carries
  the folder id and nothing else; there is no "deleted" field to assert on, so
  a 200 IS the confirmation.
  CHILD FOLDERS SURVIVE AND ARE PROMOTED TO ROOT. Their parentId is set to
  null, so a nested tree is FLATTENED rather than removed, and nothing in the
  response or the confirmation prompt mentions them. Run "nexus folder list"
  first and read the PARENT column.
  --yes IS REQUIRED IN A SCRIPT. With no terminal to answer on, this REFUSES
  and exits non-zero rather than acting.
  There is no undo. Verify with "nexus folder list": the folder is gone and its
  children now show a blank PARENT.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        if (!(await confirmDestructive(`Delete folder ${id}? Agents will be unassigned.`, opts)))
          return;

        await client.folders.delete(id);
        printSuccess("Folder deleted.", { id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  bindCommand(remove, FOLDER_DELETE_CONTRACT);
}
