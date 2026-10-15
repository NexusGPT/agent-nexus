import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";

const PUBLISH_HELP = `
Examples:
  $ nexus version publish 11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222

Notes:
  PUBLISHING UN-MARKS WHICHEVER VERSION WAS PRODUCTION BEFORE. Exactly one
  version is production at a time, so this is a move — and the output names
  only the version that won, never the one that lost it. Read the PROD column
  in "nexus version list" first if you need to be able to go back.
  IT APPLIES TO EVERY DEPLOYMENT OF THIS AGENT AT ONCE. There is no staging,
  no per-channel publish and no confirmation prompt.
  THE FIRST PUBLISH TAKES THE AGENT OFF ITS DRAFT, AND THIS API HAS NO
  UNPUBLISH. Until then the draft is what runs; from here on the agent serves
  published versions only, so editing the prompt stops changing what customers
  get until you publish again.
  Publishing an AUTO version is allowed and is the normal way to roll back to
  a state nobody checkpointed.
  Verify with "nexus version list agt-123": exactly one row reads PROD yes.`;

/** `nexus version publish` */
export function registerVersionPublishCommand(version: Command, program: Command): void {
  version
    .command("publish")
    .description("Publish a version to production — THIS IS A MOVE, not an add")
    .argument("<agent-id>", "Agent ID")
    .argument("<version-id>", "Version ID to publish")
    .addHelpText("after", PUBLISH_HELP)
    .action(async (agentId: string, versionId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.agents.versions.publish(agentId, versionId);
        printSuccess("Version published to production.", {
          id: result.id,
          isProduction: "true"
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
