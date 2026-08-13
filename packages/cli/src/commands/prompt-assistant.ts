import type { NexusClient, PromptAssistantChatBody } from "@agent-nexus/sdk";
import { Command } from "commander";

import { createClient, seconds } from "../client";
import { bindCommand, enumOption } from "../contract-binding";
import { handleError } from "../errors";
import { printList, printRecord, printSuccess } from "../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../util/body";
import { confirmable, confirmDestructive } from "../util/confirm";
import { addPaginationOptions, getPaginationParams } from "../util/pagination";
import { resolveInputValue } from "../util/stdin";
import {
  PROMPT_ASSISTANT_CHAT__BODY_MODE,
  PROMPT_ASSISTANT_CHAT_CONTRACT
} from "./prompt-assistant.contract.generated";

/**
 * How long `prompt-assistant chat` waits on the API before giving up. The
 * assistant runs LLM calls that take minutes, so this sits far above the SDK's
 * 30 s default.
 *
 * SECONDS — the unit `createClient` takes, and the unit of the global
 * `--timeout <seconds>` flag it overrides. A MILLISECOND value here is
 * multiplied by 1000 a second time, overflows Node's 32-bit timer, is clamped
 * to 1 ms, and aborts every chat before the request leaves the machine
 * (NEX-3707). `timeoutSecondsToMs` now refuses such a value outright.
 */
const PROMPT_ASSISTANT_DEFAULT_TIMEOUT_SECONDS = seconds(2 * 60 * 60);

/** Poll interval when waiting for the backend to finish processing (2 s). */
const POLL_INTERVAL_MS = 2_000;

/** Maximum time to wait for a processing response (5 min). */
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Poll the thread until the backend finishes processing the LLM response.
 * The backend runs the LLM call asynchronously and adds an assistant message when done.
 * We track the initial message count so multi-turn conversations don't return stale messages.
 */
async function pollForResponse(
  client: NexusClient,
  threadId: string,
  initialMessageCount: number
): Promise<{ threadId: string; response: string; status: string }> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    const thread = await client.promptAssistant.getThread(threadId);

    // Status changed to generating/completed/failed — done
    if (thread.status !== "in_progress") {
      const lastAssistant = [...thread.messages].reverse().find((m) => m.role === "assistant");
      return {
        threadId: thread.threadId,
        response: lastAssistant?.content ?? "",
        status: thread.status
      };
    }

    // New messages appeared and the latest is from the assistant — the LLM call finished
    if (thread.messages.length > initialMessageCount) {
      const lastMessage = thread.messages[thread.messages.length - 1];
      if (lastMessage && lastMessage.role === "assistant") {
        return {
          threadId: thread.threadId,
          response: lastMessage.content,
          status: thread.status
        };
      }
    }
  }

  throw new Error("Timed out waiting for assistant response");
}

export function registerPromptAssistantCommands(program: Command): void {
  const pa = program.command("prompt-assistant").description("AI-powered prompt writing assistant");

  // ── chat ────────────────────────────────────────────────────────────────
  const chat = pa
    .command("chat")
    .description("Send a message to the prompt assistant")
    .option("--message <text-or->", "Message text (or '-' for stdin)")
    .addOption(
      enumOption(
        "--mode <mode>",
        "Which assistant answers this turn",
        PROMPT_ASSISTANT_CHAT__BODY_MODE
      )
    )
    .option("--thread-id <id>", "Thread ID for multi-turn conversations")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus prompt-assistant chat --message "Create a customer support agent" --mode agent
  $ nexus prompt-assistant chat --message "Improve the prompt" --mode agent --thread-id 3f2a9c7e-1b4d-4a8e-9c0f-5d6e7a8b9c01
  $ echo "Write a summarization task" | nexus prompt-assistant chat --message - --mode ai-task
  $ nexus prompt-assistant chat --body '{"message":"Help me","mode":"agent"}'

Notes:
  --mode IS REQUIRED ON EVERY CALL, follow-ups included: omitting it is a 400.
  It picks the assistant for THIS turn and is NOT checked against the thread, so
  a follow-up sent under the other mode runs the other assistant over the same
  history and nothing objects. Pass the mode the thread was opened with.

  --thread-id IS A UUID, AND AN UNRECOGNISED ONE OPENS A NEW THREAD. A valid
  uuid that names no thread is not an error — the reply comes back with none of
  the context you meant to continue, under a threadId you did not send. Check
  the threadId in the response.

  THIS COMMAND AUTO-POLLS AND CAN TAKE MINUTES. The API returns immediately with
  an empty response; the CLI then polls the thread for you and prints the reply.
  NEVER RESEND ON AN APPARENT HANG — a resend is a second user turn on the same
  thread and the assistant answers it as one.

  TWO DIFFERENT WAITS CAN END THIS COMMAND, and only one of them is the flag's.
  The POLL gives up after ${POLL_TIMEOUT_MS / 60_000} minutes and is not
  configurable. The HTTP request is given ${PROMPT_ASSISTANT_DEFAULT_TIMEOUT_SECONDS}s,
  which the global --timeout <seconds> overrides.

  EITHER WAY THE WORK IS STILL RUNNING SERVER-SIDE. Do NOT open a second thread:
  recover the id with "prompt-assistant list-threads" and keep polling with
  "prompt-assistant get-thread <id>".

  STATUS is in_progress, generating, completed or failed (list-threads may also
  report cancelled). generating means the reply is in but the PROMPT is still
  being written — the prompt arrives on get-thread as promptResult, not here.`
    )
    .action(async (opts) => {
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

        const result = await client.promptAssistant.chat(
          asRequestBody<PromptAssistantChatBody>(body)
        );

        // The backend processes chat messages asynchronously — it returns
        // immediately with an empty response. Poll until the assistant reply appears.
        // Add 1 for the user message the backend just saved.
        const expectedCount = initialMessageCount + 1;
        if (!result.response && result.threadId) {
          const final = await pollForResponse(client, result.threadId, expectedCount);
          printRecord(final);
        } else {
          printRecord(result);
        }
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── list-threads ────────────────────────────────────────────────────────
  addPaginationOptions(
    pa
      .command("list-threads")
      .description("List prompt assistant threads (newest first) — recover a lost thread ID")
      .addHelpText(
        "after",
        `
Examples:
  $ nexus prompt-assistant list-threads
  $ nexus prompt-assistant list-threads --limit 5 --json

Notes:
  Use this to recover a thread whose ID was lost (e.g. a chat call killed
  before its response was read). Results are paginated; check meta.hasMore.`
      )
  ).action(async (opts) => {
    try {
      const client = createClient(program.optsWithGlobals());
      const { data, meta } = await client.promptAssistant.listThreads(getPaginationParams(opts));

      printList(data, meta, [
        { key: "threadId", label: "THREAD ID", width: 36 },
        { key: "mode", label: "MODE", width: 8 },
        { key: "status", label: "STATUS", width: 12 },
        { key: "summary", label: "SUMMARY", width: 50 },
        { key: "createdAt", label: "CREATED", width: 24 }
      ]);
    } catch (err) {
      process.exitCode = handleError(err);
    }
  });

  // ── get-thread ──────────────────────────────────────────────────────────
  pa.command("get-thread")
    .description("Get a prompt assistant thread with messages")
    .argument("<thread-id>", "Thread ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus prompt-assistant get-thread 3f2a9c7e-1b4d-4a8e-9c0f-5d6e7a8b9c01
  $ nexus prompt-assistant get-thread 3f2a9c7e-1b4d-4a8e-9c0f-5d6e7a8b9c01 --json

Notes:
  THIS IS THE POLL. Generation is asynchronous, so re-run this command until
  status is completed or failed — do not open a second thread and do not resend
  the message.
  promptResult IS ABSENT UNTIL status IS completed. Its absence is "not ready",
  never "no prompt was produced".
  promptResult.prompt IS A MARKDOWN STRING. Use it verbatim as an agent or task
  prompt — do NOT JSON.parse it.
  The thread id is a UUID; lost ones are recovered with
  "prompt-assistant list-threads".`
    )
    .action(async (threadId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const t = await client.promptAssistant.getThread(threadId);
        printRecord(t, [
          { key: "threadId", label: "ID" },
          { key: "status", label: "Status" },
          { key: "messages", label: "Messages" },
          { key: "promptResult", label: "Prompt Result" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── delete-thread ───────────────────────────────────────────────────────
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
  a thread on the assumption that nobody objected.`
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

  // Bound LAST, after every option and after the hand-written prose.
  bindCommand(chat, PROMPT_ASSISTANT_CHAT_CONTRACT);
}
