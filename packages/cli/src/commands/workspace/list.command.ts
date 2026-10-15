import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { type Column, isJsonMode, printTable } from "../../output";
import { WORKSPACE_LIST_CONTRACT } from "../workspace.contract.generated";
import { formatBytes } from "./_shared/format-bytes";
import { WORKSPACE_LIST_HELP } from "./copy/list-help";

/**
 * `nexus workspace list` — every workspace in the organization, with the
 * Kind column that makes an org-owned and an admin-shared row of the same
 * slug tellable apart.
 */
export function registerWorkspaceListCommand(ws: Command, program: Command): void {
  const list = ws
    .command("list")
    .description("List the workspaces in your organization")
    .option(
      "--folder-stats",
      "Include a per-top-level-folder breakdown (depth-1) in each workspace's stats"
    )
    .addHelpText("after", WORKSPACE_LIST_HELP)
    .action(async (opts: { folderStats?: boolean }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const { workspaces } = await client.workspaces.list({ folderStats: opts.folderStats });
        if (isJsonMode()) {
          console.log(JSON.stringify(workspaces, null, 2));
          return;
        }
        // Surface which copy is which: a slug can name both an org-owned and an
        // admin-shared workspace, and the bare slug mounts the org-owned one
        // (NEX-2362). The "Kind" column makes the collision visible at a glance.
        const rows = workspaces.map((w) => ({
          slug: w.slug,
          name: w.name,
          kind: w.isShared ? "shared" : "org",
          files: w.stats.fileCount,
          size: formatBytes(w.stats.totalBytes),
          ...(opts.folderStats ? { folders: w.stats.folders?.length ?? 0 } : {})
        }));
        // Hoisted so the conditional gets a contextual type. Spread inline, the
        // best-common-type of `[]` and the one-element literal widens `key` to
        // `string` and takes the whole column list out of the key check.
        const folderColumn: Column<(typeof rows)[number]>[] = opts.folderStats
          ? [{ key: "folders", label: "Folders" }]
          : [];
        printTable(rows, [
          { key: "slug", label: "Slug" },
          { key: "name", label: "Name" },
          { key: "kind", label: "Kind" },
          { key: "files", label: "Files" },
          { key: "size", label: "Size" },
          ...folderColumn
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(list, WORKSPACE_LIST_CONTRACT);
}
