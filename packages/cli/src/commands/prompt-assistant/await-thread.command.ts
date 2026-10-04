import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printEnvelope, printRecord } from "../../output";
import { GET_THREAD_FIELDS } from "./_shared/get-thread-fields";
import { parseAfterMessageCount, parseAwaitSeconds } from "./_shared/parsers";
import { waitExitCode } from "./_shared/wait-exit-code";
import { MAX_AWAIT_SECONDS } from "./_shared/wait-timings";
import { PROMPT_ASSISTANT_AWAIT_THREAD_HELP } from "./await-thread.help";

/** `nexus prompt-assistant await-thread` */
export function registerPromptAssistantAwaitThreadCommand(pa: Command, program: Command): void {
  pa.command("await-thread")
    .description("Hold ONE request open on the server until the thread finishes")
    .argument("<thread-id>", "Thread ID")
    // NOT `--timeout`: that is a GLOBAL option, and the root parses its options
    // across the whole of argv, so a subcommand flag sharing the name never
    // receives a value — it silently retunes the CLI's own transport instead.
    .option(
      "--wait-timeout <seconds>",
      `How long the SERVER holds the request, 1..${MAX_AWAIT_SECONDS} (default ${MAX_AWAIT_SECONDS})`,
      parseAwaitSeconds
    )
    .option(
      "--after-message-count <n>",
      "Message count observed BEFORE the turn you are waiting on was sent",
      parseAfterMessageCount
    )
    .addHelpText("after", PROMPT_ASSISTANT_AWAIT_THREAD_HELP)
    .action(async (threadId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.promptAssistant.awaitThread(threadId, {
          timeoutSeconds: opts.waitTimeout,
          afterMessageCount: opts.afterMessageCount
        });

        // The server's own wait response: {thread, outcome, waitedMs}. `outcome`
        // is the answer to "did it finish", and a `--json` caller could not read
        // it before NEX-4139 — it existed only as this process's exit code.
        printEnvelope(result, () => {
          printRecord(result.thread, GET_THREAD_FIELDS);
        });
        // The hint carries the FLAGS BACK, not just the id. Resuming without
        // `--after-message-count` reopens the stale-verdict trap the flag
        // closes, and resuming without `--wait-timeout` silently changes the
        // hold the caller asked for.
        const code = waitExitCode(
          result,
          threadId,
          [
            `nexus prompt-assistant await-thread ${threadId}`,
            opts.waitTimeout === undefined ? "" : ` --wait-timeout ${opts.waitTimeout}`,
            opts.afterMessageCount === undefined
              ? ""
              : ` --after-message-count ${opts.afterMessageCount}`
          ].join("")
        );
        if (code !== 0) process.exitCode = code;
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
