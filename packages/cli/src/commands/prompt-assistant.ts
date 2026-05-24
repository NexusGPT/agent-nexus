import type { NexusClient } from "@agent-nexus/sdk";
import { Command } from "commander";

import { createClient } from "../client";
import { handleError } from "../errors";
import { printList, printRecord, printSuccess } from "../output";
import { mergeBodyWithFlags, resolveBody } from "../util/body";
import { addPaginationOptions, getPaginationParams } from "../util/pagination";
import { resolveInputValue } from "../util/stdin";

/** Prompt assistant involves LLM calls that can take minutes. Use a 2-hour timeout. */
const PROMPT_ASSISTANT_TIMEOUT_MS = 2 * 60 * 60 * 1000;

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
  pa.command("chat")
    .description("Send a message to the prompt assistant")
    .option("--message <text-or->", "Message text (or '-' for stdin)")
    .option("--mode <mode>", "Mode: agent or ai-task")
    .option("--thread-id <id>", "Thread ID for multi-turn conversations")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus prompt-assistant chat --message "Create a customer support agent" --mode agent
  $ nexus prompt-assistant chat --message "Improve the prompt" --thread-id thr-123
  $ echo "Write a summarization task" | nexus prompt-assistant chat --message - --mode ai-task
  $ nexus prompt-assistant chat --body '{"message":"Help me","mode":"agent"}'`
    )
    .action(async (opts) => {
      try {
        const client = createClient({
          ...program.optsWithGlobals(),
          timeout: PROMPT_ASSISTANT_TIMEOUT_MS
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

        const result = await client.promptAssistant.chat(body as any);

        // The backend processes chat messages asynchronously — it returns
        // immediately with an empty response. Poll until the assistant reply appears.
        // Add 1 for the user message the backend just saved.
        const expectedCount = initialMessageCount + 1;
        if (!result.response && result.threadId) {
          const final = await pollForResponse(client, result.threadId, expectedCount);
          printRecord(final as unknown as Record<string, unknown>);
        } else {
          printRecord(result as unknown as Record<string, unknown>);
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

      printList(
        data as unknown as Record<string, unknown>[],
        meta as unknown as Record<string, unknown>,
        [
          { key: "threadId", label: "THREAD ID", width: 36 },
          { key: "mode", label: "MODE", width: 8 },
          { key: "status", label: "STATUS", width: 12 },
          { key: "summary", label: "SUMMARY", width: 50 },
          { key: "createdAt", label: "CREATED", width: 24 }
        ]
      );
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
  $ nexus prompt-assistant get-thread thr-123
  $ nexus prompt-assistant get-thread thr-123 --json`
    )
    .action(async (threadId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const t = await client.promptAssistant.getThread(threadId);
        printRecord(t as unknown as Record<string, unknown>, [
          { key: "id", label: "ID" },
          { key: "mode", label: "Mode" },
          { key: "messages", label: "Messages" },
          { key: "promptResult", label: "Prompt Result" },
          { key: "createdAt", label: "Created" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── delete-thread ───────────────────────────────────────────────────────
  pa.command("delete-thread")
    .description("Delete a prompt assistant thread")
    .argument("<thread-id>", "Thread ID")
    .option("--yes", "Skip confirmation")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus prompt-assistant delete-thread thr-123
  $ nexus prompt-assistant delete-thread thr-123 --yes`
    )
    .action(async (threadId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        if (!opts.yes && process.stdout.isTTY) {
          const readline = await import("node:readline/promises");
          const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
          const answer = await rl.question(`Delete thread ${threadId}? [y/N] `);
          rl.close();
          if (answer.toLowerCase() !== "y") {
            console.log("Aborted.");
            return;
          }
        }

        await client.promptAssistant.deleteThread(threadId);
        printSuccess("Thread deleted.", { threadId });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
