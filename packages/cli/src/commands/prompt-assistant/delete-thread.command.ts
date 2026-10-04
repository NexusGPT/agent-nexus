import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { confirmable, confirmDestructive } from "../../util/confirm";

/** `nexus prompt-assistant delete-thread` */
export function registerPromptAssistantDeleteThreadCommand(pa: Command, program: Command): void {
  confirmable(pa.command("delete-thread"))
    .description("Delete a prompt assistant thread")
    .argument("<thread-id>", "Thread ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus prompt-assistant delete-thread 3f2a9c7e-1b4d-4a8e-9c0f-5d6e7a8b9c01
  $ nexus prompt-assistant delete-thread 3f2a9c7e-1b4d-4a8e-9c0f-5d6e7a8b9c01 --yes

Notes:
  THE GENERATED PROMPT GOES WITH THE THREAD. promptResult lives on the thread
  and nowhere else, so copy it out before deleting — deleting is the only way to
  lose a prompt you have not applied to an agent or task.
  WITHOUT A TERMINAL THIS REFUSES. A script must pass --yes; it will not delete
  a thread on the assumption that nobody objected.

  ONE THREAD PER CALL — THERE IS NO BULK DELETE AND NO DELETE-BY-STATUS. The
  argument is a single UUID and there is no --status, no --before and no
  --all, here or anywhere in this namespace. Threads accumulate, including ones
  abandoned at "generating", and clearing them is one call per id harvested from
  "prompt-assistant list-threads":
    $ nexus prompt-assistant list-threads --limit 100 --json \\
        | jq -r '.data[] | select(.status=="generating") | .threadId' \\
        | xargs -n1 -I{} nexus prompt-assistant delete-thread {} --yes
  READ THE ROWS BEFORE PIPING THEM. "generating" is a LIVE state, not a stale
  one — the loop above deletes a prompt that is still being written, along with
  every thread whose promptResult you have not copied out.`
    )
    .action(async (threadId: string, opts) => {
      try {
        if (!(await confirmDestructive(`Delete thread ${threadId}?`, opts))) return;

        const client = createClient(program.optsWithGlobals());
        await client.promptAssistant.deleteThread(threadId);
        printSuccess("Thread deleted.", { threadId });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
