import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../../util/body";

/** `nexus agent generate-profile-picture` */
export function registerAgentGenerateProfilePictureCommand(agent: Command, program: Command): void {
  agent
    .command("generate-profile-picture")
    .description("Generate an AI profile picture for an agent")
    .argument("<id>", "Agent ID")
    .option("--prompt <text>", "Custom prompt to guide image style")
    .option("--body <json>", "Request body as JSON")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent generate-profile-picture 11111111-1111-4111-8111-111111111111
  $ nexus agent generate-profile-picture 11111111-1111-4111-8111-111111111111 --prompt "flat vector, teal background"

Notes:
  The image is generated from the agent's OWN name and role. --prompt only
  steers the style, is sent as customPrompt, and is capped at 2000 characters.
  IT REPLACES the agent's current picture as soon as generation succeeds.
  Answers {profilePicture, sizes} — sizes carries the optimized variants.
  Generation calls out to an image model, so this is the slowest agent command.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, opts.prompt ? { customPrompt: opts.prompt } : {});
        const result = await client.agents.generateProfilePicture(
          id,
          asRequestBody<{ customPrompt?: string }>(body)
        );
        printSuccess("Profile picture generated.", result);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
