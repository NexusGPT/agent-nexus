import type { UpdateExternalToolBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { dashboardUrlFor } from "../../dashboard-url";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../../util/body";
import { SKILLS_UPDATE_EXTERNAL_TOOL_CONTRACT } from "../external-tool.contract.generated";
import {
  extractSpecBreakingChangeDetails,
  reportSpecBreakingChange
} from "./spec-breaking-change.report";

const UPDATE_HELP = `
PATCH path on the Public API: /skills/external-tools/{id}

Examples:
  $ nexus external-tool update 11111111-1111-4111-8111-111111111111 --name "Renamed Tool"
  $ nexus external-tool update 11111111-1111-4111-8111-111111111111 --body update.json
  $ nexus external-tool update 11111111-1111-4111-8111-111111111111 --body update.json --description "New description"

To refresh just the OpenAPI spec from a file, prefer:
  $ nexus external-tool update-spec 11111111-1111-4111-8111-111111111111 --file openapi.yaml

Notes:
  A KEY THE UPDATE DOES NOT RECOGNISE IS DROPPED IN SILENCE, and the call still
  succeeds. So a misspelled field looks applied: the response is a success and
  the value never lands. Read the field back with "nexus external-tool get <id>"
  after any --body update rather than trusting the 200.
  dashboardUrl in the payload is this tool's page, added by this CLI rather
  than returned by the API.`;

/** `nexus external-tool update` */
export function registerExternalToolUpdateCommand(
  externalTool: Command,
  program: Command
): Command {
  const leaf = externalTool
    .command("update")
    .description(
      "Update an external tool (name, description, documentation, endpointUrl, openApiSpec, auth)"
    )
    .argument("<id>", "External tool ID")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .option("--name <name>", "Override / set the tool name")
    .option("--description <text>", "Override / set the description")
    .option("--endpoint-url <url>", "Override / set the endpoint URL")
    .option(
      "--force",
      "When refreshing openApiSpec, override the breaking-change guard (drop/rename bound action keys)"
    )
    .addHelpText("after", UPDATE_HELP)
    .action(async (id: string, opts) => {
      try {
        const globals = program.optsWithGlobals();
        const client = createClient(globals);
        const base = opts.body ? await resolveBody(opts.body) : {};
        const flags: Record<string, unknown> = {};
        if (opts.name) flags.name = opts.name;
        if (opts.description) flags.description = opts.description;
        if (opts.endpointUrl) flags.endpointUrl = opts.endpointUrl;
        const body = mergeBodyWithFlags(base, flags);

        const t = await client.skills.updateExternalTool(
          id,
          asRequestBody<UpdateExternalToolBody>(body),
          {
            force: !!opts.force
          }
        );
        printSuccess("External tool updated.", {
          id: t.id,
          name: t.name,
          dashboardUrl: dashboardUrlFor("externalTool", t.id, globals)
        });
      } catch (err) {
        const breaking = extractSpecBreakingChangeDetails(err);
        if (breaking) {
          process.exitCode = reportSpecBreakingChange(breaking);
          return;
        }
        process.exitCode = handleError(err);
      }
    });
  bindCommand(leaf, SKILLS_UPDATE_EXTERNAL_TOOL_CONTRACT);
  return leaf;
}
