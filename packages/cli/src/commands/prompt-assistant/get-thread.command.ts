import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printEnvelope, printRecord } from "../../output";
import { GET_THREAD_FIELDS } from "./_shared/get-thread-fields";
import { parseWaitSeconds } from "./_shared/parsers";
import { waitExitCode } from "./_shared/wait-exit-code";
import { waitOptions } from "./_shared/wait-options";
import { DEFAULT_WAIT_SECONDS } from "./_shared/wait-timings";
import { PROMPT_ASSISTANT_GET_THREAD_HELP } from "./get-thread.help";

/** `nexus prompt-assistant get-thread` */
export function registerPromptAssistantGetThreadCommand(pa: Command, program: Command): void {
  pa.command("get-thread")
    .description("Get a prompt assistant thread with messages")
    .argument("<thread-id>", "Thread ID")
    .option("--wait", "Block until the thread is finished, then print the prompt")
    .option(
      "--wait-timeout <seconds>",
      `How long --wait blocks (default ${DEFAULT_WAIT_SECONDS})`,
      parseWaitSeconds
    )
    .addHelpText("after", PROMPT_ASSISTANT_GET_THREAD_HELP)
    .action(async (threadId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        if (!opts.wait) {
          const t = await client.promptAssistant.getThread(threadId);
          // The thread IS the response here, so this envelope narrows nothing
          // and the document is byte-for-byte what `printRecord` emitted. It is
          // `printEnvelope` so that BOTH branches answer one derivable shape —
          // otherwise the `--wait` branch below would leave this command with
          // two, and the generated `--help` line would describe one of them.
          printEnvelope(t, () => {
            printRecord(t, GET_THREAD_FIELDS);
          });
          return;
        }

        // No `afterMessageCount`: no turn was sent here, so a terminal status is
        // the whole answer and there is no reply to settle on.
        const waited = await client.promptAssistant.waitForThread(threadId, waitOptions(opts));
        // `outcome` is what the wait actually DID — settled, still generating,
        // or out of time — and until NEX-4139 it survived only as the process
        // exit code, which a pipeline reads long after it has parsed stdout.
        printEnvelope(waited, () => {
          printRecord(waited.thread, GET_THREAD_FIELDS);
        });
        const code = waitExitCode(waited, threadId);
        if (code !== 0) process.exitCode = code;
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
