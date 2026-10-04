import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError, refuse } from "../../errors";
import { printImportResult, printItems } from "./_shared/print";
import { parseItemIds } from "./_shared/providers";

/** `nexus cloud-import google-drive` — convenience wrappers over the same routes. */
export function registerGoogleDriveCommands(cloudImport: Command, program: Command): void {
  const gr = cloudImport.command("google-drive").description("Google Drive imports");

  registerGoogleDriveListFiles(gr, program);

  registerGoogleDriveImport(gr, program);
}

/** `nexus cloud-import google-drive list-files` */
function registerGoogleDriveListFiles(gr: Command, program: Command): void {
  gr.command("list-files")
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
  $ nexus cloud-import google-drive list-files --connection-id 11111111-1111-4111-8111-111111111111
  $ nexus cloud-import google-drive list-files --connection-id 11111111-1111-4111-8111-111111111111 --folder-id folder-x

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
          // `printWarning` writes to stderr by design — right for a warning,
          // wrong for a REFUSAL, which is what this is: it exits 1. Paired with
          // the exit it left stdout empty, exactly like the --connection-id arm
          // below before it moved to `refuse`. The two arms sit in one action
          // and only one was fixed.
          process.exitCode = refuse(
            "--access-token is no longer accepted.",
            "The endpoint it addressed always answered with no files, and it put a credential in the URL. Connect Google Drive in the app and pass --connection-id instead."
          );
          return;
        }

        if (!opts.connectionId) {
          // `printWarning` writes to stderr by design, which is right for a
          // warning and wrong for a REFUSAL: it left stdout empty at exit 1.
          process.exitCode = refuse(
            "--connection-id is required.",
            "Find it in the app under the connected Google Drive account."
          );
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
}

/** `nexus cloud-import google-drive import` */
function registerGoogleDriveImport(gr: Command, program: Command): void {
  gr.command("import")
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
  $ nexus cloud-import google-drive import --connection-id 11111111-1111-4111-8111-111111111111 --item-ids file-a,file-b

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
}
