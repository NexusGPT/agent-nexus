import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand } from "../../../contract-binding";
import { handleError } from "../../../errors";
import { printRecord } from "../../../output";
import { EMULATOR_GET_SCENARIO_CONTRACT } from "../../emulator.contract.generated";

/** `nexus emulator scenario get` */
export function registerEmulatorScenarioGetCommand(scenario: Command, program: Command): Command {
  const leaf = scenario
    .command("get")
    .description("Get scenario details")
    .argument("<scenario-id>", "Scenario ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus emulator scenario get 11111111-1111-4111-8111-111111111111
  $ nexus emulator scenario get 11111111-1111-4111-8111-111111111111 --json

Notes:
  Messages here are the USER side only, in order, each with the pause that
  preceded it and the participant that sent it. No agent replies are stored —
  see "scenario save".
  Deployment ID is the only deployment "scenario replay" will accept.`
    )
    .action(async (scenarioId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const s = await client.emulator.getScenario(scenarioId);
        printRecord(s, [
          { key: "id", label: "ID" },
          { key: "name", label: "Name" },
          { key: "description", label: "Description" },
          { key: "deploymentId", label: "Deployment ID" },
          { key: "messages", label: "Messages" },
          { key: "createdAt", label: "Created" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  bindCommand(leaf, EMULATOR_GET_SCENARIO_CONTRACT);
  return leaf;
}
