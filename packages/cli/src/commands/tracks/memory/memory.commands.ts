import type { Command } from "commander";

import { registerTracksMemoryDeleteCommand } from "./delete.command";
import { registerTracksMemoryListCommand } from "./list.command";
import { registerTracksMemoryPutCommand } from "./put.command";

/** Registers every `nexus tracks memory` leaf, in registration order. */
export function registerTracksMemoryCommands(tracks: Command, program: Command): void {
  const memory = tracks.command("memory").description("Read and write a track's memory");

  registerTracksMemoryListCommand(memory, program);
  registerTracksMemoryPutCommand(memory, program);
  registerTracksMemoryDeleteCommand(memory, program);
}
