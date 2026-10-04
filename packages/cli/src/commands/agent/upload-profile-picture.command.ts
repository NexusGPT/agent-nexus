import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { readUploadBlob } from "../../util/upload-file";

/** `nexus agent upload-profile-picture` */
export function registerAgentUploadProfilePictureCommand(agent: Command, program: Command): void {
  agent
    .command("upload-profile-picture")
    .description("Upload a profile picture for an agent")
    .argument("<id>", "Agent ID")
    .requiredOption("--file <path>", "Path to the image file")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent upload-profile-picture 11111111-1111-4111-8111-111111111111 --file ./avatar.png

Notes:
  The file is read locally first, so a missing path fails before any request.
  Maximum 10 MB — a larger file is a 413 with the stream aborted mid-flight.
  IT REPLACES the agent's current picture; there is no undo and no dry run.
  Answers {profilePicture: <url>}.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const blob = readUploadBlob(opts.file);
        const result = await client.agents.uploadProfilePicture(id, blob);
        printSuccess("Profile picture uploaded.", result);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
