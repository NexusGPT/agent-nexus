import type { Command } from "commander";

import { registerTracksEventAppendCommand } from "./append.command";
import { registerTracksEventFeedCommand } from "./feed.command";
import { registerTracksEventListCommand } from "./list.command";

/** Registers every `nexus tracks event` leaf, in registration order. */
export function registerTracksEventCommands(tracks: Command, program: Command): void {
  const event = tracks.command("event").description("Read and append a track's event stream");

  registerTracksEventListCommand(event, program);
  registerTracksEventFeedCommand(event, program);
  registerTracksEventAppendCommand(event, program);
}
