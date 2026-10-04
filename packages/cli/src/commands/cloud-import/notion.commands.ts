import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printImportResult, printItems } from "./_shared/print";
import { parseItemIds } from "./_shared/providers";

/** `nexus cloud-import notion` — convenience wrappers over the same routes. */
export function registerNotionCommands(cloudImport: Command, program: Command): void {
  const gr = cloudImport.command("notion").description("Notion imports");

  registerNotionSearch(gr, program);

  registerNotionImport(gr, program);
}

/** `nexus cloud-import notion search` */
function registerNotionSearch(gr: Command, program: Command): void {
  gr.command("search")
    .description("Search Notion pages and databases (use `cloud-import search notion`)")
    .requiredOption("--connection-id <id>", "Notion connection ID")
    .requiredOption("--query <query>", "Name fragment to match")
    .option("--page-token <token>", "Page token from a previous call")
    .addHelpText(
      "after",
      `
Prefer "nexus cloud-import search notion", which this now calls.

Examples:
  $ nexus cloud-import notion search --connection-id 33333333-3333-4333-8333-333333333333 --query "roadmap"

Notes:
  SEARCH IS HOW YOU FIND NOTION ITEMS — there is no folder tree to browse.
  Matches page and database TITLES, not their contents, and only reaches what
  the connection was granted in Notion.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const page = await client.cloudImports.search("notion", {
          connectionId: opts.connectionId,
          query: opts.query,
          pageToken: opts.pageToken
        });
        printItems(page);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}

/** `nexus cloud-import notion import` */
function registerNotionImport(gr: Command, program: Command): void {
  gr.command("import")
    .description("Import pages and databases from Notion")
    .requiredOption("--connection-id <id>", "OAuth connection ID")
    // Page and database ids look identical, so both go here and the server
    // resolves each one's kind — the caller never has to label them.
    .requiredOption("--item-ids <ids>", "Comma-separated page or database IDs", parseItemIds)
    .option("--parent-id <id>", "Destination folder in Nexus")
    .addHelpText(
      "after",
      `
Identical to "nexus cloud-import import notion" — see that command's Notes for
the asynchronous behaviour and the silently skipped items.

Examples:
  $ nexus cloud-import notion import --connection-id 33333333-3333-4333-8333-333333333333 --item-ids page-a,db-b

Notes:
  PAGE IDS AND DATABASE IDS BOTH GO IN --item-ids. They are indistinguishable by
  shape and the server resolves each one's kind, so you never have to label them.

  A Notion page reaches Nexus only if the CONNECTION has been granted access to
  it in Notion. A page outside that grant is not findable by search and cannot
  be imported.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.cloudImports.import("notion", {
          connectionId: opts.connectionId,
          itemIds: opts.itemIds,
          parentId: opts.parentId
        });
        printImportResult(result);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
