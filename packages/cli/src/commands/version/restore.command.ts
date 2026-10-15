import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { confirmable, confirmDestructive } from "../../util/confirm";

const RESTORE_HELP = `
Examples:
  $ nexus version restore 11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222
  $ nexus version restore 11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222 --yes

Notes:
  THIS DOES NOT PUBLISH, AND ON A PUBLISHED AGENT IT CHANGES NOTHING AT
  RUNTIME. It writes the agent's DRAFT prompt only. A published agent serves
  its production version, so every conversation carries on with the old text
  while this reports success. Follow it with
  "nexus version publish <agent-id> <version-id>" to actually roll back.
  IT SAVES NOTHING FIRST. The draft it overwrites is not checkpointed and not
  recoverable — run "nexus version create <agent-id>" before this if the
  current draft matters.
  IT CREATES NO VERSION ROW either, so "version list" looks identical
  afterwards. The only way to see that it ran is to read the agent's prompt.
  --yes IS REQUIRED IN A SCRIPT. With no terminal to answer on, this REFUSES
  and exits non-zero rather than acting.
  Verify with "nexus agent get agt-123" and read the prompt.`;

/** `nexus version restore` */
export function registerVersionRestoreCommand(version: Command, program: Command): void {
  confirmable(version.command("restore"))
    .description("Restore the agent's DRAFT prompt to a previous version — this does not publish")
    .argument("<agent-id>", "Agent ID")
    .argument("<version-id>", "Version ID to restore")
    .addHelpText("after", RESTORE_HELP)
    .action(async (agentId: string, versionId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        if (
          !(await confirmDestructive(
            `Restore agent ${agentId} to version ${versionId}? This will overwrite the current prompt.`,
            opts
          ))
        )
          return;

        const result = await client.agents.versions.restore(agentId, versionId);
        printSuccess("Version restored.", { agentId, versionId, ...result });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
