import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { color, isJsonMode, printSuccess } from "../../output";
import { WORKSPACE_RESTORE_CONTRACT } from "../workspace.contract.generated";
import { sharedWorkspaceId } from "../workspace-mount/shared-workspace-id";
import { WORKSPACE_RESTORE_HELP } from "./copy/restore-help";

/**
 * `nexus workspace restore` — the undo for a delete this namespace cannot
 * perform: a file removed on a mount or over WebDAV, back out of the
 * backup.
 */
export function registerWorkspaceRestoreCommand(ws: Command, program: Command): void {
  const restore = ws
    .command("restore")
    .description("Restore a deleted file or folder from backup (within the recovery window)")
    .argument("<slug>", "Workspace slug")
    .argument("<path>", "The deleted file or folder path (relative to the workspace root)")
    .option(
      "--shared",
      "Restore into the admin-shared workspace with this slug (not the same-slug org-owned one)"
    )
    .addHelpText("after", WORKSPACE_RESTORE_HELP)
    .action(async (slug: string, filePath: string, opts: { shared?: boolean }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const workspaceId = opts.shared ? await sharedWorkspaceId(client, slug) : undefined;
        const result = await client.workspaces.restore(slug, { path: filePath, workspaceId });
        if (isJsonMode()) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }
        if (result.count === 0) {
          console.log(
            color.dim(
              `Nothing to restore at "${filePath}" — it isn't in the recovery window, was never deleted, or is already present.`
            )
          );
          return;
        }
        printSuccess(`Restored ${result.count} file${result.count === 1 ? "" : "s"} to "${slug}"`);
        for (const p of result.restored) {
          console.log(color.dim(`  ${p}`));
        }
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(restore, WORKSPACE_RESTORE_CONTRACT);
}
