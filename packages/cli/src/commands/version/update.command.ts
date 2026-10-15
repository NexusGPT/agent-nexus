import type { UpdateVersionBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../../util/body";

const UPDATE_HELP = `
Examples:
  $ nexus version update 11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222 --name "v1.1"
  $ nexus version update 11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222 --body '{"name":"v1.1"}'

Notes:
  METADATA ONLY. Name and description are the only editable fields; a version's
  prompt is immutable by design — checkpoint a new one instead.
  AUTO VERSIONS ARE EDITABLE TOO. Nothing refuses a rename on one, so an AUTO
  row can end up looking hand-made in "version list".
  AN EMPTY UPDATE IS A SUCCESS THAT CHANGES NOTHING — both fields are optional.
  Body fields: name, description. Any other key is silently dropped.`;

/** `nexus version update` */
export function registerVersionUpdateCommand(version: Command, program: Command): void {
  version
    .command("update")
    .description("Update version metadata")
    .argument("<agent-id>", "Agent ID")
    .argument("<version-id>", "Version ID")
    .option("--name <name>", "New name")
    .option("--description <text>", "New description")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText("after", UPDATE_HELP)
    .action(async (agentId: string, versionId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, {
          ...(opts.name !== undefined && { name: opts.name }),
          ...(opts.description !== undefined && { description: opts.description })
        });

        await client.agents.versions.update(
          agentId,
          versionId,
          asRequestBody<UpdateVersionBody>(body)
        );
        printSuccess("Version updated.", { id: versionId });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
