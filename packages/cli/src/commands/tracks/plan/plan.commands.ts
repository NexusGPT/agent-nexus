import type { Command } from "commander";

import { registerTracksPlanImportCommand } from "./import.command";

/** Registers every `nexus tracks plan` leaf, in registration order. */
export function registerTracksPlanCommands(tracks: Command, program: Command): void {
  const plan = tracks.command("plan").description("Import a whole plan into a track");

  registerTracksPlanImportCommand(plan, program);
}
