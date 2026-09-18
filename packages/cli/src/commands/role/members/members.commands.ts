import type { Command } from "commander";

import { registerRoleAddMemberCommand } from "./add-member.command";
import { registerRoleGrantCollectionCommand } from "./grant-collection.command";
import { registerRoleGrantWorkspaceCommand } from "./grant-workspace.command";
import { registerRoleRemoveMemberCommand } from "./remove-member.command";
import { registerRoleRevokeCollectionCommand } from "./revoke-collection.command";
import { registerRoleRevokeWorkspaceCommand } from "./revoke-workspace.command";

/** Registers every `nexus role` members leaf, in registration order. */
export function registerMembersCommands(role: Command, program: Command): void {
  registerRoleAddMemberCommand(role, program);
  registerRoleRemoveMemberCommand(role, program);
  registerRoleGrantCollectionCommand(role, program);
  registerRoleRevokeCollectionCommand(role, program);
  registerRoleGrantWorkspaceCommand(role, program);
  registerRoleRevokeWorkspaceCommand(role, program);
}
