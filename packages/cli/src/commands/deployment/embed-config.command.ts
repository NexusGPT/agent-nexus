import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printRecord } from "../../output";

/** `nexus deployment embed-config` */
export function registerDeploymentEmbedConfigCommand(deployment: Command, program: Command): void {
  deployment
    .command("embed-config")
    .description("Get deployment embed configuration")
    .argument("<id>", "Deployment ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus deployment embed-config 11111111-1111-4111-8111-111111111111
  $ nexus deployment embed-config 11111111-1111-4111-8111-111111111111 --json
  $ nexus deployment embed-config 11111111-1111-4111-8111-111111111111 --json > widget.json

Notes:
  THIS IS WHAT THE WIDGET ACTUALLY RENDERS. It reads settings.embedSettings —
  the same group the dashboard writes and the same one the widget loads — and
  returns all 58 published keys: the ui* palette, the bubble* placement, the
  header, footer and landing-screen groups, the localized* variants beside
  every translatable string, and suggestedMessages.

  EMBED DEPLOYMENTS ONLY. Any other type is a 400 with code
  NOT_AN_EMBED_DEPLOYMENT, naming the type it found. Other channels keep their
  settings elsewhere — read those with "nexus deployment get <id>".

  ONE KEY OF THE 59 IS NEVER RETURNED: identityVerificationSecret. It is the
  server-side HMAC key that signs a visitor's externalUserId, so anyone holding
  it can forge a visitor identity — publishing it would hand that to every
  deployments:read caller. The contract omits it; nothing here filters it, so
  it cannot be re-exposed by accident. identityVerificationEnabled IS returned,
  because whether verification is on is not a secret. The secret survives an
  update untouched (see "embed-config-update").

  THE OUTPUT IS A VALID UPDATE BODY. The update accepts exactly these 58 keys,
  every one optional, so a read can be edited and PATCHed straight back.`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const config = await client.deployments.getEmbedConfig(id);
        printRecord(config);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
