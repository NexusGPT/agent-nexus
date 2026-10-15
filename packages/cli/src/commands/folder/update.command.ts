import type { UpdateFolderBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { asRequestBody, mergeBodyWithFlags, readClearableFlag, resolveBody } from "../../util/body";
import { FOLDER_UPDATE_CONTRACT } from "../folder.contract.generated";

/** `nexus folder update` */
export function registerFolderUpdateCommand(folder: Command, program: Command): void {
  const update = folder
    .command("update")
    .description("Update a folder")
    .argument("<id>", "Folder ID")
    .option("--name <name>", "New folder name")
    .option("--parent-id <id>", "New parent folder ID (use 'null' for root)")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus folder update 11111111-1111-4111-8111-111111111111 --name "Renamed Folder"
  $ nexus folder update 11111111-1111-4111-8111-111111111111 --parent-id null
  $ nexus folder update 11111111-1111-4111-8111-111111111111 --body '{"name":"Renamed"}'

Notes:
  --parent-id null MOVES THE FOLDER TO ROOT. "null" is the literal token this
  CLI accepts for it; omitting the flag leaves the parent alone. Absence cannot
  say both, which is why the token exists.
  NOTHING PREVENTS A CYCLE. Setting a folder's parent to one of its own
  descendants is accepted at 200 and takes both branches off the root tree.
  There is no unlink command — fix it with another --parent-id null.
  AN EMPTY UPDATE IS A SUCCESS THAT CHANGES NOTHING. Every field is optional,
  so calling this with no flags answers 200 with the folder untouched.
  A folder your key cannot see answers the same 404 as an id that exists
  nowhere — the two are deliberately indistinguishable.
  This is a PATCH: an omitted field is left alone, never cleared.`
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

        await client.folders.update(id, asRequestBody<UpdateFolderBody>(body));
        printSuccess("Folder updated.", { id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  bindCommand(update, FOLDER_UPDATE_CONTRACT);
}
