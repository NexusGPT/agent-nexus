import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { color, printEnvelope, printTable } from "../../output";
import { SKILL_FOLDER_LIST_CONTRACT } from "../skill-folder.contract.generated";

/** `nexus skill-folder list` */
export function registerSkillFolderListCommand(skillFolder: Command, program: Command): void {
  const list = skillFolder
    .command("list")
    .description("List skill folders and assignments")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus skill-folder list
  $ nexus skill-folder list --json

Notes:
  This prints BOTH halves the endpoint returns: the folders, then which skill
  sits in which folder. A folder's contents are NOT a field on the folder — the
  assignments are a separate flat list keyed by skill ID, so a folder with rows
  in the second table is not empty even though the first table says nothing
  about it.
  A skill that appears in NO assignment row is unfiled, not missing.
  Under --json the document is {"folders":[...],"assignments":[...]} — the
  untouched response, both halves, so a script never has to call twice.`
    )
    .action(async () => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.skillFolders.list();

        // `--json` gets the WHOLE response. The two human tables below render
        // the same two arrays; printing only `folders` (which this command did)
        // dropped the assignments from both channels, so the command could not
        // do the thing its own description promises and a script had no way to
        // ask for the missing half.
        //
        // The cure used to be a hand-written `if (isJsonMode())` early return
        // with its own `console.log(JSON.stringify(...))`. That was correct and
        // invisible: it bypassed `emitDocument`, so it sat outside the
        // one-document guarantee, and it made this leaf unreadable to
        // `json-shape.scan.ts`, which then published no `--json` shape line for
        // it at all. `printEnvelope` is the same split as a mechanism.
        printEnvelope(result, () => {
          printTable(result.folders ?? [], [
            { key: "id", label: "ID", width: 36 },
            { key: "name", label: "NAME", width: 30 },
            { key: "parentId", label: "PARENT", width: 36 }
          ]);

          console.log();
          console.log(color.bold("ASSIGNMENTS"));
          printTable(result.assignments ?? [], [
            { key: "skillId", label: "SKILL ID", width: 36 },
            { key: "folderId", label: "FOLDER ID", width: 36 }
          ]);
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  bindCommand(list, SKILL_FOLDER_LIST_CONTRACT);
}
