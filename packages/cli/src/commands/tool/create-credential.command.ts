import type { CreatePipedreamCredentialBody } from "@agent-nexus/sdk";
import { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../../util/body";

/** `nexus tool create-credential` — record a Pipedream account against a tool. */
export function registerToolCreateCredentialCommand(tool: Command, program: Command): void {
  tool
    .command("create-credential")
    .description("Create a Pipedream credential after OAuth via connect link")
    .argument("<id>", "Tool ID")
    .requiredOption("--account-id <id>", "Pipedream account ID (apn_...), NOT a connectionId")
    .option("--name <name>", "Credential name")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tool create-credential 11111111-1111-4111-8111-111111111111 --account-id apn_z8hD1b4
  $ nexus tool create-credential 11111111-1111-4111-8111-111111111111 --account-id apn_z8hD1b4 --name "Production Gmail"

Notes:
  THIS IS THE STEP AFTER THE BROWSER, NOT INSTEAD OF IT. The OAuth happens at a
  Pipedream connect link; this records the account it produced against the tool.
  Running it before that consent has nothing to record.

  --account-id IS PIPEDREAM'S ID AND IT LOOKS LIKE apn_z8hD1b4. It is the one
  identifier here that does not come from this CLI, and it is NOT the
  connectionId "tool connection-status" hands back — that one is a Nexus uuid,
  a different namespace, and this command now refuses it by name rather than
  storing a credential that could never execute.

  A COMPLETED HANDSHAKE HAS ALREADY STORED ITS CREDENTIAL. When
  "tool connection-status" answers COMPLETED, connectionId names a credential
  that EXISTS — list it with "nexus credential list". There is nothing left for
  this command to record, so reach for it only when you hold an apn_ id from
  Pipedream itself.

  THIS COMMAND IS PIPEDREAM-ONLY. A tool of any other type (APIFY, MANIFEST,
  CUSTOM_MANIFEST, ...) answers 422 TOOL_NOT_PIPEDREAM and names the flow that
  does fit it: "nexus tool connect <id> --auth-type http --api-key-value <key>".

  --name is what tells two credentials on the same tool apart in
  "nexus tool credentials". Skip it and you get a list you cannot choose from.
  It answers with the new credential's own id, which is the handle
  "tool execute" takes.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const flags: Record<string, unknown> = { accountId: opts.accountId };
        if (opts.name !== undefined) flags.name = opts.name;
        const body = mergeBodyWithFlags(base, flags);
        const result = await client.toolConnection.createPipedreamCredential(
          id,
          asRequestBody<CreatePipedreamCredentialBody>(body)
        );
        printSuccess("Credential created.", { id: result.id, name: result.name });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
