import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand } from "../../../contract-binding";
import { handleError } from "../../../errors";
import { printList } from "../../../output";
import { EMULATOR_LIST_SESSIONS_CONTRACT } from "../../emulator.contract.generated";

/** `nexus emulator session list` */
export function registerEmulatorSessionListCommand(session: Command, program: Command): Command {
  const leaf = session
    .command("list")
    .description("List emulator sessions")
    .argument("<deployment-id>", "Deployment ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus emulator session list 44444444-4444-4444-8444-444444444444
  $ nexus emulator session list 44444444-4444-4444-8444-444444444444 --json

Notes:
  Emulator sessions for this deployment only, and unpaginated.
  These are real DeploymentSession rows, but "nexus deployment stats" excludes
  them from both totalSessions and totalMessages — that endpoint reports real
  customer traffic, and this command is where test traffic is visible. They are
  still in the inbox: see the "emulator session" notes on archiving.`
    )
    .action(async (deploymentId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.emulator.listSessions(deploymentId);
        const items = result;

        printList(items, undefined, [
          { key: "id", label: "ID", width: 36 },
          { key: "createdAt", label: "CREATED", width: 26 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  bindCommand(leaf, EMULATOR_LIST_SESSIONS_CONTRACT);
  return leaf;
}
