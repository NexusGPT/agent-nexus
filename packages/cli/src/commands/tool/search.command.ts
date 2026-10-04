import { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand, enumOption } from "../../contract-binding";
import { handleError } from "../../errors";
import { printEnvelope, printTable } from "../../output";
import {
  TOOL_DISCOVERY_SEARCH__PARAMS_TYPE,
  TOOL_DISCOVERY_SEARCH_CONTRACT
} from "../tool.contract.generated";

/** `nexus tool search` — the marketplace catalogue. */
export function registerToolSearchCommand(tool: Command, program: Command): void {
  const search = tool
    .command("search")
    .description("Search marketplace tools")
    .option("--query <query>", "Search query")
    .option("--category <category>", "Filter by category")
    .addOption(enumOption("--type <type>", "Filter by type", TOOL_DISCOVERY_SEARCH__PARAMS_TYPE))
    .option("--limit <number>", "Max results", parseInt)
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tool search --query "gmail"
  $ nexus tool search --category "Communication" --limit 10
  $ nexus tool search --query "slack" --json

Notes:
  THERE IS NO SECOND PAGE HERE. This command exposes no --offset and no --page,
  so narrow with --query or --category rather than paging — but a truncated
  result no longer LOOKS complete: compare .tools|length against .total.

  --json ANSWERS THE ROUTE'S OWN OBJECT: {tools, facets, total}. The rows are
  under .tools — jq '.[]' selects nothing — .total is how many matched, and
  .facets is the breakdown described below. Reach past --limit with
  "nexus api GET /tools/search", which takes an offset.

  --query IS OPTIONAL, AND OMITTING IT BROWSES. It defaults to the empty string
  rather than being required, so "nexus tool search --limit 20" walks the
  catalogue and "--type CUSTOM_MANIFEST" alone filters it. There is no separate
  list command in this namespace; this is it.

  --type IS THE INTEGRATION KIND, AND IT IS THE SAME VALUE THE TYPE COLUMN
  PRINTS. Read one off a result row and send it straight back. It is NOT the
  skill kind: "--type WORKFLOW" belongs to "nexus tool skills" beside it, and
  used to be accepted here — it returned an empty table every time, because no
  marketplace tool can carry it.

  --category IS FREE TEXT AND VALIDATES NOTHING, unlike --type beside it.
  Tool.categories is a string array with no closed set, so a misspelled category
  is not refused — it returns an empty result that reads exactly like "no tools
  in that category". The real values come back as facets on the same response:
  run this command with --json and read .facets, which names every category
  with its count. Read one from there before you filter on it.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.tools.search({
          q: opts.query,
          category: opts.category,
          type: opts.type,
          limit: opts.limit
        });

        const tools = result.tools ?? [];
        // `facets` is the category/type breakdown, and it is reachable from no
        // other command — a caller who wants to know which categories exist
        // used to have to drop to `nexus api GET /tools/search`.
        printEnvelope(result, () => {
          printTable(tools, [
            { key: "id", label: "ID", width: 36 },
            { key: "name", label: "NAME", width: 25 },
            { key: "type", label: "TYPE", width: 12 },
            { key: "description", label: "DESCRIPTION", width: 40 }
          ]);
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists.
  bindCommand(search, TOOL_DISCOVERY_SEARCH_CONTRACT);
}
