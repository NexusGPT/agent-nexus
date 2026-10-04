import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printEnvelope, printTable } from "../../../output";
import { withMemberCounts } from "../../../util/folder-membership";

/** `nexus deployment folder list` */
export function registerDeploymentFolderListCommand(depFolder: Command, program: Command): void {
  depFolder
    .command("list")
    .description("List deployment folders")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus deployment folder list
  $ nexus deployment folder list --json

Notes:
  --json CARRIES assignments[] — the deployment-to-folder map, and the only
  report of it anywhere in this CLI. Folder rows hold no membership, so which
  folder a deployment sits in is answered by matching deploymentId in
  assignments[] and by nothing else.
  DEPLOYMENTS counts the assignments pointing at each folder. The pairs
  themselves are read under --json.
  Unpaginated. Folders can nest (each carries a parentId) but this is a flat
  list — build the tree from parentId yourself.

  --json HERE IS THE ROUTE'S OWN OBJECT, not {data,meta} and not a bare array.
  "deployment list" is the {data,meta} shape, so a jq '.data[]' carried over
  from it selects nothing AND DOES NOT ERROR — it just prints an empty result,
  which reads as "no folders". Use jq '.folders[]'.`
    )
    .action(async () => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.deploymentFolders.list();

        printEnvelope(result, () => {
          printTable(withMemberCounts(result.folders, result.assignments), [
            { key: "id", label: "ID", width: 36 },
            { key: "name", label: "NAME", width: 30 },
            { key: "members", label: "DEPLOYMENTS", width: 11 }
          ]);
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
