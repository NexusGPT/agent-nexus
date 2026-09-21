import type { Command } from "commander";

import { registerTracksAgentBeatCommand } from "./beat.command";
import { registerTracksAgentCloseCommand } from "./close.command";
import { registerTracksAgentListCommand } from "./list.command";
import { registerTracksAgentOpenCommand } from "./open.command";

/** Registers every `nexus tracks agent` leaf, in registration order. */
export function registerTracksAgentCommands(tracks: Command, program: Command): void {
  const agent = tracks.command("agent").description("Work with the agents on a track");

  registerTracksAgentListCommand(agent, program);
  registerTracksAgentOpenCommand(agent, program);
  registerTracksAgentBeatCommand(agent, program);
  registerTracksAgentCloseCommand(agent, program);
}
