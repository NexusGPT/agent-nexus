import type { UpdateResourceTypeVisibilityBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand, enumOption } from "../../contract-binding";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../../util/body";
import {
  PERMISSIONS_UPDATE_RESOURCE_TYPE_VISIBILITY__BODY_RESOURCE_TYPE,
  PERMISSIONS_UPDATE_RESOURCE_TYPE_VISIBILITY__BODY_VISIBILITY,
  PERMISSIONS_UPDATE_RESOURCE_TYPE_VISIBILITY_CONTRACT
} from "../permissions.contract.generated";
import { formatVisibilityMap, resolveVisibility } from "./_shared/visibility";

const SET_VISIBILITY_HELP = `
Examples:
  $ nexus permissions set-visibility --resource-type agent --visibility closed
  $ nexus permissions set-visibility --resource-type agent --visibility none

Notes:
  "none" clears the override so the type falls back to the org default.
  vibe_app and access_card are pinned by the system and are refused here.`;

/** `nexus permissions set-visibility` */
export function registerPermissionsSetVisibilityCommand(
  permissions: Command,
  program: Command
): void {
  const setVisibility = permissions
    .command("set-visibility")
    .description("Set or clear the org's visibility override for one resource type")
    // The list this offers is SHORTER than `permissions grant`'s, and that is
    // the contract's own doing rather than a narrowing declared here:
    // access_card and vibe_app are pinned by the system, and the visibility
    // schema already leaves them out.
    .addOption(
      enumOption(
        "--resource-type <type>",
        "Resource type — access_card and vibe_app are pinned by the system and are not offered",
        PERMISSIONS_UPDATE_RESOURCE_TYPE_VISIBILITY__BODY_RESOURCE_TYPE
      ).makeOptionMandatory()
    )
    .addOption(
      enumOption(
        "--visibility <value>",
        "Visibility to set",
        PERMISSIONS_UPDATE_RESOURCE_TYPE_VISIBILITY__BODY_VISIBILITY,
        {
          alsoAccepts: ["none"],
          because:
            "'none' is this CLI's own token for clearing the override; the wire value is null, " +
            "and omitting the field is refused, so 'clear it' has to be sayable"
        }
      ).makeOptionMandatory()
    )
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText("after", SET_VISIBILITY_HELP)
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, {
          resourceType: opts.resourceType,
          visibility: resolveVisibility(String(opts.visibility))
        });
        const settings = await client.permissions.updateResourceTypeVisibility(
          asRequestBody<UpdateResourceTypeVisibilityBody>(body)
        );
        printSuccess("Visibility updated.", {
          effective: formatVisibilityMap(settings.effectiveVisibilityByType)
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists — see `bindCommand`.
  bindCommand(setVisibility, PERMISSIONS_UPDATE_RESOURCE_TYPE_VISIBILITY_CONTRACT);
}
