import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { confirmable, confirmDestructive } from "../../util/confirm";

const DELETE_HELP = `
Examples:
  $ nexus version delete 11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222
  $ nexus version delete 11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222 --yes

Notes:
  YOU CANNOT DELETE THE PRODUCTION VERSION. The API refuses with HTTP 409 and
  the code PRODUCTION_PROMPT_VERSION_IN_USE, naming the version and what to do
  instead. Publish a different version first, then delete this one. Check the
  PROD column in "nexus version list" before you call it.
  ANY OTHER VERSION GOES, INCLUDING AUTO ONES, and the prompt it held is gone
  with it. There is no undo. The response carries the id and nothing else —
  there is no "deleted" field to assert on, so a 200 IS the confirmation.
  TO DELETE THE PRODUCTION VERSION, PUBLISH ANOTHER ONE FIRST. Three commands,
  in this order — the delete then succeeds:
    $ nexus version list 11111111-1111-4111-8111-111111111111            # find the PROD=yes row
    $ nexus version publish 11111111-1111-4111-8111-111111111111 <other-version-id>
    $ nexus version delete 11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222
  --yes IS REQUIRED IN A SCRIPT. With no terminal to answer on, this REFUSES
  and exits non-zero rather than acting.`;

/** `nexus version delete` */
export function registerVersionDeleteCommand(version: Command, program: Command): void {
  confirmable(version.command("delete"))
    .description("Delete a prompt version")
    .argument("<agent-id>", "Agent ID")
    .argument("<version-id>", "Version ID")
    .addHelpText("after", DELETE_HELP)
    .action(async (agentId: string, versionId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        if (!(await confirmDestructive(`Delete version ${versionId}?`, opts))) return;

        await client.agents.versions.delete(agentId, versionId);
        printSuccess("Version deleted.", { id: versionId });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
