import type { Command } from "commander";

import { registerRoleAttachCommand } from "./attach.command";
import { registerRoleDetachCommand } from "./detach.command";

/** Registers every `nexus role` resources leaf, in registration order. */
export function registerResourcesCommands(role: Command, program: Command): void {
  registerRoleAttachCommand(role, program);
  registerRoleDetachCommand(role, program);
}
