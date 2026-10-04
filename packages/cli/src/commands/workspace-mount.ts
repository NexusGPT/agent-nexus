import type { Command } from "commander";

import { runWorkspaceMount, type WorkspaceMountOptions } from "./workspace-mount/mount.handler";
import { WORKSPACE_MOUNT_HELP } from "./workspace-mount/mount-help";

/**
 * The `mount` verb, registered on the `workspace` namespace
 * `registerWorkspaceCommands` owns, in the position that function gives it.
 * It speaks to this machine's mount registry and to the engines in
 * `workspace-mount-gateway.ts` and `workspace-mount-direct.ts`.
 */
export function registerWorkspaceMountCommand(ws: Command, program: Command): void {
  // ── mount ────────────────────────────────────────────────────────────────
  ws.command("mount")
    .description("Mount a workspace as a live drive so local Claude Code can use it")
    .argument("<slug>", "Workspace slug (see `nexus workspace list`)")
    .option("--at <path>", "Mount point (default: ~/nexus/<org>/<slug>)")
    .option(
      "--read-only",
      "Mount read-only (a CODE workspace is read-only regardless — this can only add it)"
    )
    .option(
      "--shared",
      "Mount the admin-shared workspace with this slug (not the same-slug org-owned one)"
    )
    .option(
      "--engine <engine>",
      "Mount engine: auto (default), webdav (native, macOS), rclone (the gateway over FUSE; Linux/Windows), " +
        "or direct (rclone signing storage itself)",
      "auto"
    )
    .option("--claude-md", "Write a managed note about the mount into ./CLAUDE.md")
    .option(
      "--install-deps",
      "Install a missing rclone (macOS, Linux; x64 or arm64) or FUSE-T (macOS) without asking; not on Windows"
    )
    .option("--no-install-deps", "Never offer to install them; refuse with the install hint")
    .addHelpText("after", WORKSPACE_MOUNT_HELP)
    .action(async (slug: string, opts: WorkspaceMountOptions) => {
      await runWorkspaceMount(program, slug, opts);
    });
}
