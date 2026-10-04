import type { Command } from "commander";

import { registerEmulatorScenarioDeleteCommand } from "./delete.command";
import { registerEmulatorScenarioGetCommand } from "./get.command";
import { registerEmulatorScenarioListCommand } from "./list.command";
import { registerEmulatorScenarioReplayCommand } from "./replay.command";
import { registerEmulatorScenarioSaveCommand } from "./save.command";

/** Builds the `nexus emulator scenario` sub-group and registers every leaf on it. */
export function registerEmulatorScenarioCommands(emulator: Command, program: Command): Command {
  const scenario = emulator.command("scenario").description("Manage emulator scenarios");

  scenario.addHelpText(
    "after",
    `
A scenario is a session's USER messages, with the pauses between them, saved
so they can be sent again. IT IS A SCRIPT, NOT A TRANSCRIPT: the agent's
replies are not stored, so replay re-runs the agent live and compares nothing.
Two replays of one scenario can differ, and neither is checked against the
recording. Any assertion is yours to make on the resulting session.

A scenario belongs to the deployment it was recorded from and can only be
replayed against that one — any other is a 403.

Replay is asynchronous: it answers with a NEW session id before anything has
been sent, and "emulator session get" is where the results appear.`
  );

  registerEmulatorScenarioSaveCommand(scenario, program);
  registerEmulatorScenarioListCommand(scenario, program);
  registerEmulatorScenarioGetCommand(scenario, program);
  registerEmulatorScenarioReplayCommand(scenario, program);
  registerEmulatorScenarioDeleteCommand(scenario, program);

  return scenario;
}
