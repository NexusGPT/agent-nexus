import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand } from "../../../contract-binding";
import { handleError } from "../../../errors";
import { printSuccess } from "../../../output";
import { confirmable, confirmDestructive } from "../../../util/confirm";
import { EMULATOR_DELETE_SCENARIO_CONTRACT } from "../../emulator.contract.generated";

/** `nexus emulator scenario delete` */
export function registerEmulatorScenarioDeleteCommand(
  scenario: Command,
  program: Command
): Command {
  const leaf = confirmable(scenario.command("delete"))
    .description("Delete a scenario")
    .argument("<scenario-id>", "Scenario ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus emulator scenario delete 11111111-1111-4111-8111-111111111111
  $ nexus emulator scenario delete 11111111-1111-4111-8111-111111111111 --yes

Notes:
  THE API ANSWERS 204 WITH NO BODY, unlike the agent-family deletes which
  answer {id, deleted: true} at 200. The exit code is the whole confirmation —
  the {"success": true, ...} that --json prints is this command's own line, not
  a server response.
  Permanent: the recorded messages go with it and the session it was taken
  from cannot re-derive them once that session is gone.
  Sessions produced by past replays are NOT deleted and keep their history.
  --yes IS REQUIRED IN A SCRIPT. With no terminal to answer on, this REFUSES
  and exits non-zero rather than acting.`
    )
    .action(async (scenarioId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        if (!(await confirmDestructive(`Delete scenario ${scenarioId}?`, opts))) return;

        await client.emulator.deleteScenario(scenarioId);
        printSuccess("Scenario deleted.", { scenarioId });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  bindCommand(leaf, EMULATOR_DELETE_SCENARIO_CONTRACT);
  return leaf;
}
