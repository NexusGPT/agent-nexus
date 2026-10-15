import type { AssignAgentToFolderBody, AssignAgentToFolderResponse } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { absent, printSuccess } from "../../output";
import { asRequestBody, mergeBodyWithFlags, readClearableFlag, resolveBody } from "../../util/body";
import { FOLDER_ASSIGN_AGENT_CONTRACT } from "../folder.contract.generated";

/**
 * Report what the server SAID, never what it was asked.
 *
 * The server echoes: `agentId` and `folderId` come straight back off the
 * request body and `assigned` is derived from them, so rendering the request
 * produces the same bytes today — and would go on producing them the moment
 * the server stopped agreeing. `--body` can also carry an `agentId` that
 * `--agent-id` does not, which is the one divergence a live server already
 * produces.
 *
 * `assigned` is in the payload because this command's own `--help` tells a
 * script to test it. Under `--json` the payload IS the document, so leaving it
 * out would make that instruction false on the surface it names.
 *
 * 🔴 ONE PAYLOAD, NOT ONE PER BRANCH — the branch picks the SENTENCE and
 * nothing else. The help promises `{agentId, folderId, assigned}` on EVERY
 * answer, and a second object literal is how that promise goes false: the
 * removal branch first shipped without `folderId`, so a script reading
 * `.folderId` off an unassign got `undefined` where the paragraph said `null`.
 * Built this way the two cannot disagree, because there is only one of them.
 *
 * `absent("(none)")` is `null` under `--json` and the word in the terminal, so
 * the key is in the document on both branches without the human channel
 * printing a bare `folderId:` — `renderCell(null)` is the empty string.
 * `skill-folder assign` renders its own nullable folderId the same way.
 */
function reportAssignment(assignment: AssignAgentToFolderResponse): void {
  printSuccess(assignment.assigned ? "Agent assigned to folder." : "Agent removed from folder.", {
    agentId: assignment.agentId,
    folderId: assignment.folderId ?? absent("(none)"),
    assigned: assignment.assigned
  });
}

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
  THE RESPONSE CARRIES assigned, AND THAT IS THE FIELD TO TEST. Every answer is
  {agentId, folderId, assigned}: an assign is folderId "<uuid>" with assigned
  true, an unassign is folderId null with assigned false. Both keys are always
  there, so a script reading .assigned gets a boolean either way and one
  reading .folderId gets null rather than nothing. --json carries all three.
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

        reportAssignment(
          await client.folders.assignAgent(asRequestBody<AssignAgentToFolderBody>(assignBody))
        );
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  bindCommand(assign, FOLDER_ASSIGN_AGENT_CONTRACT);
}
