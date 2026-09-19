import type { Command } from "commander";

import { registerAppsEnvListCommand } from "./list.command";
import { registerAppsEnvRmCommand } from "./rm.command";
import { registerAppsEnvSetCommand } from "./set.command";

/** Registers every `nexus apps env` leaf, in registration order. */
export function registerAppsEnvCommands(apps: Command, program: Command): void {
  const env = apps
    .command("env")
    .description("Manage an app's plaintext env vars, and read its imported access cards");

  registerAppsEnvListCommand(env, program);
  registerAppsEnvSetCommand(env, program);
  registerAppsEnvRmCommand(env, program);
}
