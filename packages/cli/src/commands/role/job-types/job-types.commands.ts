import type { Command } from "commander";

import { registerRoleAutomationSettingsCommand } from "./automation-settings.command";
import { registerRoleCreateJobTypeCommand } from "./create-job-type.command";
import { registerRoleDeleteJobTypeCommand } from "./delete-job-type.command";
import { registerRoleSetAutomationSettingsCommand } from "./set-automation-settings.command";
import { registerRoleUpdateJobTypeCommand } from "./update-job-type.command";

/** Registers every `nexus role` job-types leaf, in registration order. */
export function registerJobTypesCommands(role: Command, program: Command): void {
  // ── the job model ─────────────────────────────────────────────────────────
  registerRoleCreateJobTypeCommand(role, program);
  registerRoleUpdateJobTypeCommand(role, program);
  registerRoleDeleteJobTypeCommand(role, program);
  registerRoleAutomationSettingsCommand(role, program);
  registerRoleSetAutomationSettingsCommand(role, program);
}
