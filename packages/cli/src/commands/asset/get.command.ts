import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { printRecord } from "../../output";
import { ASSET_GET_CONTRACT } from "../asset.contract.generated";

/** `nexus asset get` */
export function registerAssetGetCommand(asset: Command, program: Command): void {
  const get = asset
    .command("get")
    .description("Get asset details")
    .argument("<id>", "Asset ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus asset get 11111111-1111-4111-8111-111111111111
  $ nexus asset get 11111111-1111-4111-8111-111111111111 --json

Notes:
  THIS IS WHERE THE URL COMES FROM — "asset list" does not print it.
  That URL is public, unsigned and permanent: anyone holding it can fetch the
  file with no credential and it never expires. Read it as something you are
  publishing, not something you are looking up.
  The record carries id, name, url, content type, size in bytes and the creation
  time. There is no reference list, so nothing here tells you what is USING the
  asset — that matters before a delete.`
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

  bindCommand(get, ASSET_GET_CONTRACT);
}
