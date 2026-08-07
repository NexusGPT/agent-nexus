import fs from "node:fs";
import path from "node:path";

import { Command } from "commander";

import { createClient } from "../client";
import { handleError } from "../errors";
import { printList, printRecord, printSuccess } from "../output";
import { addPaginationOptions, getPaginationParams } from "../util/pagination";

export function registerAssetCommands(program: Command): void {
  const asset = program
    .command("asset")
    .description("Host public files/media and get stable, permanent public URLs");

  // ── list ──────────────────────────────────────────────────────────────
  addPaginationOptions(
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
  asset
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
  asset
    .command("upload")
    .description("Upload a file as a public asset (image / svg / font / css)")
    .argument("<file-path>", "Path to the file")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus asset upload ./logo.svg
  $ nexus asset upload ./brand.css --json`
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
  asset
    .command("delete")
    .description("Delete an asset")
    .argument("<id>", "Asset ID")
    .option("--yes", "Skip confirmation")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus asset delete asset-123
  $ nexus asset delete asset-123 --yes`
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
}
