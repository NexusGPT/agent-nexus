import { Command } from "commander";

import { DOCS_HELP } from "./docs/docs-help";
import { printDocsFeed } from "./docs/print-feed";
import { printDocsLinks } from "./docs/print-links";
import { registerDocsSearchCommand } from "./docs/search.command";

export function registerDocsCommand(program: Command): void {
  const docs = program
    .command("docs")
    .description("Search and browse Nexus product documentation")
    .option("--full", "Fetch and print the full documentation (from llms-full.txt)")
    .option("--index", "Fetch and print the documentation index (from llms.txt)")
    .addHelpText("after", DOCS_HELP)
    // The `.command("docs")` chain keeps its own `.action()` on purpose: the
    // `--json` shape scan resolves a leaf from the `.command()` call and the
    // action attached to the SAME chain, so moving the action to a sibling
    // registrar would make this leaf unresolvable and silently drop its shape
    // line from `--help`. The two branches BELOW the action are what moved.
    .action(async (opts: { full?: boolean; index?: boolean }) => {
      const globals = program.optsWithGlobals();

      if (opts.full || opts.index) {
        await printDocsFeed(globals, opts);
        return;
      }

      printDocsLinks(globals);
    });

  registerDocsSearchCommand(docs, program);
}
