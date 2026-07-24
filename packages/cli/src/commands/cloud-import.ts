import type { CloudImportProviderSlug, CloudItemPage } from "@agent-nexus/sdk";
import { Command } from "commander";

import { createClient } from "../client";
import { handleError } from "../errors";
import { isJsonMode, printList, printRecord, printSuccess, printWarning } from "../output";
import { mergeBodyWithFlags, resolveBody } from "../util/body";

const PROVIDER_SLUGS: CloudImportProviderSlug[] = ["google-drive", "sharepoint", "notion"];

const ITEM_COLUMNS = [
  { key: "id", label: "ID" },
  { key: "name", label: "NAME" },
  { key: "isFolder", label: "FOLDER" },
  { key: "mimeType", label: "TYPE" },
  { key: "modifiedTime", label: "MODIFIED" }
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

  // ==========================================================================
  // Per-provider commands — the listings below now go through the browsing
  // endpoints; the auth and import ones still reach stubs and say so.
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
    .description("[deprecated] Import files from Google Drive")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .action(async (opts) => {
      try {
        printWarning("cloud-import google-drive import is not implemented.", STUB_WARNING);
        const client = createClient(program.optsWithGlobals());
        const body = await resolveBody(opts.body);
        const result = await client.cloudImports.importGoogleDrive(
          body as { accessToken: string; fileIds: string[] }
        );
        printSuccess("Google Drive import requested.", result as Record<string, unknown>);
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
    .description("[deprecated] Import files from SharePoint")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .action(async (opts) => {
      try {
        printWarning("cloud-import sharepoint import is not implemented.", STUB_WARNING);
        const client = createClient(program.optsWithGlobals());
        const body = await resolveBody(opts.body);
        const result = await client.cloudImports.importSharePoint(
          body as { connectionId: string; siteId: string; fileIds: string[] }
        );
        printSuccess("SharePoint import requested.", result as Record<string, unknown>);
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
    .description("[deprecated] Import pages/databases from Notion")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .action(async (opts) => {
      try {
        printWarning("cloud-import notion import is not implemented.", STUB_WARNING);
        const client = createClient(program.optsWithGlobals());
        const body = await resolveBody(opts.body);
        const result = await client.cloudImports.importNotion(
          body as { connectionId: string; pageIds?: string[] }
        );
        printSuccess("Notion import requested.", result as Record<string, unknown>);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
