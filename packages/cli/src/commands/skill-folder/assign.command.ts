import type { AssignSkillToFolderBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { absent, isJsonMode, printSuccess } from "../../output";
import { asRequestBody, mergeBodyWithFlags, readClearableFlag, resolveBody } from "../../util/body";
import { SKILL_FOLDER_ASSIGN_CONTRACT } from "../skill-folder.contract.generated";

/** `nexus skill-folder assign` */
export function registerSkillFolderAssignCommand(skillFolder: Command, program: Command): void {
  const assign = skillFolder
    .command("assign")
    .description("Assign a skill to a folder (or unassign)")
    .requiredOption("--skill-id <id>", "Skill ID (workflow or task)")
    .requiredOption("--folder-id <id>", "Folder ID (use 'null' to unassign)")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus skill-folder assign --skill-id <uuid> --folder-id <uuid>
  $ nexus skill-folder assign --skill-id <uuid> --folder-id null
  $ nexus skill-folder assign --skill-id <uuid> --folder-id null --json

Notes:
  --folder-id null UNASSIGNS. It is a different write from every other value:
  the server deletes the assignment row and answers "assigned": false. The
  success line says which of the two happened, and --json carries the same
  field, so a script never has to infer it from the argument it sent.

  A SKILL IS A WORKFLOW OR AN AI TASK, AND THEY ARE LISTED BY TWO COMMANDS THAT
  ANSWER IN DIFFERENT SHAPES. \`nexus workflow list --json\` is an object,
  {"data":[...],"meta":{...}}; \`nexus task list --json\` is a bare array. One
  jq path cannot read both — .data[].id for the first, .[].id for the second —
  so a script that pipes one into the other silently produces an empty id list
  rather than an error.

  The id is checked. A well-formed uuid naming no workflow and no task in your
  organization answers 404, and so does one belonging to another organization —
  the two are deliberately indistinguishable. Before this check the call
  succeeded and filed an assignment pointing at nothing.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, {
          skillId: opts.skillId,
          folderId: readClearableFlag(opts.folderId)
        });
        const result = await client.skillFolders.assign(
          asRequestBody<AssignSkillToFolderBody>(body)
        );

        // The server reports which write it performed in `assigned`, and this
        // command printed "Skill assigned." on both branches while discarding
        // it — so an unassignment reported the opposite of what it did. Read the
        // RESPONSE, never the argument that was sent: `--body` can carry a
        // `folderId` the flags never saw.
        if (isJsonMode()) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        // `absent()` rather than `?? "(none)"`: printSuccess renders one object
        // down two channels, so a string fallback would replace the `null` a
        // script parses. It is unreachable under --json today because of the
        // early return above, and the rule holds anyway — the return is one edit
        // from being removed.
        printSuccess(result.assigned ? "Skill assigned." : "Skill unassigned.", {
          skillId: result.skillId,
          folderId: result.folderId ?? absent("(none)")
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  bindCommand(assign, SKILL_FOLDER_ASSIGN_CONTRACT);
}
