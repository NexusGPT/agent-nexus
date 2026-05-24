import { Command } from "commander";

import { createClient } from "../client";
import { color, isJsonMode } from "../output";

const DOCS_URL = "https://gpt.nexus/docs";
const LLMS_FULL_URL = `${DOCS_URL}/llms-full.txt`;
const LLMS_INDEX_URL = `${DOCS_URL}/llms.txt`;

export function registerDocsCommand(program: Command): void {
  const docs = program
    .command("docs")
    .description("Search and browse Nexus product documentation")
    .option("--full", "Fetch and print the full documentation (from llms-full.txt)")
    .option("--index", "Fetch and print the documentation index (from llms.txt)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus docs                                        # Show doc links
  $ nexus docs --index                                # Fetch page index
  $ nexus docs --full                                 # Fetch full docs (large)
  $ nexus docs search "how to deploy to WhatsApp"     # Semantic search
  $ nexus docs search "creating agents" --limit 10

Full documentation: ${DOCS_URL}`
    )
    .action(async (opts: { full?: boolean; index?: boolean }) => {
      if (opts.full || opts.index) {
        const url = opts.full ? LLMS_FULL_URL : LLMS_INDEX_URL;
        try {
          const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
          if (!res.ok) {
            console.error(
              color.red("Error:") + ` Failed to fetch docs: ${res.status} ${res.statusText}`
            );
            process.exitCode = 1;
            return;
          }
          const text = await res.text();

          if (isJsonMode()) {
            console.log(JSON.stringify({ url, content: text }));
          } else {
            console.log(text);
          }
        } catch (error: any) {
          console.error(color.red("Error:") + ` ${error.message ?? error}`);
          process.exitCode = 1;
        }
        return;
      }

      // Default: show links
      console.log(color.bold("Nexus Documentation\n"));
      console.log(`  Full docs:     ${color.cyan(DOCS_URL)}`);
      console.log(`  CLI reference: ${color.cyan(`${DOCS_URL}/api-reference/cli/overview`)}`);
      console.log(`  API reference: ${color.cyan(`${DOCS_URL}/api-reference/authentication`)}`);
      console.log(`  LLM index:     ${color.cyan(LLMS_INDEX_URL)}`);
      console.log(`  LLM full:      ${color.cyan(LLMS_FULL_URL)}`);
      console.log();
      console.log(
        color.dim("Use ") +
          color.cyan("nexus docs --full") +
          color.dim(" to fetch all docs, or ") +
          color.cyan("nexus docs search <query>") +
          color.dim(" for semantic search.")
      );
    });

  // Semantic search subcommand (requires API key)
  docs
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
  $ nexus docs search "RAG" --json`
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

        const results = (result as any).results ?? [];

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
      } catch (error: any) {
        console.error(color.red("Error:") + ` ${error.message ?? error}`);
        process.exitCode = 1;
      }
    });
}
