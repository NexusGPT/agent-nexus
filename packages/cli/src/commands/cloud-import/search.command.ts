import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printItems } from "./_shared/print";
import { assertProvider, PROVIDER_SLUGS } from "./_shared/providers";

/** `nexus cloud-import search <provider>` — match on file NAMES only. */
export function registerCloudImportSearchCommand(cloudImport: Command, program: Command): Command {
  return cloudImport
    .command("search <provider>")
    .description(`Search a provider by file name (${PROVIDER_SLUGS.join(" | ")})`)
    .requiredOption("--connection-id <id>", "OAuth connection ID")
    .requiredOption("--query <query>", "Name fragment to match")
    .option("--folder-id <id>", "Restrict the search to one folder")
    .option("--site-id <id>", "SharePoint site ID (required for sharepoint)")
    .option("--page-token <token>", "Page token from a previous call")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus cloud-import search google-drive --connection-id 11111111-1111-4111-8111-111111111111 --query "invoice"
  $ nexus cloud-import search notion --connection-id 33333333-3333-4333-8333-333333333333 --query "roadmap"
  $ nexus cloud-import search sharepoint --connection-id 22222222-2222-4222-8222-222222222222 --site-id site-1 --query "T1-2026"

Notes:
  MATCHES FILE NAMES ONLY, not file contents. A document whose text mentions the
  word but whose name does not will not appear — on any provider.

  --query IS TRIMMED, so " T1 " and "T1" are the same search everywhere. A blank
  --query is refused with a 400 rather than matching every file, because an empty
  fragment is a substring of every name.

  ON SHAREPOINT that costs extra round trips: SharePoint's own search matches
  file bodies as well as names, so Nexus discards the content-only hits before
  answering you. A page can therefore come back SHORT while still printing a
  --page-token; that means "more to look at", not "that is all of them".

  --site-id IS REQUIRED FOR SHAREPOINT and ignored by the other providers.
  SharePoint addresses items within a site, so a search without one is a 400
  naming the field rather than an empty result.

  SHAREPOINT SEARCHES THE WHOLE DRIVE, recursively, unless --folder-id narrows
  it — it is not limited to one folder's immediate children.

  Paginated like browse: continue with the --page-token the output prints.`
    )
    .action(async (provider: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const page = await client.cloudImports.search(assertProvider(provider), {
          connectionId: opts.connectionId,
          query: opts.query,
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
