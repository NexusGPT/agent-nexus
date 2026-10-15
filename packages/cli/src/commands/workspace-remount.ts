import type { Command } from "commander";

import {
  runWorkspaceRemount,
  type WorkspaceRemountOptions
} from "./workspace-mount/remount.handler";
import { WORKSPACE_REMOUNT_HELP } from "./workspace-mount/remount-help";

/**
 * The `remount` verb, registered on the `workspace` namespace
 * `registerWorkspaceCommands` owns, in the position that function gives it.
 * It replays a recorded row through the engine the row names.
 */
export function registerWorkspaceRemountCommand(ws: Command, program: Command): void {
  // ── remount ──────────────────────────────────────────────────────────────
  ws.command("remount")
    .description(
      "Mount a recorded workspace again — after a logout, a restart, or a mount that died"
    )
    .argument("<slug>", "Workspace slug (see `nexus workspace status`)")
    .option(
      "--install-deps",
      "Install a missing rclone (macOS, Linux; x64 or arm64) or FUSE-T (macOS) without asking; not on Windows"
    )
    .option("--no-install-deps", "Never offer to install them; refuse with the install hint")
    .addHelpText("after", WORKSPACE_REMOUNT_HELP)
    .action(async (slug: string, opts: WorkspaceRemountOptions) => {
      await runWorkspaceRemount(program, slug, opts);
    });
}
