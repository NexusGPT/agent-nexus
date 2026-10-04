import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { printPaginationMeta, printTable } from "../../output";
import { SKILLS_LIST_COLLECTIONS_CONTRACT } from "../collection.contract.generated";

const LIST_HELP = `
Examples:
  $ nexus collection list
  $ nexus collection list --search "product" --limit 10
  $ nexus collection list --limit 20 --offset 20
  $ nexus collection list --json

Notes:
  DOCS IS A STORED COUNTER, NOT A LIVE COUNT. Attaching and removing documents
  both rewrite it, but DELETING a document does not, so it reads high after
  "nexus document delete" until the next attach or remove. "nexus collection
  stats <id>" counts the links themselves.

  --search matches name, display name and description, case-insensitively.
  --limit DEFAULTS TO 20 AND IS CAPPED AT 100. Over 100 is a 400, not a clamp.

  PAGE WITH --offset, NOT WITH --page. The route counts from an offset rather
  than numbering pages, so page two of a 20-row page is "--limit 20 --offset 20".
  --offset DEFAULTS TO 0 and its floor is 0; a negative value is a 400.

  THE TOTAL PRINTS UNDER THE TABLE, AND IS HOW YOU KNOW WHEN TO STOP. Page until
  the "more available" mark is gone; do not stop on a short page, because a page
  can be short for other reasons.
  --json IS A BARE ARRAY ([] when empty), with no envelope and no meta — so the
  total is NOT in it, and a script that pages has to count what it has received
  against a total read some other way. Two siblings in this same namespace answer
  differently — "collection documents" is {data, meta} and "collection query" is
  {results} — so one jq expression cannot read all three.`;

/** `nexus collection list` */
export function registerCollectionListCommand(collection: Command, program: Command): Command {
  const leaf = collection
    .command("list")
    .description("List knowledge collections")
    .option("--search <query>", "Search by name")
    .option("--limit <number>", "Max results", parseInt)
    .option("--offset <number>", "Skip this many results", parseInt)
    .addHelpText("after", LIST_HELP)
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const offset = typeof opts.offset === "number" ? opts.offset : 0;
        const result = await client.skills.listCollections({
          search: opts.search,
          limit: opts.limit,
          offset: opts.offset
        });

        const items = result.items ?? [];
        printTable(items, [
          { key: "id", label: "ID", width: 36 },
          { key: "name", label: "NAME", width: 25 },
          { key: "displayName", label: "DISPLAY NAME", width: 25 },
          { key: "documentCount", label: "DOCS", width: 6 }
        ]);
        // TABLE MODE ONLY — `printPaginationMeta` returns early under --json, and
        // that is the point: this command's documented JSON shape is a BARE ARRAY,
        // so adding a total to it would be a breaking change for every script
        // already reading it. Without the total an operator paging by --offset has
        // no way to know when to stop, which would make --offset half a feature.
        //
        // An ABSENT total supports no conclusion about further rows, so it is
        // reported as one. Defaulting it to 0 and comparing answers "exhausted",
        // and the operator stops paging believing they hold the whole collection.
        printPaginationMeta({
          total: result.total,
          paging:
            result.total === undefined
              ? "did-not-say"
              : offset + items.length < result.total
                ? "has-more"
                : "exhausted"
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  bindCommand(leaf, SKILLS_LIST_COLLECTIONS_CONTRACT);
  return leaf;
}
