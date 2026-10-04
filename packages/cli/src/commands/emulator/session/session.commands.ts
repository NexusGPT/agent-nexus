import type { Command } from "commander";

import { registerEmulatorSessionCreateCommand } from "./create.command";
import { registerEmulatorSessionDeleteCommand } from "./delete.command";
import { registerEmulatorSessionGetCommand } from "./get.command";
import { registerEmulatorSessionListCommand } from "./list.command";

/** Builds the `nexus emulator session` sub-group and registers every leaf on it. */
export function registerEmulatorSessionCommands(emulator: Command, program: Command): Command {
  const session = emulator.command("session").description("Manage emulator sessions");

  session.addHelpText(
    "after",
    `
A session is one conversation with a deployment's agent. Create it, send into
it, then read it back — "session get" is where a turn that was still running
when "emulator send" answered eventually lands.

These are real DeploymentSession rows carrying real conversations, but they are
TEST traffic and "nexus deployment stats" excludes them from both of its
counters, so testing a deployment does not move its usage figures. What they DO
reach is the inbox: deleting one archives its conversation rather than erasing
it.

chatId IS THE CONVERSATION ID, AND IT IS THE ONLY LINK BETWEEN A TEST AND THE
INBOX. "session list" and "session get" both carry it under --json and NEITHER
table prints the column; nothing in either namespace is called "conversationId".
Hand it straight to the conversation verbs:

  $ nexus emulator session get <deployment-id> <session-id> --json | jq -r '.chatId'
  $ nexus conversation messages <that-id> --visible-only

"session get" prints its record BARE, so the path is ".chatId"; "session list"
is wrapped, so there it is ".data[].chatId".

IT READS null UNTIL THE FIRST MESSAGE. The field is the session's first chat,
and a session has no chat until something is sent into it — so null on a
freshly created session means "nothing sent yet", never a broken link.

SO DELETING EVERY SESSION DOES NOT CLEAN UP AFTER A TEST. "session list" comes
back empty while the conversations those sessions produced are still there,
ARCHIVED, and still returned by
"conversation list --deployment-id <dep> --status ARCHIVED". Close them one by
one with "conversation close" if the inbox has to be clear.`
  );

  registerEmulatorSessionCreateCommand(session, program);
  registerEmulatorSessionListCommand(session, program);
  registerEmulatorSessionGetCommand(session, program);
  registerEmulatorSessionDeleteCommand(session, program);

  return session;
}
