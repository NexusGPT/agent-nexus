import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand } from "../../../contract-binding";
import { handleError } from "../../../errors";
import { printSuccess } from "../../../output";
import { confirmable, confirmDestructive } from "../../../util/confirm";
import { EMULATOR_DELETE_SESSION_CONTRACT } from "../../emulator.contract.generated";

/** `nexus emulator session delete` */
export function registerEmulatorSessionDeleteCommand(session: Command, program: Command): Command {
  const leaf = confirmable(session.command("delete"))
    .description("Delete an emulator session")
    .argument("<deployment-id>", "Deployment ID")
    .argument("<session-id>", "Session ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus emulator session delete 44444444-4444-4444-8444-444444444444 33333333-3333-4333-8333-333333333333
  $ nexus emulator session delete 44444444-4444-4444-8444-444444444444 33333333-3333-4333-8333-333333333333 --yes

Notes:
  THE API ANSWERS 204 WITH NO BODY, unlike the agent-family deletes which
  answer {id, deleted: true} at 200. Nothing from the server is echoed back, so
  the exit code is the whole confirmation — the {"success": true, ...} that
  --json prints is this command's own line, not a server response.
  THE CONVERSATION IS ARCHIVED, NOT DELETED. Only the session row goes; the
  chat it produced is set to ARCHIVED and survives, so this is not a way to
  erase what was said. A scenario saved from this session is untouched and
  stays replayable — it holds its own copy of the messages.
  --yes IS REQUIRED IN A SCRIPT. With no terminal to answer on, this REFUSES
  and exits non-zero rather than acting.`
    )
    .action(async (deploymentId: string, sessionId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        if (!(await confirmDestructive(`Delete emulator session ${sessionId}?`, opts))) return;

        await client.emulator.deleteSession(deploymentId, sessionId);
        printSuccess("Session deleted.", { sessionId });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  bindCommand(leaf, EMULATOR_DELETE_SESSION_CONTRACT);
  return leaf;
}
