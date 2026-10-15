import type { AssignAgentToFolderBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { asRequestBody, mergeBodyWithFlags, readClearableFlag, resolveBody } from "../../util/body";
import { FOLDER_ASSIGN_AGENT_CONTRACT } from "../folder.contract.generated";

/** `nexus folder assign` */
export function registerFolderAssignCommand(folder: Command, program: Command): void {
  const assign = folder
    .command("assign")
    .description("Move an agent into a folder — THIS IS A MOVE, an agent sits in one folder")
    .requiredOption("--agent-id <id>", "Agent ID")
    .requiredOption("--folder-id <id>", "Folder ID (use 'null' to remove)")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus folder assign --agent-id 22222222-2222-4222-8222-222222222222 --folder-id 33333333-3333-4333-8333-333333333333
  $ nexus folder assign --agent-id 22222222-2222-4222-8222-222222222222 --folder-id null
  $ nexus folder assign --body '{"agentId":"22222222-2222-4222-8222-222222222222","folderId":"33333333-3333-4333-8333-333333333333"}'

Notes:
  AN AGENT SITS IN ONE FOLDER, SO THIS IS A MOVE. Assigning again takes the
  agent out of the folder it was in — the row is upserted per agent, so there
  is never a second assignment, and NOTHING NAMES THE FOLDER IT LEFT. No folder
  command prints the assignments; one raw read does, and this is it:

    $ nexus api GET /folders | jq '.data.assignments'

  Each entry is {agentId, folderId}. Run it before and after if you need to know
  where an agent came from.
  --folder-id null UNASSIGNS. "null" is the literal token; the flag is
  required, so absence cannot say it.
  THE PRESENCE OF folderId IS THE SIGNAL — THERE IS NO "assigned" FIELD. An
  assign answers {agentId, folderId}; an unassign answers {agentId} with the key
  gone. A script testing .assigned reads undefined on both and cannot tell them
  apart. Test whether folderId is there.
  IDEMPOTENT AND QUIET: unassigning an agent that was in no folder answers 200,
  not a 404. So does re-assigning it to the folder it is already in.
  --agent-id IS NOT CHECKED FOR EXISTENCE. It must be a UUID, but a deleted or
  non-existent agent is accepted and the assignment is written, reporting the
  same success as a real one. Only --folder-id is verified against your
  organization, and a folder that is not yours answers 404.
  Verify with "nexus api GET /folders" and read assignments[] — no folder
  command prints them.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const flags: Record<string, unknown> = {};
        if (opts.agentId !== undefined) flags.agentId = opts.agentId;
        if (opts.folderId !== undefined) {
          flags.folderId = readClearableFlag(opts.folderId);
        }
        const assignBody = mergeBodyWithFlags(base, flags);
        const folderId = assignBody.folderId;

        await client.folders.assignAgent(asRequestBody<AssignAgentToFolderBody>(assignBody));

        if (folderId) {
          printSuccess("Agent assigned to folder.", {
            agentId: opts.agentId,
            folderId
          });
        } else {
          printSuccess("Agent removed from folder.", {
            agentId: opts.agentId
          });
        }
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  bindCommand(assign, FOLDER_ASSIGN_AGENT_CONTRACT);
}
