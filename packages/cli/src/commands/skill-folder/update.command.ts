import type { UpdateSkillFolderBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { asRequestBody, mergeBodyWithFlags, readClearableFlag, resolveBody } from "../../util/body";
import { SKILL_FOLDER_UPDATE_CONTRACT } from "../skill-folder.contract.generated";

/** `nexus skill-folder update` */
export function registerSkillFolderUpdateCommand(skillFolder: Command, program: Command): void {
  const update = skillFolder
    .command("update")
    .description("Update a skill folder")
    .argument("<id>", "Folder ID")
    .option("--name <name>", "Folder name")
    .option("--parent-id <id>", "Parent folder ID (use 'null' for root)")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus skill-folder update 11111111-1111-4111-8111-111111111111 --name "Renamed"
  $ nexus skill-folder update 11111111-1111-4111-8111-111111111111 --parent-id null
  $ nexus skill-folder update 11111111-1111-4111-8111-111111111111 --body '{"name":"Renamed"}'

Notes:
  MOVING A FOLDER TO THE ROOT IS THE LITERAL STRING null. --parent-id null is
  translated to a real JSON null before the request, and it is the only way to
  un-nest a folder; omitting the flag leaves the parent untouched rather than
  clearing it.
  Every field is optional, so omitting a flag LEAVES IT ALONE. This is a patch,
  not a replace — sending only --name cannot blank the parent.
  Answers with the id alone. Read the folder back if you need to confirm the
  new shape.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const flags: Record<string, unknown> = {};
        if (opts.name !== undefined) flags.name = opts.name;
        if (opts.parentId !== undefined) {
          flags.parentId = readClearableFlag(opts.parentId);
        }
        const body = mergeBodyWithFlags(base, flags);
        await client.skillFolders.update(id, asRequestBody<UpdateSkillFolderBody>(body));
        printSuccess("Skill folder updated.", { id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  bindCommand(update, SKILL_FOLDER_UPDATE_CONTRACT);
}
