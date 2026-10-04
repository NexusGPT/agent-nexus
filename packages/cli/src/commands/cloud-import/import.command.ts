import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printImportResult } from "./_shared/print";
import { assertProvider, parseItemIds, PROVIDER_SLUGS } from "./_shared/providers";

/** `nexus cloud-import import <provider>` — the provider-agnostic import. */
export function registerCloudImportImportCommand(cloudImport: Command, program: Command): Command {
  return cloudImport
    .command("import <provider>")
    .description(`Import selected items into the knowledge base (${PROVIDER_SLUGS.join(" | ")})`)
    .requiredOption("--connection-id <id>", "OAuth connection ID")
    .requiredOption(
      "--item-ids <ids>",
      "Comma-separated item IDs from browse or search",
      parseItemIds
    )
    .option("--parent-id <id>", "Destination folder in Nexus")
    .option("--site-id <id>", "SharePoint site ID (required for SharePoint)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus cloud-import import google-drive --connection-id 11111111-1111-4111-8111-111111111111 --item-ids file-a,file-b
  $ nexus cloud-import import sharepoint --connection-id 22222222-2222-4222-8222-222222222222 --site-id site-1 --item-ids file-c
  $ nexus cloud-import import notion --connection-id 33333333-3333-4333-8333-333333333333 --item-ids page-a --parent-id 44444444-4444-4444-8444-444444444444

Notes:
  IMPORT IS ASYNCHRONOUS. The response lists the documents that were CREATED,
  with their status — not their content. Poll "nexus document get <id>" until
  READY or ERROR before attaching anything to a collection.

  AN UNREADABLE ITEM IS SKIPPED WITHOUT AN ERROR. importedCount is the number
  that worked; compare it against the number of --item-ids you passed, because
  nothing else will tell you one went missing. A run where every item failed is
  the only case that reports a failure, as a 400.

  --site-id IS REQUIRED FOR SHAREPOINT and refused as SITE_ID_REQUIRED without
  it. It is ignored by Google Drive and Notion. That refusal comes from THIS
  route only — "browse" and "search" reject a missing site id further in, under
  a different code, so do not match on the code across the three commands.

  --parent-id NAMES THE DESTINATION FOLDER IN NEXUS. Omit it and everything
  lands at the root of the knowledge base, mixed in with everything else. Make
  the folder first with "nexus document create-folder".

  IMPORTING A CLOUD FOLDER CREATES A NEXUS FOLDER, and a folder cannot be
  attached to a collection — attach its children, from
  "nexus document children <id>".

  THIS IS A COPY, NOT A LINK. Later edits in Drive, SharePoint or Notion are not
  picked up on their own; re-import or reprocess to refresh.

  --item-ids come from browse or search on the SAME connection. Ids from another
  connection or another provider are not resolvable.`
    )
    .action(async (provider: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.cloudImports.import(assertProvider(provider), {
          connectionId: opts.connectionId,
          itemIds: opts.itemIds,
          parentId: opts.parentId,
          siteId: opts.siteId
        });
        printImportResult(result);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
