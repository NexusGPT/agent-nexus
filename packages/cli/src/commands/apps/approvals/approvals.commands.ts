import type { Command } from "commander";

import { registerAppsApprovalsDecideCommand } from "./decide.command";
import { registerAppsApprovalsGetCommand } from "./get.command";
import { registerAppsApprovalsPendingCommand } from "./pending.command";

/** Registers every `nexus apps approvals` leaf, in registration order. */
export function registerAppsApprovalsCommands(apps: Command, program: Command): void {
  const approvals = apps.command("approvals").description("Review gated deployments");

  registerAppsApprovalsPendingCommand(approvals, program);
  registerAppsApprovalsGetCommand(approvals, program);
  registerAppsApprovalsDecideCommand(approvals, program);
}
