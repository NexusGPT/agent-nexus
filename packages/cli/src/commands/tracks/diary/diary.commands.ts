import type { Command } from "commander";

import { registerTracksDiaryAppendCommand } from "./append.command";
import { registerTracksDiaryListCommand } from "./list.command";

/** Registers every `nexus tracks diary` leaf, in registration order. */
export function registerTracksDiaryCommands(tracks: Command, program: Command): void {
  const diary = tracks.command("diary").description("Read and append a track's log");

  registerTracksDiaryListCommand(diary, program);
  registerTracksDiaryAppendCommand(diary, program);
}
