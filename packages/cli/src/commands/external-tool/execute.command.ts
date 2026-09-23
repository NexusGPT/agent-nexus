import type { ExecuteToolDirectBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError, refuse } from "../../errors";
import { printRecord } from "../../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody, resolveInputJson } from "../../util/body";

const EXECUTE_HELP = `
Examples:
  $ nexus external-tool execute 11111111-1111-4111-8111-111111111111 --action google_sheets-create-spreadsheet --input '{"title":"My Sheet"}'
  $ nexus external-tool execute 11111111-1111-4111-8111-111111111111 --action send_email --input '{"to":"a@b.com"}' --credential cred-123
  $ nexus external-tool execute 11111111-1111-4111-8111-111111111111 --body '{"action":"send_email","input":{"to":"a@b.com"}}'
  $ nexus external-tool execute 11111111-1111-4111-8111-111111111111 --action send_email --input /tmp/input.json
  $ cat params.json | nexus external-tool execute 11111111-1111-4111-8111-111111111111 --action send_email --input -

Notes:
  CLASSIFY THE ACTION BEFORE YOU FIRE. This one command both lists records and
  sends mail; its reversibility is entirely --action's. There is no dry run and
  no confirmation.

  "success": true DOES NOT MEAN THE ACTION SUCCEEDED. It reports that Nexus
  dispatched the call and got an answer back. A Pipedream action that failed
  comes back as success with the failure as a STRING in result — read it,
  starting "Pipedream action failed:" or "Pipedream action returned an error:".
  A result of "The action completed but returned no data" is that same shape:
  the upstream returned nothing, which is usually a rejected input.
  success is false only when the tool's own endpoint answered non-2xx.

  NEXUS DOES NOT VALIDATE YOUR PARAMETERS. Required fields are metadata parsed
  from the spec, never enforced here — a missing or misspelled key is forwarded
  as-is and fails upstream, inside an envelope that still says success. Read the
  action's schema from your OpenAPI spec first.
  Empty strings and nulls are STRIPPED before dispatch, so "" is not a way to
  send a blank value.

  --input takes inline JSON, a path to a .json file, or '-' for stdin. Anything
  that is not a readable file is treated as literal JSON.

  --credential accepts either id for the same connected account: the tool-scoped
  one from "tool credentials <toolId>" or the unified one from "credential list".
  Omit it and the FIRST active credential on the tool is chosen for you.`;

/**
 * `nexus external-tool execute`
 *
 * UNBOUND ON PURPOSE: this reaches a route the v1 contract does not declare.
 */
export function registerExternalToolExecuteCommand(
  externalTool: Command,
  program: Command
): Command {
  const leaf = externalTool
    .command("execute")
    .description("Execute a tool action directly (no workflow needed)")
    .argument("<toolId>", "Marketplace tool ID")
    .option("--action <key>", "Action key or operationId")
    .option("--input <json>", "Input parameters as JSON, a file path, or '-' for stdin")
    .option("--credential <id>", "Credential ID override")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText("after", EXECUTE_HELP)
    .action(async (toolId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const flags: Record<string, unknown> = {};
        if (opts.action) flags.action = opts.action;
        if (opts.input) flags.input = await resolveInputJson(opts.input);
        if (opts.credential) flags.credentialId = opts.credential;
        const body = mergeBodyWithFlags(base, flags);

        if (!body.action) {
          process.exitCode = refuse("--action is required (or provide it in --body)");
          return;
        }

        const result = await client.tools.execute(
          toolId,
          asRequestBody<ExecuteToolDirectBody>(body)
        );
        printRecord(result);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  return leaf;
}
