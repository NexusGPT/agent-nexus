import type {
  CloudImportProviderSlug,
  CloudItem,
  CloudItemPage,
  ImportedDocument,
  ImportResult
} from "@agent-nexus/sdk";
import { Command } from "commander";

import { createClient } from "../client";
import { bindCommand } from "../contract-binding";
import { handleError } from "../errors";
import { type Column, isJsonMode, printList, printWarning } from "../output";
import {
  CLOUD_IMPORT_BROWSE_CONTRACT,
  CLOUD_IMPORT_ITEMS_CONTRACT,
  CLOUD_IMPORT_LIST_PROVIDERS_CONTRACT,
  CLOUD_IMPORT_SEARCH_CONTRACT
} from "./cloud-import.contract.generated";

const PROVIDER_SLUGS: CloudImportProviderSlug[] = ["google-drive", "sharepoint", "notion"];

// Annotated, not inferred: a bare literal widens `key` to `string` and the
// column keys stop being checked against the row.
const ITEM_COLUMNS: Column<CloudItem>[] = [
  { key: "id", label: "ID" },
  { key: "name", label: "NAME" },
  { key: "isFolder", label: "FOLDER" },
  { key: "mimeType", label: "TYPE" },
  { key: "modifiedTime", label: "MODIFIED" }
];

const IMPORTED_COLUMNS: Column<ImportedDocument>[] = [
  { key: "id", label: "ID" },
  { key: "name", label: "NAME" },
  { key: "status", label: "STATUS" }
];

function assertProvider(provider: string): CloudImportProviderSlug {
  if (!PROVIDER_SLUGS.includes(provider as CloudImportProviderSlug)) {
    throw new Error(
      `Unknown provider "${provider}". Expected one of: ${PROVIDER_SLUGS.join(", ")}`
    );
  }

  return provider as CloudImportProviderSlug;
}

/**
 * Splits the id list once, here, so every import command rejects an empty list
 * the same way instead of sending one and having the API answer for it.
 */
function parseItemIds(value: string): string[] {
  const ids = value
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);

  if (ids.length === 0) {
    throw new Error("--item-ids needs at least one ID");
  }

  return ids;
}

function printImportResult(result: ImportResult): void {
  printList(result.documents, { importedCount: result.importedCount }, IMPORTED_COLUMNS);

  // printPaginationMeta only understands total/page/hasMore, so the count above
  // is dropped in table mode — and the count is the answer to "did it work".
  if (!isJsonMode()) {
    const plural = result.importedCount === 1 ? "" : "s";
    console.log(`\nImported ${result.importedCount} document${plural}.`);
  }
}

function printItems(page: CloudItemPage): void {
  printList(
    page.items,
    page.nextPageToken === undefined ? undefined : { nextPageToken: page.nextPageToken },
    ITEM_COLUMNS
  );

  // printPaginationMeta only understands total/page/hasMore, so in table mode
  // the token is dropped and the listing looks complete when it is not. Print
  // the flag that continues it, not just the fact that more exists.
  if (!isJsonMode() && page.nextPageToken !== undefined) {
    console.log(`\nMore results — continue with --page-token ${page.nextPageToken}`);
  }
}

export function registerCloudImportCommands(program: Command): void {
  const cloudImport = program
    .command("cloud-import")
    .description("Browse and import documents from cloud providers");

  cloudImport.addHelpText(
    "after",
    `
Every command here needs a --connection-id, and THERE IS NO COMMAND THAT MAKES
ONE. Connecting a Google, SharePoint or Notion account is an OAuth flow that
happens in the app; the id it produces is what you paste here.

THAT ID IS A UUID, AND IT IS CHECKED BEFORE ANYTHING ELSE IN YOUR CALL. The
"conn-1" style ids in the examples below are placeholders, not a shape the API
takes: a value that is not a UUID is refused on the connectionId field alone, so
every OTHER mistake in the same command — a missing --site-id, a bad item id —
stays hidden until you put a real id in. Test a new call with a real connection.

A CONNECTION THAT DOES NOT RESOLVE IS REPORTED AS AN API-KEY FAILURE, AND THE
PRINTED HINT IS WRONG. The message names your Nexus credentials and tells you to
run "nexus auth login". Re-authenticating cannot fix it — the rejected thing is
the PROVIDER connection. Reconnect the account in the app instead.

SHAREPOINT ALSO NEEDS A --site-id, AND NO COMMAND HERE REPORTS ONE. Five
commands take it and none produces it: the sub-command that used to list sites
is gone. Read the site id in the app, under the connected SharePoint account,
the same way you read the connection id.

The shape of a working import is always the same:
  1. "cloud-import browse <provider> --connection-id ... --folder-id root"
     (or "search") to get item ids — you cannot guess them.
  2. "cloud-import import <provider> --connection-id ... --item-ids id1,id2"
  3. "nexus document get <id>" on each returned document, until READY.

TWO THINGS THE IMPORT WILL NOT TELL YOU:
  • IT IMPORTS ROWS, NOT CONTENT. A 2xx means the documents were created; their
    text is fetched and indexed afterwards. Attaching them to a collection
    before they read READY attaches documents that retrieve nothing.
  • AN ITEM THAT FAILS IS SKIPPED IN SILENCE. Unreadable items are dropped and
    the rest proceed, so importedCount can be lower than the number of ids you
    passed with no error anywhere. Compare the two. Only a run where EVERY item
    failed is reported, as a 400.

The per-provider sub-commands (google-drive, sharepoint, notion) call the same
endpoints as the provider-agnostic ones and behave identically.`
  );

  // ==========================================================================
  // Provider-agnostic browsing
  // ==========================================================================

  const providers = cloudImport
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
  imported through this API re-syncs on its own.`
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

  const browse = cloudImport
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
  $ nexus cloud-import browse google-drive --connection-id conn-1 --folder-id root
  $ nexus cloud-import browse sharepoint --connection-id conn-2 --site-id site-1 --folder-id root
  $ nexus cloud-import browse notion --connection-id conn-3 --folder-id db-123

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

  const search = cloudImport
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
  $ nexus cloud-import search google-drive --connection-id conn-1 --query "invoice"
  $ nexus cloud-import search notion --connection-id conn-3 --query "roadmap"
  $ nexus cloud-import search sharepoint --connection-id conn-2 --site-id site-1 --query "T1-2026"

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

  const importItems = cloudImport
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
  $ nexus cloud-import import google-drive --connection-id conn-1 --item-ids file-a,file-b
  $ nexus cloud-import import sharepoint --connection-id conn-2 --site-id site-1 --item-ids file-c
  $ nexus cloud-import import notion --connection-id conn-3 --item-ids page-a --parent-id folder-9

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

  // ==========================================================================
  // Per-provider commands — every one of these goes through the
  // provider-agnostic endpoints. There is no OAuth command: connecting an
  // account happens in the app, which is what produces a connection id.
  // ==========================================================================

  const gdrive = cloudImport.command("google-drive").description("Google Drive imports");

  gdrive
    .command("list-files")
    .description("List Google Drive files (use `cloud-import browse google-drive`)")
    // Not a requiredOption: commander enforces those before the action runs, so
    // a script still passing only --access-token would get its generic
    // "required option not specified" and never the explanation below — which
    // is the whole upgrade path this is here to cover.
    .option("--connection-id <id>", "OAuth connection ID")
    .option("--folder-id <id>", "Folder ID to list", "root")
    .option("--page-token <token>", "Page token from a previous call")
    .option("--access-token <token>", "Removed — pass --connection-id instead")
    .addHelpText(
      "after",
      `
Prefer "nexus cloud-import browse google-drive", which this now calls.

Examples:
  $ nexus cloud-import google-drive list-files --connection-id conn-1
  $ nexus cloud-import google-drive list-files --connection-id conn-1 --folder-id folder-x

Notes:
  --access-token IS NO LONGER ACCEPTED. The endpoint it addressed always
  answered with no files and put a credential in the URL. Connect Drive in the
  app and pass --connection-id.

  --folder-id defaults to "root". Paginated: continue with the --page-token the
  output prints.`
    )
    .action(async (opts) => {
      try {
        if (opts.accessToken) {
          printWarning(
            "--access-token is no longer accepted.",
            "The endpoint it addressed always answered with no files, and it put a credential in the URL.",
            "Connect Google Drive in the app and pass --connection-id instead."
          );
          process.exitCode = 1;
          return;
        }

        if (!opts.connectionId) {
          printWarning(
            "--connection-id is required.",
            "Find it in the app under the connected Google Drive account."
          );
          process.exitCode = 1;
          return;
        }

        const client = createClient(program.optsWithGlobals());
        // Routed through the browsing endpoint: the Google Drive listing this
        // command used to call always answers with no files, and takes an
        // access token in the query string.
        const page = await client.cloudImports.browse("google-drive", {
          connectionId: opts.connectionId,
          folderId: opts.folderId,
          pageToken: opts.pageToken
        });
        printItems(page);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  gdrive
    .command("import")
    .description("Import files and folders from Google Drive")
    .requiredOption("--connection-id <id>", "OAuth connection ID")
    .requiredOption("--item-ids <ids>", "Comma-separated file or folder IDs", parseItemIds)
    .option("--parent-id <id>", "Destination folder in Nexus")
    .addHelpText(
      "after",
      `
Identical to "nexus cloud-import import google-drive" — see that command's
Notes for the full behaviour.

Examples:
  $ nexus cloud-import google-drive import --connection-id conn-1 --item-ids file-a,file-b

Notes:
  IMPORT IS ASYNCHRONOUS, and an unreadable item is SKIPPED WITHOUT AN ERROR.
  Compare importedCount against the number of --item-ids you passed, then poll
  "nexus document get <id>" until READY.

  A Drive FOLDER id is accepted and becomes a Nexus folder; attach its children
  to a collection, not the folder itself.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.cloudImports.import("google-drive", {
          connectionId: opts.connectionId,
          itemIds: opts.itemIds,
          parentId: opts.parentId
        });
        printImportResult(result);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  const sharepoint = cloudImport.command("sharepoint").description("SharePoint imports");

  sharepoint
    .command("list-files")
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
  $ nexus cloud-import sharepoint list-files --connection-id conn-2 --site-id site-1

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

  sharepoint
    .command("import")
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
  $ nexus cloud-import sharepoint import --connection-id conn-2 --site-id site-1 --item-ids file-c

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

  const notion = cloudImport.command("notion").description("Notion imports");

  notion
    .command("search")
    .description("Search Notion pages and databases (use `cloud-import search notion`)")
    .requiredOption("--connection-id <id>", "Notion connection ID")
    .requiredOption("--query <query>", "Name fragment to match")
    .option("--page-token <token>", "Page token from a previous call")
    .addHelpText(
      "after",
      `
Prefer "nexus cloud-import search notion", which this now calls.

Examples:
  $ nexus cloud-import notion search --connection-id conn-3 --query "roadmap"

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

  notion
    .command("import")
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
  $ nexus cloud-import notion import --connection-id conn-3 --item-ids page-a,db-b

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

  // Bound LAST, after every option exists — see `bindCommand`. The per-provider
  // groups are convenience wrappers over the same four routes.
  bindCommand(providers, CLOUD_IMPORT_LIST_PROVIDERS_CONTRACT);
  bindCommand(browse, CLOUD_IMPORT_BROWSE_CONTRACT);
  bindCommand(search, CLOUD_IMPORT_SEARCH_CONTRACT);
  bindCommand(importItems, CLOUD_IMPORT_ITEMS_CONTRACT);
}
