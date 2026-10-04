import { Command } from "commander";

import { registerEmulatorScenarioCommands } from "./emulator/scenario/scenario.commands";
import { registerEmulatorSendCommand } from "./emulator/send.command";
import { registerEmulatorSessionCommands } from "./emulator/session/session.commands";

/**
 * `nexus emulator` — talk to a real deployment without going through its channel.
 *
 * Three groups, registered in this order: the `session` sub-group, the
 * top-level `send` leaf between them, and the `scenario` sub-group. Each leaf
 * lives in its own file and binds its own contract as its last act; `session
 * get`, `send` and `scenario replay` reach routes the v1 contract does not
 * declare and so bind none, which each of those three files states for itself.
 */
export function registerEmulatorCommands(program: Command): void {
  const emulator = program.command("emulator").description("Test deployments via the emulator");

  emulator.addHelpText(
    "after",
    `
Talk to a real deployment's real agent without going through its channel. The
agent, its tools, its knowledge and its billing are the live ones — only the
transport is emulated, so a tool that sends email really sends email.

  session create <dep>  →  send <dep> <session> --text "..."  →  session get

READ THE "status" FIELD "send" RETURNS. "completed" and "failed" are finished
turns; "processing" means the agent is still running. THE REPLY IS NOT IN THE
SEND RESPONSE ON ANY STATUS — "emulator session get" is where every reply is
read, not just a slow one.

Scenarios record a session's messages so they can be replayed against another
deployment. Replay is asynchronous and answers with a NEW session id.

Reads need emulator:read, creating sessions and scenarios emulator:write,
sending and replaying emulator:execute, the two deletes emulator:delete.`
  );

  registerEmulatorSessionCommands(emulator, program);
  registerEmulatorSendCommand(emulator, program);
  registerEmulatorScenarioCommands(emulator, program);
}
