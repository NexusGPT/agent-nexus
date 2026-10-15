import { Command } from "commander";

import { registerAssetDeleteCommand } from "./asset/delete.command";
import { registerAssetGetCommand } from "./asset/get.command";
import { registerAssetListCommand } from "./asset/list.command";
import { registerAssetUploadCommand } from "./asset/upload.command";

export function registerAssetCommands(program: Command): void {
  const asset = program
    .command("asset")
    .description("Host public files/media and get stable, permanent public URLs");

  asset.addHelpText(
    "after",
    `
An asset is a file you want a BROWSER to fetch by URL — a logo for the embed
widget, an image inside an HTML message template, a stylesheet, a webfont. It is
not knowledge: nothing here is indexed and no agent can retrieve it. Content an
agent must READ goes through "nexus document upload" instead.

  • THE URL IS PUBLIC, UNSIGNED AND PERMANENT. Anyone holding it can fetch the
    file with no credential, and it never expires — which is the whole point,
    and the reason never to upload anything private. This is the opposite of
    "document download", whose URL is signed and expires in an hour.
  • DELETING AN ASSET USUALLY BREAKS EVERY PAGE USING IT, IMMEDIATELY, and
    nothing tells you what referenced it. Search your templates and widget
    settings before deleting. "Usually" is not hedging: the delete is two
    operations and the second one may fail, leaving the URL serving. "nexus
    asset delete" reports which happened — read its objectRemoved.
  • THE FILE'S BYTES ARE CHECKED AGAINST ITS EXTENSION. Renaming something to
    .png does not get it in: the extension picks the expected format and the
    leading bytes must agree, so a mismatch is refused as a possible spoofed
    type. That refusal is about the CONTENT, not the name — do not fix it by
    renaming again.`
  );

  registerAssetListCommand(asset, program);
  registerAssetGetCommand(asset, program);
  registerAssetUploadCommand(asset, program);
  registerAssetDeleteCommand(asset, program);
}
