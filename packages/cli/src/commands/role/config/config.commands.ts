import type { Command } from "commander";

import { registerRoleAddResponsibilityCommand } from "./add-responsibility.command";
import { registerRoleRemoveResponsibilityCommand } from "./remove-responsibility.command";
import { registerRoleResponsibilitiesCommand } from "./responsibilities.command";
import { registerRoleScopeLinesCommand } from "./scope-lines.command";
import { registerRoleSetScopeLinesCommand } from "./set-scope-lines.command";
import { registerRoleSetSystemLifecycleCommand } from "./set-system-lifecycle.command";
import { registerRoleSetSystemPolicyCommand } from "./set-system-policy.command";
import { registerRoleSetTaskDutiesCommand } from "./set-task-duties.command";
import { registerRoleSetTasksCommand } from "./set-tasks.command";
import { registerRoleSetVariablesCommand } from "./set-variables.command";
import { registerRoleSetWorkingYearCommand } from "./set-working-year.command";
import { registerRoleSystemPolicyCommand } from "./system-policy.command";
import { registerRoleTaskDutiesCommand } from "./task-duties.command";
import { registerRoleTasksCommand } from "./tasks.command";
import { registerRoleVariablesCommand } from "./variables.command";
import { registerRoleWorkingYearCommand } from "./working-year.command";

/** Registers every `nexus role` config leaf, in registration order. */
export function registerConfigCommands(role: Command, program: Command): void {
  // ── the Scope — the job model's per-Role work items ───────────────────────
  //
  // NOT the Role's workload. `RoleWorkload` is a different table behind a
  // different route, it is the coverage denominator, and it is not writable
  // from here. Calling the Scope "the workload" in this section's own comment
  // is how the same conflation reached three help strings below it.
  registerRoleScopeLinesCommand(role, program);
  registerRoleSetScopeLinesCommand(role, program);
  registerRoleVariablesCommand(role, program);
  registerRoleSetVariablesCommand(role, program);
  registerRoleWorkingYearCommand(role, program);
  registerRoleSetWorkingYearCommand(role, program);

  // ── the Role's WORK: its duties, and the tasks it proposes ────────────────
  registerRoleResponsibilitiesCommand(role, program);
  registerRoleAddResponsibilityCommand(role, program);
  registerRoleRemoveResponsibilityCommand(role, program);
  registerRoleTasksCommand(role, program);
  registerRoleSetTasksCommand(role, program);
  registerRoleTaskDutiesCommand(role, program);
  registerRoleSetTaskDutiesCommand(role, program);
  registerRoleSystemPolicyCommand(role, program);
  registerRoleSetSystemPolicyCommand(role, program);
  registerRoleSetSystemLifecycleCommand(role, program);
}
