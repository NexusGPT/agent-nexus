import type { Command } from "commander";

import { registerTracksTaskClaimCommand } from "./claim.command";
import { registerTracksTaskEdgeCommand } from "./edge.command";
import { registerTracksTaskEdgesCommand } from "./edges.command";
import { registerTracksTaskGetCommand } from "./get.command";
import { registerTracksTaskListCommand } from "./list.command";
import { registerTracksTaskReadyCommand } from "./ready.command";
import { registerTracksTaskToggleCommand } from "./toggle.command";
import { registerTracksTaskWhyNotReadyCommand } from "./why-not-ready.command";

/** Registers every `nexus tracks task` leaf, in registration order. */
export function registerTracksTaskCommands(tracks: Command, program: Command): void {
  const task = tracks.command("task").description("Work with the tasks of a track");

  registerTracksTaskReadyCommand(task, program);
  registerTracksTaskListCommand(task, program);
  registerTracksTaskGetCommand(task, program);
  registerTracksTaskClaimCommand(task, program);
  registerTracksTaskToggleCommand(task, program);
  registerTracksTaskEdgeCommand(task, program);
  registerTracksTaskEdgesCommand(task, program);
  registerTracksTaskWhyNotReadyCommand(task, program);
}
