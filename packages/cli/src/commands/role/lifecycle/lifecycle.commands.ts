import type { Command } from "commander";

import { registerRoleCreateCommand } from "./create.command";
import { registerRoleDeleteCommand } from "./delete.command";
import { registerRolePauseCommand } from "./pause.command";
import { registerRoleResumeCommand } from "./resume.command";
import { registerRoleUpdateCommand } from "./update.command";

/** Registers every `nexus role` lifecycle leaf, in registration order. */
export function registerLifecycleCommands(role: Command, program: Command): void {
  registerRoleCreateCommand(role, program);
  registerRoleUpdateCommand(role, program);
  registerRoleDeleteCommand(role, program);
  registerRolePauseCommand(role, program);
  registerRoleResumeCommand(role, program);
}
