import type { Command } from "commander";

import { registerRoleAccessRequestsCommand } from "../requests/access-requests.command";
import { registerRoleCollectionGrantsCommand } from "./collection-grants.command";
import { registerRoleCoverageCommand } from "./coverage.command";
import { registerRoleGetCommand } from "./get.command";
import { registerRoleJobTypesCommand } from "./job-types.command";
import { registerRoleListCommand } from "./list.command";
import { registerRoleMembersCommand } from "./members.command";
import { registerRolePermissionSetsCommand } from "./permission-sets.command";
import { registerRoleSystemsCommand } from "./systems.command";
import { registerRoleWorkspaceGrantsCommand } from "./workspace-grants.command";

/** Registers every `nexus role` reads leaf, in registration order. */
export function registerReadsCommands(role: Command, program: Command): void {
  registerRoleListCommand(role, program);
  registerRoleGetCommand(role, program);
  registerRoleSystemsCommand(role, program);
  registerRoleMembersCommand(role, program);
  registerRolePermissionSetsCommand(role, program);
  registerRoleCollectionGrantsCommand(role, program);
  registerRoleWorkspaceGrantsCommand(role, program);
  registerRoleAccessRequestsCommand(role, program);
  registerRoleCoverageCommand(role, program);
  registerRoleJobTypesCommand(role, program);
}
