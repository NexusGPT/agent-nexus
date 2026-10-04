import type { UpdateEmbedConfigBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { asRequestBody, resolveBody } from "../../util/body";
import { DEPLOYMENT_UPDATE_EMBED_CONFIG_CONTRACT } from "../deployment.contract.generated";

/** `nexus deployment embed-config-update` */
export function registerDeploymentEmbedConfigUpdateCommand(
  deployment: Command,
  program: Command
): void {
  const embedConfigUpdate = deployment
    .command("embed-config-update")
    .description("Update deployment embed configuration")
    .argument("<id>", "Deployment ID")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus deployment embed-config-update 11111111-1111-4111-8111-111111111111 --body '{"uiAppearance":"dark"}'
  $ nexus deployment embed-config-update 11111111-1111-4111-8111-111111111111 --body '{"uiPrimaryColor":"#0055ff","bubblePosition":"bottom-left"}'
  $ nexus deployment embed-config-update 11111111-1111-4111-8111-111111111111 --body widget.json

Notes:
  A 200 MEANS THE WIDGET CHANGED. The patch lands inside settings.embedSettings,
  which is the group the widget loads, and the response is a fresh read of what
  was stored.

  🚨 AN UNDECLARED KEY IS DROPPED, NOT REFUSED. The write parses against a
  non-strict schema, so a misspelling — "primaryColor" for "uiPrimaryColor",
  "theme" for "uiAppearance" — is stripped before the column and answers 200
  with the old value still in place. The response carries the header
  x-nexus-discarded-body-keys naming what was dropped, at most 10 names, each
  truncated to 64 chars, TOP-LEVEL ONLY — a stale key nested inside footerLinks,
  landingScreenActionButtons or a localized* map never appears in it. THE CHECK
  IS THE RESPONSE: the key you sent is in it with the value you sent, or the
  write did not happen. Run "embed-config" first for the exact spellings.

  PATCH SEMANTICS, AND THEY ARE REAL. Only the keys you name change; the rest
  of the group is re-read from storage and written back. That is also what
  preserves identityVerificationSecret, which this API never returns and
  therefore can never send back — a full-object PUT would erase it. An empty
  --body is a valid no-op.

  EMBED DEPLOYMENTS ONLY — a 400 with code NOT_AN_EMBED_DEPLOYMENT otherwise,
  on this verb and on the read alike.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        // Every field of `UpdateEmbedConfigBody` is optional — this is a PATCH —
        // so `{}` is a usable value of the right type rather than an invented
        // one. The wire delta is an empty JSON object in place of no body.
        const body = (await resolveBody(opts.body)) ?? {};
        await client.deployments.updateEmbedConfig(id, asRequestBody<UpdateEmbedConfigBody>(body));
        printSuccess("Embed config updated.", { id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // A pure `--body` PATCH: every one of these six enums is reachable, and none
  // has a flag. Naming them keeps the gate honest, and the contract block above
  // is now the ONLY place their values are written down — the Notes below this
  // command say to read them off a prior `embed-config`, which is a round trip
  // an operator should not have to make to learn a closed list.
  bindCommand(embedConfigUpdate, DEPLOYMENT_UPDATE_EMBED_CONFIG_CONTRACT, {
    "Body.bubblePosition": "--body only; embed-config-update takes no flags at all",
    "Body.bubbleBorderRadius": "--body only; embed-config-update takes no flags at all",
    "Body.bubbleSize": "--body only; embed-config-update takes no flags at all",
    "Body.uiAppearance": "--body only; embed-config-update takes no flags at all",
    "Body.uiRadius": "--body only; embed-config-update takes no flags at all",
    "Body.uiContainerRadius": "--body only; embed-config-update takes no flags at all"
  });
}
