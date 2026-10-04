import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printItems } from "./_shared/print";
import { assertProvider, PROVIDER_SLUGS } from "./_shared/providers";

/** `nexus cloud-import browse <provider>` — one folder level at a time. */
export function registerCloudImportBrowseCommand(cloudImport: Command, program: Command): Command {
  return cloudImport
    .command("browse <provider>")
    .description(`List a folder's contents (${PROVIDER_SLUGS.join(" | ")})`)
    .requiredOption("--connection-id <id>", "OAuth connection ID")
    .requiredOption("--folder-id <id>", "Folder, database, or container ID")
    .option("--site-id <id>", "SharePoint site ID")
    .option("--page-token <token>", "Page token from a previous call")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus cloud-import browse google-drive --connection-id 11111111-1111-4111-8111-111111111111 --folder-id root
  $ nexus cloud-import browse sharepoint --connection-id 22222222-2222-4222-8222-222222222222 --site-id site-1 --folder-id root
  $ nexus cloud-import browse notion --connection-id 33333333-3333-4333-8333-333333333333 --folder-id db-123

Notes:
  THIS IS WHERE ITEM IDS COME FROM. They are the provider's ids, not Nexus ones,
  and "cloud-import import" takes only ids produced here or by search.

  --folder-id IS REQUIRED — "root" is the top of the drive. It is not optional
  and there is no default.

  ONE LEVEL AT A TIME. A row with FOLDER true is a container; browse it by
  passing its id as the next --folder-id.

  A PAGE IS NOT THE WHOLE FOLDER. When the output ends with a --page-token line,
  more items exist; pass that token back to continue. In --json the same thing
  appears as nextPageToken, and a listing that ignores it looks complete when it
  is not.

  Notion has no folders in the Drive sense — use
  "nexus cloud-import search notion" instead.`
    )
    .action(async (provider: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const page = await client.cloudImports.browse(assertProvider(provider), {
          connectionId: opts.connectionId,
          folderId: opts.folderId,
          siteId: opts.siteId,
          pageToken: opts.pageToken
        });
        printItems(page);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
