import type { UpdateCredentialBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printRecord } from "../../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../../util/body";
import { CREDENTIAL_UPDATE_HELP } from "./update.help";

/** `nexus credential update <id>` */
export function registerCredentialUpdateCommand(credential: Command, program: Command): void {
  credential
    .command("update")
    .description("Update a credential's name or description")
    .argument("<id>", "Credential ID")
    .option("--name <name>", "Updated name")
    .option("--description <text>", "Updated description")
    .option("--data <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText("after", CREDENTIAL_UPDATE_HELP)
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        const base = await resolveBody(opts.data);
        const body = mergeBodyWithFlags(base, {
          ...(opts.name !== undefined && { name: opts.name }),
          ...(opts.description !== undefined && { description: opts.description })
        });

        const cred = await client.credentials.update(id, asRequestBody<UpdateCredentialBody>(body));
        printRecord(cred, [
          { key: "id", label: "ID" },
          { key: "service", label: "Service" },
          { key: "name", label: "Name" },
          { key: "status", label: "Status" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
