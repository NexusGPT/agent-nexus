import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { printList } from "../../output";
import { addPaginationOptions, getPaginationParams } from "../../util/pagination";
import { ASSET_LIST_CONTRACT } from "../asset.contract.generated";

/** `nexus asset list` */
export function registerAssetListCommand(asset: Command, program: Command): void {
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
  $ nexus asset list --json

Notes:
  THIS LISTING DOES NOT SHOW THE URL, which is the one thing an asset exists for.
  The columns are id, name, content type and size; read the URL with
  "nexus asset get <id>" or take it from --json.
  --search matches the NAME only. Two assets may share a name — the ID column is
  what every other asset verb takes.
  Size is in bytes, unformatted, so it sorts and greps predictably.`
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

  bindCommand(list, ASSET_LIST_CONTRACT);
}
