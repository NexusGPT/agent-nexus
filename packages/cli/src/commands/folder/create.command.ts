import type { CreateFolderBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../../util/body";
import { FOLDER_CREATE_CONTRACT } from "../folder.contract.generated";

/** `nexus folder create` */
export function registerFolderCreateCommand(folder: Command, program: Command): void {
  const create = folder
    .command("create")
    .description("Create a new folder")
    .requiredOption("--name <name>", "Folder name")
    .option("--parent-id <id>", "Parent folder ID for nesting")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus folder create --name "Customer Support"
  $ nexus folder create --name "Sub Team" --parent-id 11111111-1111-4111-8111-111111111111
  $ nexus folder create --body '{"name":"Support"}'

Notes:
  NAMES ARE NOT UNIQUE. Creating "Support" twice gives two folders with the
  same name and different ids, and nothing warns. There is no lookup-by-name —
  read the id this command prints, or "nexus folder list".
  --parent-id NESTS the folder under an existing one. It must be a UUID, and it
  is NOT checked against your organization: an id that exists nowhere fails
  with a 500 from a foreign-key violation, not a 404.
  Body fields: name (required, non-empty), parentId (optional UUID). ANY OTHER
  FIELD IN --body IS SILENTLY DROPPED — the server strips what it does not know
  rather than refusing it, so a typo'd key looks accepted. A flag always
  overrides the same field in --body.
  "OPTIONAL" MEANS OMIT parentId, NOT SEND null. An explicit
  --body '{"parentId":null}' is a 400 here, while the same null on
  "folder update" is the documented way to move a folder to the root. So a
  create body built by copying an update body fails on exactly that key: drop
  it instead of nulling it.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, {
          ...(opts.name !== undefined && { name: opts.name }),
          ...(opts.parentId !== undefined && { parentId: opts.parentId })
        });

        const folder = await client.folders.create(asRequestBody<CreateFolderBody>(body));
        printSuccess("Folder created.", {
          id: folder.id,
          name: folder.name
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  bindCommand(create, FOLDER_CREATE_CONTRACT);
}
