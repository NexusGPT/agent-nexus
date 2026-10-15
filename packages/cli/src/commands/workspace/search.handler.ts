import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { color, isJsonMode, printTable } from "../../output";

/** Everything `nexus workspace search` reads off the command line. */
export interface WorkspaceSearchOptions {
  query?: string;
  frontmatter: string[];
  path?: string;
  limit?: number;
}

/**
 * The local refusals first — at least one filter, and every `--frontmatter` in
 * `key=value` form — then the server's answer rendered. Refusing here is the
 * point: the alternative is a scan of everything, or a 400 that names nothing.
 */
export async function runWorkspaceSearch(
  program: Command,
  slug: string,
  opts: WorkspaceSearchOptions
): Promise<void> {
  try {
    if (!opts.query && opts.frontmatter.length === 0) {
      throw new Error(
        "Provide --query and/or at least one --frontmatter key=value filter to search."
      );
    }
    for (const f of opts.frontmatter) {
      if (!f.includes("=") || f.split("=", 1)[0].trim().length === 0) {
        throw new Error(`Invalid --frontmatter "${f}". Use key=value form with a non-empty key.`);
      }
    }

    const client = createClient(program.optsWithGlobals());
    const res = await client.workspaces.search(slug, {
      query: opts.query,
      frontmatter: opts.frontmatter.length > 0 ? opts.frontmatter : undefined,
      path: opts.path,
      limit: opts.limit
    });

    if (isJsonMode()) {
      console.log(JSON.stringify(res, null, 2));
      return;
    }

    if (res.results.length === 0) {
      console.log(`No matches (scanned ${res.scanned} file${res.scanned === 1 ? "" : "s"}).`);
      return;
    }

    printTable(
      res.results.map((hit) => ({
        path: hit.path,
        match: hit.matchedIn.join(", "),
        snippet: (hit.snippet ?? "").replace(/\s+/g, " ").slice(0, 80)
      })),
      [
        { key: "path", label: "Path" },
        { key: "match", label: "Matched" },
        { key: "snippet", label: "Snippet" }
      ]
    );
    const shown = `${res.results.length} match${res.results.length === 1 ? "" : "es"}`;
    const scanned = `scanned ${res.scanned} file${res.scanned === 1 ? "" : "s"}`;
    console.error(
      color.dim(`${shown}, ${scanned}${res.truncated ? " (truncated — narrow your search)" : ""}`)
    );
  } catch (err) {
    process.exitCode = handleError(err);
  }
}
