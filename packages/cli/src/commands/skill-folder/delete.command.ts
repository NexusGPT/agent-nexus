import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { confirmable, confirmDestructive } from "../../util/confirm";
import { SKILL_FOLDER_DELETE_CONTRACT } from "../skill-folder.contract.generated";

/** `nexus skill-folder delete` */
export function registerSkillFolderDeleteCommand(skillFolder: Command, program: Command): void {
  const remove = confirmable(skillFolder.command("delete"))
    .description("Delete a skill folder")
    .argument("<id>", "Folder ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus skill-folder delete 11111111-1111-4111-8111-111111111111
  $ nexus skill-folder delete 11111111-1111-4111-8111-111111111111 --yes

Notes:
  IT PROMPTS, AND OFF A TERMINAL THAT PROMPT IS A REFUSAL. --yes is required in
  CI or in a pipe; without it and without a TTY the command declines rather than
  proceeding on a default.
  WHAT BECOMES OF THE SKILLS INSIDE IS NOT STATED BY THIS ROUTE, so do not assume
  either way. If you need them somewhere specific, move them FIRST with
  "nexus skill-folder assign --skill-id <id> --folder-id <id>", or to no folder
  at all with --folder-id null, then delete the empty folder.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        if (!(await confirmDestructive(`Delete skill folder ${id}?`, opts))) return;
        await client.skillFolders.delete(id);
        printSuccess("Skill folder deleted.", { id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  bindCommand(remove, SKILL_FOLDER_DELETE_CONTRACT);
}
