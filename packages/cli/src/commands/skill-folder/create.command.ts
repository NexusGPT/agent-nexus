import type { CreateSkillFolderBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../../util/body";
import { SKILL_FOLDER_CREATE_CONTRACT } from "../skill-folder.contract.generated";

/** `nexus skill-folder create` */
export function registerSkillFolderCreateCommand(skillFolder: Command, program: Command): void {
  const create = skillFolder
    .command("create")
    .description("Create a skill folder")
    .requiredOption("--name <name>", "Folder name")
    .option("--parent-id <id>", "Parent folder ID")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus skill-folder create --name "Onboarding"
  $ nexus skill-folder create --name "Q3" --parent-id 11111111-1111-4111-8111-111111111111
  $ nexus skill-folder create --body '{"name":"Onboarding"}'

Notes:
  --parent-id IS WHAT MAKES A FOLDER NESTED, and omitting it creates the folder
  at the root rather than under whatever you last touched. There is no "current
  folder" in this CLI.
  --name is required as a flag OR inside --body; the two are merged, and --body
  alone is enough when it carries a name.
  Answers with the new folder's id and name. The ID is what "skill-folder assign"
  and "skill-folder update" take — the name is display only and is not unique.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, {
          name: opts.name,
          ...(opts.parentId !== undefined && { parentId: opts.parentId })
        });
        const folder = await client.skillFolders.create(asRequestBody<CreateSkillFolderBody>(body));
        printSuccess("Skill folder created.", {
          id: folder.id,
          name: folder.name
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  bindCommand(create, SKILL_FOLDER_CREATE_CONTRACT);
}
