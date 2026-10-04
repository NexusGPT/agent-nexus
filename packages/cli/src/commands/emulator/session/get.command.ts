import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printRecord } from "../../../output";

/** `nexus emulator session get` — reaches a route the v1 contract does not declare. */
export function registerEmulatorSessionGetCommand(session: Command, program: Command): Command {
  const leaf = session
    .command("get")
    .description("Get emulator session details (with messages)")
    .argument("<deployment-id>", "Deployment ID")
    .argument("<session-id>", "Session ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus emulator session get 44444444-4444-4444-8444-444444444444 33333333-3333-4333-8333-333333333333
  $ nexus emulator session get 44444444-4444-4444-8444-444444444444 33333333-3333-4333-8333-333333333333 --json

Notes:
  THIS IS WHERE A "processing" TURN LANDS. When "emulator send" gives up
  waiting the agent keeps running and writes its reply here — re-read this
  until the reply appears rather than re-sending, which starts a second turn.
  It is also the only way to read a replayed scenario's result.
  Carries the full message list, so --json is the useful form.`
    )
    .action(async (deploymentId: string, sessionId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const s = await client.emulator.getSession(deploymentId, sessionId);
        printRecord(s, [
          { key: "id", label: "ID" },
          { key: "deploymentId", label: "Deployment ID" },
          { key: "messages", label: "Messages" },
          { key: "createdAt", label: "Created" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  return leaf;
}
