import type { Command } from "commander";

import { bindCommand } from "../../contract-binding";
import { WORKSPACE_SEARCH_CONTRACT } from "../workspace.contract.generated";
import { WORKSPACE_SEARCH_HELP } from "./copy/search-help";
import { runWorkspaceSearch, type WorkspaceSearchOptions } from "./search.handler";

/**
 * `nexus workspace search` — a server-side document search over one
 * workspace, with no mount. Its flags and its prose are here; what the
 * action does with them is `search.handler.ts`.
 */
export function registerWorkspaceSearchCommand(ws: Command, program: Command): void {
  const search = ws
    .command("search")
    .description("Search a workspace's docs server-side by keyword and/or frontmatter (no mount)")
    .argument("<slug>", "Workspace slug")
    .option(
      "--query <text>",
      "Keyword (case-insensitive substring over content, frontmatter, path)"
    )
    .option(
      "--frontmatter <key=value>",
      "Frontmatter filter (repeatable); all must hold, e.g. --frontmatter status=done",
      (val: string, acc: string[]) => {
        acc.push(val);
        return acc;
      },
      [] as string[]
    )
    .option("--path <folder>", "Restrict the search to a subfolder (workspace-relative)")
    .option("--limit <n>", "Max results to return (1–200, default 50)", (v) => parseInt(v, 10))
    .addHelpText("after", WORKSPACE_SEARCH_HELP)
    .action(async (slug: string, opts: WorkspaceSearchOptions) => {
      await runWorkspaceSearch(program, slug, opts);
    });
  bindCommand(search, WORKSPACE_SEARCH_CONTRACT);
}
