import type { PromptAssistantChatBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { color, isJsonMode, printRecord } from "../../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../../util/body";
import { resolveInputValue } from "../../util/stdin";
import { waitDocument } from "./_shared/wait-document";
import { waitExitCode } from "./_shared/wait-exit-code";
import { waitOptions } from "./_shared/wait-options";
import { PROMPT_ASSISTANT_DEFAULT_TIMEOUT_SECONDS } from "./_shared/wait-timings";

/** Everything `nexus prompt-assistant chat` reads off the command line. */
export interface PromptAssistantChatOptions {
  message?: string;
  mode?: string;
  threadId?: string;
  body?: string;
  wait?: boolean;
  waitTimeout?: number;
}

/** The `nexus prompt-assistant chat` action. */
export async function runPromptAssistantChat(
  program: Command,
  opts: PromptAssistantChatOptions
): Promise<void> {
  try {
    const globals = program.optsWithGlobals();
    const client = createClient({
      ...globals,
      timeout: globals.timeout ?? PROMPT_ASSISTANT_DEFAULT_TIMEOUT_SECONDS
    });
    const base = await resolveBody(opts.body);
    const flags: Record<string, unknown> = {};
    if (opts.mode) flags.mode = opts.mode;
    if (opts.threadId) flags.threadId = opts.threadId;
    if (opts.message) flags.message = await resolveInputValue(opts.message);
    const body = mergeBodyWithFlags(base, flags);

    // Snapshot message count before sending so we can detect new messages
    let initialMessageCount = 0;
    if (opts.threadId) {
      try {
        const existing = await client.promptAssistant.getThread(opts.threadId);
        initialMessageCount = existing.messages?.length ?? 0;
      } catch {
        /* thread may not exist yet */
      }
    }

    const result = await client.promptAssistant.chat(asRequestBody<PromptAssistantChatBody>(body));

    // The backend processes chat messages asynchronously — it returns
    // immediately with an empty response. Wait until the thread reaches the
    // state this invocation asked for, then print THAT, never the empty
    // acknowledgement the POST came back with.
    if (!result.response && result.threadId) {
      const waited = await client.promptAssistant.waitForThread(
        result.threadId,
        waitOptions(opts, initialMessageCount)
      );
      printRecord(waitDocument(waited));
      if (!isJsonMode() && !opts.wait && waited.thread.status === "generating") {
        // The one outcome that looks like success and is not: the reply is
        // in, the prompt is not, and nothing else here says so.
        console.error(
          color.dim(
            `Prompt still generating. Get it with: nexus prompt-assistant get-thread ${result.threadId} --wait`
          )
        );
      }
      const code = waitExitCode(waited, result.threadId);
      if (code !== 0) process.exitCode = code;
    } else {
      printRecord(result);
    }
  } catch (err) {
    process.exitCode = handleError(err);
  }
}
