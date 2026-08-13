import fs from "node:fs";
import path from "node:path";

import { Command } from "commander";

import { createClient } from "../client";
import { bindCommand } from "../contract-binding";
import { handleError } from "../errors";
import { printList, printRecord, printSuccess } from "../output";
import { addPaginationOptions, getPaginationParams } from "../util/pagination";
import {
  ASSET_DELETE_CONTRACT,
  ASSET_GET_CONTRACT,
  ASSET_LIST_CONTRACT,
  ASSET_UPLOAD_CONTRACT
} from "./asset.contract.generated";

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
  • DELETING AN ASSET BREAKS EVERY PAGE USING IT, IMMEDIATELY. The URL stops
    serving within seconds, and nothing tells you what referenced it. Search
    your templates and widget settings before deleting.
  • THE FILE'S BYTES ARE CHECKED AGAINST ITS EXTENSION. Renaming something to
    .png does not get it in: the extension picks the expected format and the
    leading bytes must agree, so a mismatch is refused as a possible spoofed
    type. That refusal is about the CONTENT, not the name — do not fix it by
    renaming again.`
  );

  // ── list ──────────────────────────────────────────────────────────────
  const list = addPaginationOptions(
    asset
      .command("list")
      .description("List assets")
      .option("--search <query>", "Search by name")
      .addHelpText(
        "after",
        `
Examples:
  $ nexus asset list
  $ nexus asset list --search "logo" --limit 10
  $ nexus asset list --json`
      )
  ).action(async (opts) => {
    try {
      const client = createClient(program.optsWithGlobals());
      const { data, meta } = await client.assets.list({
        ...getPaginationParams(opts),
        search: opts.search
      });
      printList(data, meta, [
        { key: "id", label: "ID", width: 36 },
        { key: "name", label: "NAME", width: 28 },
        { key: "contentType", label: "TYPE", width: 18 },
        { key: "sizeBytes", label: "SIZE", width: 10 }
      ]);
    } catch (err) {
      process.exitCode = handleError(err);
    }
  });

  // ── get ───────────────────────────────────────────────────────────────
  const get = asset
    .command("get")
    .description("Get asset details")
    .argument("<id>", "Asset ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus asset get asset-123
  $ nexus asset get asset-123 --json`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.assets.get(id);
        printRecord(result, [
          { key: "id", label: "ID" },
          { key: "name", label: "Name" },
          { key: "url", label: "URL" },
          { key: "contentType", label: "Content Type" },
          { key: "sizeBytes", label: "Size (bytes)" },
          { key: "createdAt", label: "Created" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── upload ────────────────────────────────────────────────────────────
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
        const absPath = path.resolve(filePath);

        if (!fs.existsSync(absPath)) {
          console.error(`Error: File not found: ${absPath}`);
          process.exitCode = 1;
          return;
        }

        const buffer = fs.readFileSync(absPath);
        const blob = new Blob([buffer]);
        const fileName = path.basename(absPath);

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

  // ── delete ────────────────────────────────────────────────────────────
  const remove = asset
    .command("delete")
    .description("Delete an asset")
    .argument("<id>", "Asset ID")
    .option("--yes", "Skip confirmation")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus asset delete asset-123
  $ nexus asset delete asset-123 --yes

Notes:
  THE PUBLIC URL STOPS SERVING WITHIN SECONDS, AND THERE IS NO UNDO. Anything
  already pointing at it — an embed widget's styling, an HTML message template,
  an agent's branding — breaks at that moment, with no error on this side and
  nothing listing what referenced the asset. Confirm the URL is unused first.

  THE CONFIRMATION PROMPT ONLY APPEARS ON A TERMINAL. Piped, redirected or run
  in CI there is no prompt and no --yes is needed: the delete just happens. So
  --yes is not the guard that protects a script — reading this note is.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        if (!opts.yes && process.stdout.isTTY) {
          const readline = await import("node:readline/promises");
          const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
          const answer = await rl.question(`Delete asset ${id}? [y/N] `);
          rl.close();
          if (answer.toLowerCase() !== "y") {
            console.log("Aborted.");
            return;
          }
        }

        await client.assets.delete(id);
        printSuccess("Asset deleted.", { id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists — see `bindCommand`.
  bindCommand(list, ASSET_LIST_CONTRACT);
  bindCommand(get, ASSET_GET_CONTRACT);
  bindCommand(upload, ASSET_UPLOAD_CONTRACT);
  bindCommand(remove, ASSET_DELETE_CONTRACT);
}
