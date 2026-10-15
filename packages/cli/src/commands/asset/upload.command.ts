import path from "node:path";

import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { readUploadBlob } from "../../util/upload-file";
import { ASSET_UPLOAD_CONTRACT } from "../asset.contract.generated";

/** `nexus asset upload` */
export function registerAssetUploadCommand(asset: Command, program: Command): void {
  const upload = asset
    .command("upload")
    .description("Upload a file as a public asset (image / svg / font / css)")
    .argument("<file-path>", "Path to the file")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus asset upload ./logo.svg
  $ nexus asset upload ./brand.css --json

Notes:
  THE EXTENSION DECIDES WHETHER THE FILE IS EVEN CONSIDERED, and the accepted
  set is images, SVG, CSS and webfonts. A rejected upload names the full list in
  its error, so read the refusal rather than guessing — and note that a file
  with NO extension is refused before anything else is looked at.

  AN SVG IS REWRITTEN ON THE WAY IN, SO WHAT SERVES IS NOT WHAT YOU SENT.
  Scripts, event handlers and any url(...) pointing outside the document are
  stripped, because the result is served from a public URL. An SVG that draws
  correctly locally can therefore lose animation, embedded HTML or remote
  references once hosted — fetch the URL and look at it before shipping it. An
  SVG that still carries active content after that pass is refused outright
  rather than stored.

  THERE IS NO VERSIONING AND NO OVERWRITE. Uploading the same filename again
  creates a SECOND asset with a NEW URL; it does not replace the first. To
  change what an existing URL serves you cannot — repoint whatever references
  it, then delete the old asset.

  THE ID IS NOT THE ID IN THE URL. The asset id this returns and the uuid in the
  URL path are different values and neither derives from the other, so a URL
  found in a template cannot be traced back to a row. Match on name with
  "nexus asset list --search".`
    )
    .action(async (filePath: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const blob = readUploadBlob(filePath);
        const fileName = path.basename(path.resolve(filePath));

        const result = await client.assets.upload(blob, fileName);
        printSuccess("Asset uploaded.", {
          id: result.id,
          name: result.name,
          url: result.url
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  bindCommand(upload, ASSET_UPLOAD_CONTRACT);
}
