import type { Command } from "commander";

import { runWorkspaceUnmount } from "./workspace-mount/unmount.handler";
import { WORKSPACE_UNMOUNT_HELP } from "./workspace-mount/unmount-help";

/**
 * The `unmount` verb, registered on the `workspace` namespace
 * `registerWorkspaceCommands` owns, in the position that function gives it.
 * A local operation on the mount registry: no auth, no API call.
 */
export function registerWorkspaceUnmountCommand(ws: Command, program: Command): void {
  // ── unmount ──────────────────────────────────────────────────────────────
  ws.command("unmount")
    .alias("umount")
    .description("Unmount a previously mounted workspace")
    .argument("<slug>", "Workspace slug")
    .addHelpText("after", WORKSPACE_UNMOUNT_HELP)
    .action((slug: string) => {
      runWorkspaceUnmount(program, slug);
    });
}
