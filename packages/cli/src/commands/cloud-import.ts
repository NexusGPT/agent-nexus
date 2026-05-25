import { Command } from "commander";

import { createClient } from "../client";
import { handleError } from "../errors";
import { printRecord, printSuccess } from "../output";
import { mergeBodyWithFlags, resolveBody } from "../util/body";

export function registerCloudImportCommands(program: Command): void {
  const cloudImport = program
    .command("cloud-import")
    .description("Import documents from cloud providers");

  const gdrive = cloudImport.command("google-drive").description("Google Drive imports");

  gdrive
    .command("auth")
    .description("Exchange OAuth code for Google Drive tokens")
    .requiredOption("--code <code>", "OAuth authorization code")
    .option("--body <json>", "Request body as JSON")
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, { code: opts.code });
        const result = await client.cloudImports.googleDriveAuth(body as any);
        printRecord(result as unknown as Record<string, unknown>);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  gdrive
    .command("list-files")
    .description("List Google Drive files")
    .requiredOption("--access-token <token>", "Google Drive access token")
    .option("--folder-id <id>", "Folder ID to list")
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.cloudImports.listGoogleDriveFiles({
          accessToken: opts.accessToken,
          folderId: opts.folderId
        });
        printRecord(result as unknown as Record<string, unknown>);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  gdrive
    .command("import")
    .description("Import files from Google Drive")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const body = await resolveBody(opts.body);
        const result = await client.cloudImports.importGoogleDrive(body as any);
        printSuccess("Google Drive import started.", result as any);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  const sharepoint = cloudImport.command("sharepoint").description("SharePoint imports");

  sharepoint
    .command("list-sites")
    .description("List SharePoint sites")
    .requiredOption("--connection-id <id>", "SharePoint connection ID")
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.cloudImports.listSharePointSites({
          connectionId: opts.connectionId
        });
        printRecord(result as unknown as Record<string, unknown>);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  sharepoint
    .command("list-files")
    .description("List SharePoint files")
    .requiredOption("--connection-id <id>", "SharePoint connection ID")
    .requiredOption("--site-id <id>", "SharePoint site ID")
    .option("--folder-id <id>", "Folder ID")
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.cloudImports.listSharePointFiles({
          connectionId: opts.connectionId,
          siteId: opts.siteId,
          folderId: opts.folderId
        });
        printRecord(result as unknown as Record<string, unknown>);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  sharepoint
    .command("import")
    .description("Import files from SharePoint")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const body = await resolveBody(opts.body);
        const result = await client.cloudImports.importSharePoint(body as any);
        printSuccess("SharePoint import started.", result as any);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  const notion = cloudImport.command("notion").description("Notion imports");

  notion
    .command("search")
    .description("Search Notion pages and databases")
    .requiredOption("--connection-id <id>", "Notion connection ID")
    .option("--query <query>", "Search query")
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.cloudImports.searchNotion({
          connectionId: opts.connectionId,
          query: opts.query
        });
        printRecord(result as unknown as Record<string, unknown>);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  notion
    .command("import")
    .description("Import pages/databases from Notion")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const body = await resolveBody(opts.body);
        const result = await client.cloudImports.importNotion(body as any);
        printSuccess("Notion import started.", result as any);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
