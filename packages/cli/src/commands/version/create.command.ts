import type { CreateCheckpointBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { absent, printSuccess } from "../../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../../util/body";

const CREATE_HELP = `
Examples:
  $ nexus version create 11111111-1111-4111-8111-111111111111
  $ nexus version create 11111111-1111-4111-8111-111111111111 --name "v1.0" --description "Initial release"
  $ nexus version create 11111111-1111-4111-8111-111111111111 --body '{"name":"v1.0"}'
  $ nexus version create 11111111-1111-4111-8111-111111111111 --body '{"name":"v2","prompt":"You are..."}'
  $ nexus version create 11111111-1111-4111-8111-111111111111 --body '{"name":"v2","autoPublish":false}'

Notes:
  THE FIRST CHECKPOINT ON AN AGENT THAT HAS NEVER PUBLISHED GOES STRAIGHT TO
  PRODUCTION. autoPublish defaults to true exactly then, and to false
  afterwards, so the same command is a quiet deploy the first time and a
  private snapshot every time after. Send {"autoPublish": false} in --body to
  stop it, or {"autoPublish": true} to publish deliberately.
  THAT DEFAULT IS THIS COMMAND'S, NOT THE PLATFORM'S. "nexus agent update
  --prompt" writes a checkpoint too and defaults autoPublish to TRUE every
  time, including the tenth — so the rule above does not carry across, and
  reading it as a platform-wide draft rule is how a prompt edit reaches live
  customer conversations. On that command, pass --no-publish.
  IT SNAPSHOTS THE AGENT'S CURRENT DRAFT. With no prompt of its own it copies
  the draft as it stands — so update the agent first, then checkpoint it.
  AN EMPTY DRAFT CHECKPOINTS AND PUBLISHES ANYWAY. On a fresh agent whose prompt
  is still null this succeeds, and the two rules above then compose into the one
  outcome nobody wants: an EMPTY version is published to production, and there
  is no unpublish in this API to take it back. Write the prompt first, or pass
  {"autoPublish": false}. Check with "nexus agent get <agent-id>" that .prompt
  is not null before the first checkpoint.
  IT CAN ALSO WRITE THE PROMPT, and there is no flag for that. A "prompt" key
  in --body OVERWRITES the agent's draft, saves the previous draft as an AUTO
  version first, and checkpoints the new text. Max 1,000,000 characters,
  markdown.
  A REWRITTEN PROMPT RE-RESOLVES ITS @mentions. Mentions are matched by name
  against the agent's live skills and collections, so a mention whose target
  was renamed or removed comes back marked not-found and stops working.
  --name is optional and NOT unique: two checkpoints can share a name, and an
  unnamed one prints "(unnamed)".
  Body fields: name, description, prompt, autoPublish. Any other key is
  silently dropped. A flag overrides the same field in --body.
  Verify with "nexus version list agt-123" and read the PROD column.`;

/** `nexus version create` */
export function registerVersionCreateCommand(version: Command, program: Command): void {
  version
    .command("create")
    .description("Create a named checkpoint of the current prompt")
    .argument("<agent-id>", "Agent ID")
    .option("--name <name>", "Checkpoint name")
    .option("--description <text>", "Checkpoint description")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText("after", CREATE_HELP)
    .action(async (agentId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, {
          ...(opts.name !== undefined && { name: opts.name }),
          ...(opts.description !== undefined && { description: opts.description })
        });

        const ver = await client.agents.versions.createCheckpoint(
          agentId,
          asRequestBody<CreateCheckpointBody>(body)
        );
        printSuccess("Checkpoint created.", {
          id: ver.id,
          name: ver.name ?? absent("(unnamed)")
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
