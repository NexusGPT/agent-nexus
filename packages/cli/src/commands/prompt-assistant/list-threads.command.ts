import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printList } from "../../output";
import { addPaginationOptions, getPaginationParams } from "../../util/pagination";

/** `nexus prompt-assistant list-threads` */
export function registerPromptAssistantListThreadsCommand(pa: Command, program: Command): void {
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
  before its response was read). Results are paginated; check meta.paging.

  SUMMARY IS NOT ASSISTANT-WRITTEN, AND IT CHANGES MEANING WITH status. The
  server sends the generated promptResult.name once there is one, and until then
  it echoes YOUR OWN first message — whitespace collapsed, cut at 140 characters
  with a trailing "…", or "(no messages)" on an empty thread. So a row that
  reads like a title means a promptResult is stored, and a row that reads like a
  request means none is. Read STATUS for whether it is ready — a thread can hold
  an earlier turn's promptResult while the current turn is still running.
  Never match on summary to find a thread: two threads
  opened with the same sentence carry the same summary. Match on threadId.`
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
}
