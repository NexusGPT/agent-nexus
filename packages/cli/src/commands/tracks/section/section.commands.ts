import type { Command } from "commander";

import { registerTracksSectionCreateCommand } from "./create.command";
import { registerTracksSectionListCommand } from "./list.command";
import { registerTracksSectionRenameCommand } from "./rename.command";

/** Registers every `nexus tracks section` leaf, in registration order. */
export function registerTracksSectionCommands(tracks: Command, program: Command): void {
  const section = tracks.command("section").description("Work with a track's section tree");

  registerTracksSectionCreateCommand(section, program);
  registerTracksSectionRenameCommand(section, program);
  registerTracksSectionListCommand(section, program);
}
