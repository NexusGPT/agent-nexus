import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printImportResult, printItems } from "./_shared/print";
import { parseItemIds } from "./_shared/providers";

/** `nexus cloud-import sharepoint` — convenience wrappers over the same routes. */
export function registerSharepointCommands(cloudImport: Command, program: Command): void {
  const gr = cloudImport.command("sharepoint").description("SharePoint imports");

  registerSharepointListFiles(gr, program);

  registerSharepointImport(gr, program);
}

/** `nexus cloud-import sharepoint list-files` */
function registerSharepointListFiles(gr: Command, program: Command): void {
  gr.command("list-files")
    .description("List SharePoint files (use `cloud-import browse sharepoint`)")
    .requiredOption("--connection-id <id>", "SharePoint connection ID")
    .requiredOption("--site-id <id>", "SharePoint site ID")
    .option("--folder-id <id>", "Folder ID", "root")
    .option("--page-token <token>", "Page token from a previous call")
    .addHelpText(
      "after",
      `
Prefer "nexus cloud-import browse sharepoint", which this now calls.

Examples:
  $ nexus cloud-import sharepoint list-files --connection-id 22222222-2222-4222-8222-222222222222 --site-id site-1

Notes:
  --site-id is REQUIRED — a SharePoint item is only addressable within its site.
  --folder-id defaults to "root". Paginated: continue with the --page-token the
  output prints.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const page = await client.cloudImports.browse("sharepoint", {
          connectionId: opts.connectionId,
          siteId: opts.siteId,
          folderId: opts.folderId,
          pageToken: opts.pageToken
        });
        printItems(page);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}

/** `nexus cloud-import sharepoint import` */
function registerSharepointImport(gr: Command, program: Command): void {
  gr.command("import")
    .description("Import files and folders from SharePoint")
    .requiredOption("--connection-id <id>", "OAuth connection ID")
    .requiredOption("--site-id <id>", "SharePoint site ID")
    .requiredOption("--item-ids <ids>", "Comma-separated file or folder IDs", parseItemIds)
    .option("--parent-id <id>", "Destination folder in Nexus")
    .addHelpText(
      "after",
      `
Identical to "nexus cloud-import import sharepoint" — see that command's Notes
for the asynchronous behaviour and the silently skipped items.

Examples:
  $ nexus cloud-import sharepoint import --connection-id 22222222-2222-4222-8222-222222222222 --site-id site-1 --item-ids file-c

Notes:
  --site-id is REQUIRED for SharePoint on every command, because a SharePoint
  item is only addressable within its site.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.cloudImports.import("sharepoint", {
          connectionId: opts.connectionId,
          siteId: opts.siteId,
          itemIds: opts.itemIds,
          parentId: opts.parentId
        });
        printImportResult(result);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
