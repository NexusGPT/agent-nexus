import type { Command } from "commander";

import { registerTracksDependencyAddCommand } from "./add.command";

/** Registers every `nexus tracks dependency` leaf, in registration order. */
export function registerTracksDependencyCommands(tracks: Command, program: Command): void {
  const dependency = tracks.command("dependency").description("Declare which track blocks which");

  registerTracksDependencyAddCommand(dependency, program);
}
