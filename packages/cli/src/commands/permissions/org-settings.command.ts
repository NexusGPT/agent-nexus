import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printRecord } from "../../output";
import { formatVisibilityMap } from "./_shared/visibility";

const ORG_SETTINGS_HELP = `
Examples:
  $ nexus permissions org-settings
  $ nexus permissions org-settings --json

Notes:
  Assert on the effective map. vibe_app and access_card are pinned CLOSED by
  the system, so a stored override on either changes nothing.`;

/** `nexus permissions org-settings` */
export function registerPermissionsOrgSettingsCommand(
  permissions: Command,
  program: Command
): void {
  permissions
    .command("org-settings")
    .description("Read the organization's resource visibility settings")
    .addHelpText("after", ORG_SETTINGS_HELP)
    .action(async () => {
      try {
        const client = createClient(program.optsWithGlobals());
        const settings = await client.permissions.getOrgSettings();
        printRecord(settings, [
          { key: "defaultResourceVisibility", label: "Default" },
          {
            key: "effectiveVisibilityByType",
            label: "Effective",
            format: () => formatVisibilityMap(settings.effectiveVisibilityByType)
          },
          {
            key: "resourceVisibilityByType",
            label: "Stored overrides",
            format: () => formatVisibilityMap(settings.resourceVisibilityByType)
          }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
