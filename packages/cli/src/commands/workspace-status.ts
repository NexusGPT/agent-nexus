import type { Command } from "commander";

import { WORKSPACE_STATUS_HELP } from "./workspace/status/copy/status-help";
import { runWorkspaceStatus } from "./workspace/status/run-status";

/**
 * The `status` verb, registered on the `workspace` namespace
 * `registerWorkspaceCommands` owns, in the position that function gives it.
 * A local read of the mount registry, never a server check.
 *
 * What it reads and what it prints is `workspace/status/`: the row projection,
 * the table, the refusal document and the help prose, one concern per file.
 *
 * `_program` is unread: `command-universe.ts` tells a nested registrar from a
 * root one by ARITY, so a one-parameter `register*` export here would be
 * grafted onto the root program as a top-level `status` command.
 */
export function registerWorkspaceStatusCommand(ws: Command, _program: Command): void {
  // ── status ─────────────────────────────────────────────────────────────────
  ws.command("status")
    .description("Show locally recorded mounts — a local read, never a server check")
    .addHelpText("after", WORKSPACE_STATUS_HELP)
    .action(() => {
      runWorkspaceStatus();
    });
}
