import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";

const INITIATE_OAUTH_HELP = `
Examples:
  $ nexus external-tool initiate-oauth 11111111-1111-4111-8111-111111111111
  $ nexus external-tool initiate-oauth 11111111-1111-4111-8111-111111111111 --name "Production token"

Notes:
This directly fetches a token from the OAuth token endpoint using
client_credentials grant (machine-to-machine). No browser redirect needed.
The tool's auth must be configured with type "oauth" and grant_type "client_credentials".
  THERE IS NO INTERACTIVE FLOW HERE. If the tool's auth is a user-consent OAuth,
  this is the wrong verb and the call fails — it never opens a browser and never
  waits for a redirect.
  It answers with a credentialId, which is the handle every other verb takes.
  --name is optional and labels the credential; omitting it does not stop the
  token being fetched.`;

/**
 * `nexus external-tool initiate-oauth`
 *
 * UNBOUND ON PURPOSE: this reaches a route the v1 contract does not declare, so
 * there is no contract to bind. See the note beside the bound leaves.
 */
export function registerExternalToolInitiateOauthCommand(
  externalTool: Command,
  program: Command
): Command {
  const leaf = externalTool
    .command("initiate-oauth")
    .description("Initiate OAuth client_credentials flow for an external tool")
    .argument("<id>", "External tool ID")
    .option("--name <name>", "Credential name")
    .addHelpText("after", INITIATE_OAUTH_HELP)
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.skills.initiateClientCredentials(id, opts.name);
        printSuccess("OAuth client_credentials token obtained.", {
          credentialId: result.credentialId
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  return leaf;
}
