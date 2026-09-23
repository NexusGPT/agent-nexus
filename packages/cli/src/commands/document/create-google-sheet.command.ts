import type { CreateGoogleSheetDocumentBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../../util/body";

const CREATE_GOOGLE_SHEET_HELP = `
Examples:
  $ nexus document create-google-sheet --name "Catalog" --url "https://docs.google.com/spreadsheets/d/..."
  $ nexus document create-google-sheet --body '{"name":"Catalog","url":"https://...","metadata":{"hasHeaderRow":false}}'

Notes:
  THE SPREADSHEET MUST BE READABLE BY ANYONE WITH THE LINK. Nexus reads Google
  Sheets with a platform API key, NOT with your connected Google account, so a
  private or organization-restricted sheet fails however the account is
  connected. Share it "anyone with the link can view" first. (To import a
  private file instead, connect Drive and use "nexus cloud-import".)

  THE RESULT IS A FOLDER PLUS ONE DOCUMENT PER TAB. The folder holds no content;
  attaching it to a collection expands to the tab documents under it at attach
  time. The tabs are listed by "nexus document children <folder-id>".

  THE FOLDER IS MARKED READY IMMEDIATELY. The tabs are indexed in the
  background afterwards, so a READY folder says nothing about whether the rows
  are searchable. Poll the tab documents.

  A SNAPSHOT, NOT A LIVE LINK. Automatic re-sync is off for documents created
  through this API and cannot be turned on from here, so later edits to the
  spreadsheet are never picked up on their own. Refresh a tab with
  "nexus document reprocess <tab-id>" — passing the FOLDER id there is a 400,
  not a no-op, so loop over the tabs from "nexus document children".

  hasHeaderRow defaults to true — row 1 is read as column names, not as data.
  It is --body only, under "metadata".`;

/** `nexus document create-google-sheet` */
export function registerDocumentCreateGoogleSheetCommand(
  document: Command,
  program: Command
): Command {
  const leaf = document
    .command("create-google-sheet")
    .description("Import a Google Sheet as document(s)")
    .requiredOption("--name <name>", "Document name")
    .requiredOption("--url <url>", "Google Sheet URL")
    .option("--description <text>", "Document description")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText("after", CREATE_GOOGLE_SHEET_HELP)
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const flags: Record<string, unknown> = {
          name: opts.name,
          url: opts.url
        };
        if (opts.description !== undefined) flags.description = opts.description;
        const body = mergeBodyWithFlags(base, flags);

        const result = await client.documents.createGoogleSheet(
          asRequestBody<CreateGoogleSheetDocumentBody>(body)
        );
        printSuccess("Google Sheet imported.", {
          folderId: result.folder?.id,
          sheets: result.sheets?.length
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  return leaf;
}
