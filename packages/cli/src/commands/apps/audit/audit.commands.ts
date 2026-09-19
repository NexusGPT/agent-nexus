import type { Command } from "commander";

import { registerAppsAuditListCommand } from "./list.command";

/** Registers every `nexus apps audit` leaf, in registration order. */
export function registerAppsAuditCommands(apps: Command, program: Command): void {
  const audit = apps.command("audit").description("Read the per-org Vibe audit feed");

  registerAppsAuditListCommand(audit, program);
}
