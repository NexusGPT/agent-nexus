import type { ExternalToolAuth } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { asRequestBody, resolveRequiredBody } from "../../util/body";

const UPDATE_AUTH_HELP = `
Examples:
  $ nexus external-tool update-auth 11111111-1111-4111-8111-111111111111 --body '{"type":"oauth","grant_type":"client_credentials","client_id":"...","client_secret":"...","client_url":"...","audience":"..."}'
  $ nexus external-tool update-auth 11111111-1111-4111-8111-111111111111 --body auth-config.json

Notes:
  🚨 A BODY OF {"type":"keys"} SUCCEEDS WITH NO KEY MATERIAL AND LEAVES THE TOOL
  UNUSABLE. Nothing requires the credential fields for that type, so the call
  answers success, the tool's old auth is gone, and every operation fails
  afterwards. There is no warning and no rollback. Send the credentials in the
  same body, then prove it with "nexus external-tool test-auth <id>" before you
  trust the tool again.
  THE FIELDS DEPEND ON "type", AND ONLY THE oauth SHAPE IS SHOWN ABOVE. The
  other types want different keys, and the refusal for a wrong shape names
  exactly which fields it wanted — so the cheapest way to learn a shape is to
  send {"type":"<the type>"} and read the rejection. Do that on a tool you can
  afford to break, because a shape that HAPPENS to validate is applied.
  THIS REPLACES THE AUTH WHOLESALE. It is not a patch: what you send is what the
  tool has afterwards.`;

/**
 * `nexus external-tool update-auth`
 *
 * UNBOUND ON PURPOSE: this reaches a route the v1 contract does not declare.
 */
export function registerExternalToolUpdateAuthCommand(
  externalTool: Command,
  program: Command
): Command {
  const leaf = externalTool
    .command("update-auth")
    .description("Update auth configuration on an existing external tool")
    .argument("<id>", "External tool ID")
    // Required, not optional: there is no meaningful "update the auth to
    // nothing". Omitting it used to send `auth: undefined`, which serialised
    // away to an empty patch — a request that looked like a no-op and was not
    // one anybody asked for. Commander refuses before the HTTP call instead.
    .requiredOption("--body <json>", "Auth body as JSON, .json file, or '-' for stdin (required)")
    .addHelpText("after", UPDATE_AUTH_HELP)
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const auth = await resolveRequiredBody(opts.body);
        await client.skills.updateExternalToolAuth(id, asRequestBody<ExternalToolAuth>(auth));
        printSuccess("Auth configuration updated.", { id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  return leaf;
}
