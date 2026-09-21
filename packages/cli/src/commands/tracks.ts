import type { Command } from "commander";

import { registerTracksAgentCommands } from "./tracks/agent/agent.commands";
import { registerTracksArchiveCommand } from "./tracks/archive.command";
import { registerTracksCreateCommand } from "./tracks/create.command";
import { registerTracksCurrentStepCommand } from "./tracks/current-step.command";
import { registerTracksDependencyCommands } from "./tracks/dependency/dependency.commands";
import { registerTracksDiaryCommands } from "./tracks/diary/diary.commands";
import { registerTracksEventCommands } from "./tracks/event/event.commands";
import { registerTracksGetCommand } from "./tracks/get.command";
import { registerTracksListCommand } from "./tracks/list.command";
import { registerTracksMemoryCommands } from "./tracks/memory/memory.commands";
import { registerTracksPlanCommands } from "./tracks/plan/plan.commands";
import { registerTracksReadyCommand } from "./tracks/ready.command";
import { registerTracksRollupCommand } from "./tracks/rollup.command";
import { registerTracksSectionCommands } from "./tracks/section/section.commands";
import { registerTracksSetNextOwnerCommand } from "./tracks/set-next-owner.command";
import { registerTracksSetStatusCommand } from "./tracks/set-status.command";
import { registerTracksTaskCommands } from "./tracks/task/task.commands";

/**
 * `nexus tracks …` — the Tracks namespace.
 *
 * ## The loop is four commands
 *
 * `tracks ready` -> `tracks task ready <trackId>` -> `tracks task get <taskId>`
 * -> `tracks task claim <taskId> --agent <agentId>`, then `tracks task toggle`
 * when it is done and `tracks diary append` for what happened.
 * `tracks agent beat` in between says the agent is still alive, and that
 * heartbeat is the ONE clock every collision banner's staleness is measured
 * from.
 */
export function registerTracksCommands(program: Command): void {
  const tracks = program.command("tracks").description("Work with tracks, their tasks and agents");

  registerTracksCreateCommand(tracks, program);
  registerTracksCurrentStepCommand(tracks, program);
  registerTracksSetStatusCommand(tracks, program);
  registerTracksSetNextOwnerCommand(tracks, program);
  registerTracksArchiveCommand(tracks, program);
  registerTracksListCommand(tracks, program);
  registerTracksGetCommand(tracks, program);
  registerTracksRollupCommand(tracks, program);
  registerTracksReadyCommand(tracks, program);

  registerTracksDependencyCommands(tracks, program);
  registerTracksSectionCommands(tracks, program);
  registerTracksTaskCommands(tracks, program);
  registerTracksPlanCommands(tracks, program);
  registerTracksAgentCommands(tracks, program);
  registerTracksDiaryCommands(tracks, program);
  registerTracksMemoryCommands(tracks, program);
  registerTracksEventCommands(tracks, program);
}
