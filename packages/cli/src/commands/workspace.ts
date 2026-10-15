import type { Command } from "commander";

import { registerWorkspaceCreateCommand } from "./workspace/create.command";
import { registerWorkspaceDeleteCommand } from "./workspace/delete.command";
import { registerWorkspaceListCommand } from "./workspace/list.command";
import { registerWorkspaceRenameCommand } from "./workspace/rename.command";
import { registerWorkspaceRestoreCommand } from "./workspace/restore.command";
import { registerWorkspaceSearchCommand } from "./workspace/search.command";
import { WORKSPACE_NAMESPACE_HELP } from "./workspace/workspace-help";
import { registerWorkspaceCredentialProcessCommand } from "./workspace-credential-process";
import { registerWorkspaceHistoryCommand } from "./workspace-history";
import { registerWorkspaceMountCommand } from "./workspace-mount";
import { registerWorkspacePullCommand } from "./workspace-pull";
import { registerWorkspacePushCommand } from "./workspace-push";
import { registerWorkspaceRemountCommand } from "./workspace-remount";
import { registerWorkspaceRevertCommand } from "./workspace-revert";
import { registerWorkspaceStatusCommand } from "./workspace-status";
import { registerWorkspaceUnmountCommand } from "./workspace-unmount";

// The `workspace` namespace and nothing else. Every subcommand lives one per
// file and binds its own contract: the Public API v1 verbs in `workspace/`
// (`list`, `search`, `create`, `rename`, `delete`, `restore`) and beside it
// (`workspace-history.ts`, `workspace-revert.ts`, `workspace-push.ts`,
// `workspace-pull.ts`), the four drive verbs in `workspace-mount.ts`,
// `workspace-remount.ts`, `workspace-unmount.ts` and `workspace-status.ts`, the
// engines they drive in `workspace-mount-gateway.ts` and
// `workspace-mount-direct.ts`, and what those share in `workspace-mount/`.
//
// 🚨 THE ORDER OF THE CALLS BELOW IS THE ORDER `--help` PRINTS, so it is part
// of the published surface rather than a style choice.
//
// Nothing is re-exported from here: the ledger-assertion scan in
// `packages/types` does not follow an `export { … } from` clause, so a shim
// would count as a module it could not open.
//
// 🔴 NEVER PUT A NEW FILE AT `commands/<name>.ts` FOR THIS NAMESPACE.
// `command-universe/registrar-discovery.ts` does a NON-RECURSIVE `readdirSync`
// over `commands/*.ts` and IMPORTS every one of them, grafting any arity-1
// `register*` export onto the ROOT program as a top-level command. A
// `commands/<name>/` DIRECTORY is skipped by that walk, which is why this
// namespace's parts sit in one.

export function registerWorkspaceCommands(program: Command): void {
  const ws = program
    .command("workspace")
    .description("Mount Nexus workspaces as a live shared drive for local Claude Code");

  ws.addHelpText("after", WORKSPACE_NAMESPACE_HELP);

  // ── list · search · create · rename · delete · restore ───────────────────
  registerWorkspaceListCommand(ws, program);
  registerWorkspaceSearchCommand(ws, program);
  registerWorkspaceCreateCommand(ws, program);
  registerWorkspaceRenameCommand(ws, program);
  registerWorkspaceDeleteCommand(ws, program);
  registerWorkspaceRestoreCommand(ws, program);

  // ── history · revert ─────────────────────────────────────────────────────
  registerWorkspaceHistoryCommand(ws, program);
  registerWorkspaceRevertCommand(ws, program);

  // ── push · pull ──────────────────────────────────────────────────────────
  registerWorkspacePushCommand(ws, program);
  registerWorkspacePullCommand(ws, program);

  // ── mount · remount · unmount · status ───────────────────────────────────
  registerWorkspaceMountCommand(ws, program);
  registerWorkspaceRemountCommand(ws, program);
  registerWorkspaceUnmountCommand(ws, program);
  registerWorkspaceStatusCommand(ws, program);

  // ── credential-process ────────────────────────────────────────────────────
  registerWorkspaceCredentialProcessCommand(ws, program);
}
