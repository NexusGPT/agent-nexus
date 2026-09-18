import type { Command } from "commander";

import { registerRoleAddPermissionSetMemberCommand } from "./add-permission-set-member.command";
import { registerRoleCreatePermissionSetCommand } from "./create-permission-set.command";
import { registerRoleDeletePermissionSetCommand } from "./delete-permission-set.command";
import { registerRoleRemovePermissionSetMemberCommand } from "./remove-permission-set-member.command";
import { registerRoleUpdatePermissionSetCommand } from "./update-permission-set.command";

/** Registers every `nexus role` permission-sets leaf, in registration order. */
export function registerPermissionSetsCommands(role: Command, program: Command): void {
  // ── permission-set writes ─────────────────────────────────────────────────
  registerRoleCreatePermissionSetCommand(role, program);
  registerRoleUpdatePermissionSetCommand(role, program);
  registerRoleDeletePermissionSetCommand(role, program);

  // ── permission-set membership ─────────────────────────────────────────────
  registerRoleAddPermissionSetMemberCommand(role, program);
  registerRoleRemovePermissionSetMemberCommand(role, program);
}
