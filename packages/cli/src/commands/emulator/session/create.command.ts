import type { CreateEmulatorSessionBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand } from "../../../contract-binding";
import { handleError } from "../../../errors";
import { printRecord } from "../../../output";
import { asRequestBody, resolveBody } from "../../../util/body";
import { EMULATOR_CREATE_SESSION_CONTRACT } from "../../emulator.contract.generated";

/** `nexus emulator session create` */
export function registerEmulatorSessionCreateCommand(session: Command, program: Command): Command {
  const leaf = session
    .command("create")
    .description("Create an emulator session")
    .argument("<deployment-id>", "Deployment ID")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus emulator session create 44444444-4444-4444-8444-444444444444
  $ nexus emulator session create 44444444-4444-4444-8444-444444444444 --body '{"participants":[{"identifier":"+15551234567","displayName":"Ada"}]}'
  $ nexus emulator session create 44444444-4444-4444-8444-444444444444 --json

Notes:
  THE ONLY BODY FIELD IS participants, AN ARRAY. Anything else — including the
  singular "participant" this example used to show — is dropped without an
  error, and you get a one-participant session named "Test User" as if you had
  passed nothing. Each entry is {identifier, displayName}, both optional and
  both capped at 256 characters, up to 20 entries.

  THE ids ARE ASSIGNED BY THE SERVER, NOT BY YOU: participant_1, participant_2
  in the order you listed them. That is what "emulator send --body
  '{"participantId":"participant_2"}'" takes — an identifier or a display name
  there is a 400 listing the real ids.
  identifier is the channel address the agent sees (a phone number, an email);
  omitted, one is synthesized from the deployment type.
  The deployment must exist in this organization or it is a 404. It does NOT
  have to be active to create a session — only to send.`
    )
    .action(async (deploymentId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        // `session create dep-123` with no `--body` is a documented invocation
        // and every field of `CreateEmulatorSessionBody` is optional, so `{}` is
        // a usable value of the right type. The wire delta is an empty JSON
        // object in place of no body; the endpoint parses both to the same `{}`.
        const body = (await resolveBody(opts.body)) ?? {};
        const s = await client.emulator.createSession(
          deploymentId,
          asRequestBody<CreateEmulatorSessionBody>(body)
        );
        printRecord(s, [
          { key: "id", label: "ID" },
          { key: "deploymentId", label: "Deployment ID" },
          { key: "createdAt", label: "Created" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  bindCommand(leaf, EMULATOR_CREATE_SESSION_CONTRACT);
  return leaf;
}
