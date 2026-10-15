import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { color, isJsonMode } from "../../output";
import { DOCS_SEARCH_CONTRACT } from "../docs.contract.generated";

/** `nexus docs search` */
export function registerDocsSearchCommand(docs: Command, program: Command): void {
  // Semantic search subcommand (requires API key)
  const search = docs
    .command("search")
    .description("Semantic search across Nexus product documentation (requires API key)")
    .argument("<query>", "Natural language search query")
    .option("--limit <n>", "Max results (1-20)", "5")
    .option("--section <section>", "Filter by docs section (e.g. agents, deployments, knowledge)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus docs search "how to deploy to WhatsApp"
  $ nexus docs search "creating agents" --limit 10
  $ nexus docs search "webhook" --section api-reference
  $ nexus docs search "RAG" --json

Notes:
  THE PRINTED SNIPPET IS TRUNCATED AT 200 CHARACTERS and the trailing "..." is
  added by this CLI, not returned by the route. --json carries the whole snippet,
  so read that when the answer is cut off mid-sentence.
  A row is title, url and snippet. There is no score and no section in the
  output, so --section narrows the search and cannot be confirmed from a result.
  NO MATCH IS NOT AN ERROR. An empty result set prints one dim line and exits 0,
  which is deliberately indistinguishable from a successful search that found
  nothing — check the exit code for reachability, never the presence of rows.`
    )
    .action(async (query: string, opts: { limit?: string; section?: string }) => {
      const client = createClient(program.optsWithGlobals());
      const limit = opts.limit ? parseInt(opts.limit, 10) : 5;

      try {
        const result = await client.docs.search({
          query,
          limit,
          section: opts.section
        });

        const results = result.results ?? [];

        if (isJsonMode()) {
          console.log(JSON.stringify({ query, results }, null, 2));
          return;
        }

        if (results.length === 0) {
          console.log(color.dim(`No documentation found for "${query}".`));
          return;
        }

        console.log(
          color.bold(`\nFound ${results.length} result${results.length === 1 ? "" : "s"}:\n`)
        );

        for (const r of results) {
          console.log(color.cyan(`  ${r.title}`));
          console.log(color.dim(`  ${r.url}`));
          console.log(`  ${r.snippet.slice(0, 200)}${r.snippet.length > 200 ? "..." : ""}`);
          console.log();
        }
      } catch (err) {
        // `handleError` rather than a hand-rolled `console.error`: it classifies
        // the throw into a real code and emits the document on stdout. The old
        // shape exited 1 with an empty stdout under --json and labelled nothing.
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists — see `bindCommand`. Only `search`
  // calls a v1 route; the rest of this namespace opens URLs.
  bindCommand(search, DOCS_SEARCH_CONTRACT);
}
