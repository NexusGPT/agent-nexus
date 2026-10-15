import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { printEnvelope, printTable } from "../../output";
import { withMemberCounts } from "../../util/folder-membership";
import { FOLDER_LIST_CONTRACT } from "../folder.contract.generated";

/** `nexus folder list` */
export function registerFolderListCommand(folder: Command, program: Command): void {
  const list = folder
    .command("list")
    .description("List all folders, with the number of agents filed in each")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus folder list
  $ nexus folder list --json
  $ nexus folder list --json | jq '.assignments[] | select(.agentId=="<id>") | .folderId'

Notes:
  --json CARRIES assignments[] — the agent-to-folder map, and the only place
  either surface reports one. Folder rows hold no membership, so "which folder
  is this agent in" is answered by matching agentId in assignments[], and by
  nothing else in this CLI.
  THE TABLE IS A SUMMARY OF THAT SAME DOCUMENT. AGENTS counts the assignments
  pointing at each folder; the pairs themselves are too many rows to be a
  table and are read under --json.
  A blank PARENT column is a root-level folder; anything else is the id of the
  folder it nests under.
  Unpaginated, and scoped to what your key can see (see "nexus folder --help").`
    )
    .action(async () => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.folders.list();

        printEnvelope(result, () => {
          printTable(withMemberCounts(result.folders, result.assignments), [
            { key: "id", label: "ID", width: 36 },
            { key: "name", label: "NAME", width: 30 },
            { key: "members", label: "AGENTS", width: 6 },
            { key: "parentId", label: "PARENT", width: 36 }
          ]);
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  bindCommand(list, FOLDER_LIST_CONTRACT);
}
