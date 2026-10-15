import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printEnvelope, printList } from "../../../output";
import { withMemberCounts } from "../../../util/folder-membership";

/** `nexus template folder list` */
export function registerTemplateFolderListCommand(tplFolder: Command, program: Command): void {
  tplFolder
    .command("list")
    .description("List document template folders")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus template folder list
  $ nexus template folder list --json | jq '.assignments[]'

Notes:
  A PARENT of "-" or empty is a root folder. Unpaginated.
  --json CARRIES assignments[] — the template-to-folder map, and the only
  report of it in this CLI. Folder rows hold no membership, so which folder a
  template sits in is answered by matching templateId in assignments[].
  TEMPLATES counts the assignments pointing at each folder.`
    )
    .action(async () => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.documentTemplateFolders.list();

        printEnvelope(result, () => {
          printList(withMemberCounts(result.folders, result.assignments), undefined, [
            { key: "id", label: "ID", width: 36 },
            { key: "name", label: "NAME", width: 30 },
            { key: "members", label: "TEMPLATES", width: 9 },
            { key: "parentId", label: "PARENT", width: 36 }
          ]);
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
