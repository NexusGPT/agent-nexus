import type { ExecuteToolDirectBody } from "@agent-nexus/sdk";
import { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printRecord } from "../../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../../util/body";

/** `nexus tool execute` — run one tool action directly. */
export function registerToolExecuteCommand(tool: Command, program: Command): void {
  tool
    .command("execute")
    .description("Execute a marketplace tool action directly (no workflow)")
    .argument("<id>", "Tool ID")
    .requiredOption("--action <operationId>", "Action operationId to execute")
    .option("--input <json>", "Input parameters as JSON string")
    .option("--credential-id <id>", "Credential ID (optional)")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tool execute 11111111-1111-4111-8111-111111111111 --action "google_sheets-create-spreadsheet" --input '{"title":"My Sheet"}'
  $ nexus tool execute 11111111-1111-4111-8111-111111111111 --body '{"action":"getWeather","input":{"city":"London"}}'

Notes:
  THIS RUNS CUSTOM_MANIFEST TOOLS TOO. "nexus external-tool execute" is a
  sibling, not a required detour — both reach the same execution and return the
  same envelope. Prefer external-tool execute when you are already working in
  that namespace; nothing here is refused for being a custom manifest.

  AN UNNAMED CALL STILL RUNS UNDER THE CREDENTIAL'S FULL AUTHORITY. Omitting
  accessCardId resolves the credential's MASTER card, and a master card permits
  every action the credential can perform and filters no parameter — so this
  command, used as the examples above use it, is unscoped.

  Naming accessCardId in --body is what scopes it, and it is HONOURED rather
  than refused: the card must belong to the credential being spent, and its
  policy decides which action and which parameters survive. A refusal is a 403
  naming what it refused. "nexus access-card list" shows the cards you can name.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const flags: Record<string, unknown> = { action: opts.action };
        if (opts.input) flags.input = JSON.parse(opts.input);
        if (opts.credentialId) flags.credentialId = opts.credentialId;
        const body = mergeBodyWithFlags(base, flags);
        const result = await client.tools.execute(id, asRequestBody<ExecuteToolDirectBody>(body));
        printRecord(result);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
