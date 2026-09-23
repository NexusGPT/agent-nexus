import type { CreateExternalToolBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { dashboardUrlFor } from "../../dashboard-url";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../../util/body";
import { SKILLS_CREATE_EXTERNAL_TOOL_CONTRACT } from "../external-tool.contract.generated";

const CREATE_HELP = `
Examples:
  $ nexus external-tool create --body openapi-tool.json
  $ nexus external-tool create --body '{"name":"Weather API","openApiSpec":"openapi: 3.0.0\\n...","endpointUrl":"https://api.example.com","auth":{"type":"none"}}'
  $ nexus external-tool create --body openapi-tool.json --image-url https://example.com/logo.png
  $ cat spec.json | nexus external-tool create --body -

Notes:
  openApiSpec IS A STRING, NOT AN OBJECT. It carries the spec's JSON or YAML
  text; passing a parsed object is a 400 whatever the spec itself contains.

  PASS THE BODY AS A FILE OR ON STDIN. An inline spec of any real size
  overflows the shell's argument limit and the process dies before the CLI is
  reached — which looks like a broken install, not a long argument.

  REQUIRED IN THE BODY: name, openApiSpec, endpointUrl (a valid URL) and auth.
  auth.type is one of none, service_http, user_http, oauth, user_oauth, keys —
  send { "type": "none" } rather than omitting auth.

  THERE IS NO DRAFT AND NO PUBLISH STEP. The tool comes back PUBLISHED and is
  live the moment this returns — unlike a workflow, which you publish
  separately. Do not go looking for a publish verb, and do not create against a
  production endpoint expecting a staging state first.

  DECLARE requestBody FOR EVERY WRITE OPERATION. Actions are parsed from the
  spec, and an operation with no requestBody gets no body fields — the call
  then goes out bodyless, returns 200 and persists NOTHING.

  The endpointUrl on the tool is the base URL every action is dispatched
  against; the spec's own servers block is not used in its place.

  A COMPLETE MINIMAL BODY IS FOUR KEYS, and the second example above is it:

    {
      "name": "Weather API",
      "openApiSpec": "<the spec's JSON or YAML text, as a STRING>",
      "endpointUrl": "https://api.example.com",
      "auth": { "type": "none" }
    }

  KEEP THE SPEC FILE. "external-tool get" does not return openApiSpec and
  neither does the REST route, so this body is the only copy you will have.

  IT DOES NOT ECHO THE TOOL. --json prints exactly
  {success, message, id, name, dashboardUrl}; id is what every other subcommand
  in this namespace takes as its argument. Read the stored tool with
  "nexus external-tool get <id>".
  dashboardUrl IS THIS CLI'S, NOT THE API'S. It is the page for the tool you
  just made — open it, or hand it to whoever asked for the tool.`;

/** `nexus external-tool create` */
export function registerExternalToolCreateCommand(
  externalTool: Command,
  program: Command
): Command {
  const leaf = externalTool
    .command("create")
    .description("Create an external tool from an OpenAPI spec")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .option("--image-url <url>", "URL to the tool's logo/icon image")
    .addHelpText("after", CREATE_HELP)
    .action(async (opts) => {
      try {
        const globals = program.optsWithGlobals();
        const client = createClient(globals);
        const base = await resolveBody(opts.body);
        const flags: Record<string, unknown> = {};
        if (opts.imageUrl) flags.imageUrl = opts.imageUrl;
        const body = mergeBodyWithFlags(base, flags);

        const t = await client.skills.createExternalTool(
          asRequestBody<CreateExternalToolBody>(body)
        );
        printSuccess("External tool created.", {
          id: t.id,
          name: t.name,
          dashboardUrl: dashboardUrlFor("externalTool", t.id, globals)
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(leaf, SKILLS_CREATE_EXTERNAL_TOOL_CONTRACT);
  return leaf;
}
