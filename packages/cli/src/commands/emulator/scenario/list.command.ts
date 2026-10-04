import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand } from "../../../contract-binding";
import { handleError } from "../../../errors";
import { printList } from "../../../output";
import { EMULATOR_LIST_SCENARIOS_CONTRACT } from "../../emulator.contract.generated";

/** `nexus emulator scenario list` */
export function registerEmulatorScenarioListCommand(scenario: Command, program: Command): Command {
  const leaf = scenario
    .command("list")
    .description("List emulator scenarios")
    .option("--deployment-id <id>", "Filter by deployment ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus emulator scenario list
  $ nexus emulator scenario list --deployment-id 44444444-4444-4444-8444-444444444444
  $ nexus emulator scenario list --json

Notes:
  Every scenario in the organization unless --deployment-id narrows it, and
  unpaginated. DEPLOYMENT is the one it was recorded from, and it is the ONLY
  deployment it can be replayed against — replay checks the two match and 403s
  otherwise. Copy that value into "scenario replay --deployment-id".
  --deployment-id must be a UUID or it is a 400.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.emulator.listScenarios({
          deploymentId: opts.deploymentId
        });
        const items = result;

        printList(items, undefined, [
          { key: "id", label: "ID", width: 36 },
          { key: "name", label: "NAME", width: 30 },
          { key: "deploymentId", label: "DEPLOYMENT", width: 36 },
          { key: "createdAt", label: "CREATED", width: 26 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  bindCommand(leaf, EMULATOR_LIST_SCENARIOS_CONTRACT);
  return leaf;
}
