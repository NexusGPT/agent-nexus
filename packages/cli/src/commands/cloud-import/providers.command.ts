import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printList } from "../../output";

/** `nexus cloud-import providers` — what each provider supports. */
export function registerCloudImportProvidersCommand(
  cloudImport: Command,
  program: Command
): Command {
  return cloudImport
    .command("providers")
    .description("List cloud providers and what each one supports")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus cloud-import providers

Notes:
  THIS DOES NOT LIST YOUR CONNECTIONS. It lists what each provider is capable
  of, whether or not an account is connected — so it never tells you which
  --connection-id to use. Those come from the app.

  FOLDERS false means "browse" has nothing to walk and you want "search"
  instead. SYNC describes the provider, not documents already imported: nothing
  imported through this API re-syncs on its own.

  THE TABLE HIDES THE FIELD THAT DECIDES WHETHER A CONNECTION SURVIVES
  UNATTENDED. --json carries a fourth capability the columns do not show:

    $ nexus cloud-import providers --json | jq -r '.data[] | "\\(.slug) \\(.supportsRefreshToken)"'

  supportsRefreshToken false means the provider issues NO refresh token, so its
  OAuth connection expires and has to be re-authorised BY HAND in the app. It is
  true for google-drive and sharepoint and FALSE FOR NOTION. Nothing warns you
  when it lapses — a scheduled Notion import simply starts failing, and it fails
  as the API-key error described in the namespace help, which points at the
  wrong credential. Check this before building anything unattended on a
  provider.`
    )
    .action(async () => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.cloudImports.listProviders();
        printList(result.providers, undefined, [
          { key: "slug", label: "PROVIDER" },
          { key: "supportsFolders", label: "FOLDERS" },
          { key: "supportsSearch", label: "SEARCH" },
          { key: "supportsSync", label: "SYNC" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
