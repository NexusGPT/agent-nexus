import type { CloudImportProviderSlug, CloudItemPage, ImportResult } from "@agent-nexus/sdk";
import { Command } from "commander";

import { createClient } from "../client";
import { handleError } from "../errors";
import { isJsonMode, printList, printRecord, printWarning } from "../output";
import { mergeBodyWithFlags, resolveBody } from "../util/body";

const PROVIDER_SLUGS: CloudImportProviderSlug[] = ["google-drive", "sharepoint", "notion"];

const ITEM_COLUMNS = [
  { key: "id", label: "ID" },
  { key: "name", label: "NAME" },
  { key: "isFolder", label: "FOLDER" },
  { key: "mimeType", label: "TYPE" },
  { key: "modifiedTime", label: "MODIFIED" }
];

const IMPORTED_COLUMNS = [
  { key: "id", label: "ID" },
  { key: "name", label: "NAME" },
  { key: "status", label: "STATUS" }
];

/**
 * The stub endpoints answer with empty data rather than an error, so a caller
 * cannot tell "nothing there" from "not implemented". Say it out loud.
 */
const STUB_WARNING = "This endpoint is not implemented and always answers with empty data.";

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
  printList(
    result.documents as unknown as Record<string, unknown>[],
    { importedCount: result.importedCount },
    IMPORTED_COLUMNS
  );

  // printPaginationMeta only understands total/page/hasMore, so the count above
  // is dropped in table mode — and the count is the answer to "did it work".
  if (!isJsonMode()) {
    const plural = result.importedCount === 1 ? "" : "s";
    console.log(`\nImported ${result.importedCount} document${plural}.`);
  }
}

function printItems(page: CloudItemPage): void {
  printList(
    page.items as unknown as Record<string, unknown>[],
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

  // ==========================================================================
  // Provider-agnostic browsing
  // ==========================================================================

  cloudImport
    .command("providers")
    .description("List cloud providers and what each one supports")
    .action(async () => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.cloudImports.listProviders();
        printList(result.providers as unknown as Record<string, unknown>[], undefined, [
          { key: "slug", label: "PROVIDER" },
          { key: "supportsFolders", label: "FOLDERS" },
          { key: "supportsSearch", label: "SEARCH" },
          { key: "supportsSync", label: "SYNC" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  cloudImport
    .command("browse <provider>")
    .description(`List a folder's contents (${PROVIDER_SLUGS.join(" | ")})`)
    .requiredOption("--connection-id <id>", "OAuth connection ID")
    .requiredOption("--folder-id <id>", "Folder, database, or container ID")
    .option("--site-id <id>", "SharePoint site ID")
    .option("--page-token <token>", "Page token from a previous call")
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

  cloudImport
    .command("search <provider>")
    .description(`Search a provider by file name (${PROVIDER_SLUGS.join(" | ")})`)
    .requiredOption("--connection-id <id>", "OAuth connection ID")
    .requiredOption("--query <query>", "Name fragment to match")
    .option("--folder-id <id>", "Restrict the search to one folder")
    .option("--page-token <token>", "Page token from a previous call")
    .action(async (provider: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const page = await client.cloudImports.search(assertProvider(provider), {
          connectionId: opts.connectionId,
          query: opts.query,
          folderId: opts.folderId,
          pageToken: opts.pageToken
        });
        printItems(page);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  cloudImport
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
  // Per-provider commands — the listings and imports below go through the
  // provider-agnostic endpoints; the auth ones still reach stubs and say so.
  // ==========================================================================

  const gdrive = cloudImport.command("google-drive").description("Google Drive imports");

  gdrive
    .command("auth")
    .description("[deprecated] Exchange OAuth code for Google Drive tokens")
    .requiredOption("--code <code>", "OAuth authorization code")
    .option("--body <json>", "Request body as JSON")
    .action(async (opts) => {
      try {
        printWarning(
          "cloud-import google-drive auth is not implemented.",
          "It returns a credential whose tokens are empty strings.",
          "Connect Google Drive in the app, then use --connection-id with `cloud-import browse`."
        );
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, { code: opts.code });
        const result = await client.cloudImports.googleDriveAuth(body as { code: string });
        printRecord(result as Record<string, unknown>);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

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
    .command("list-sites")
    .description("[deprecated] List SharePoint sites")
    .requiredOption("--connection-id <id>", "SharePoint connection ID")
    .action(async (opts) => {
      try {
        printWarning("cloud-import sharepoint list-sites is not implemented.", STUB_WARNING);
        const client = createClient(program.optsWithGlobals());
        const result = await client.cloudImports.listSharePointSites({
          connectionId: opts.connectionId
        });
        printRecord(result as Record<string, unknown>);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  sharepoint
    .command("list-files")
    .description("List SharePoint files (use `cloud-import browse sharepoint`)")
    .requiredOption("--connection-id <id>", "SharePoint connection ID")
    .requiredOption("--site-id <id>", "SharePoint site ID")
    .option("--folder-id <id>", "Folder ID", "root")
    .option("--page-token <token>", "Page token from a previous call")
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
