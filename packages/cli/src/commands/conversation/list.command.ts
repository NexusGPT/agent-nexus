import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { printList } from "../../output";
import { getPaginationParams } from "../../util/pagination";
import { CONVERSATION_LIST_CONTRACT } from "../conversation.contract.generated";
import { splitCsv } from "./_shared/split-csv";
import { LIST_NOTES } from "./copy/list-notes";
import { addConversationListFilterOptions } from "./list.filter-options";

/** `nexus conversation list` */
export function registerConversationListCommand(conversation: Command, program: Command): void {
  const list = addConversationListFilterOptions(
    conversation.command("list").description("List conversations")
  )
    // Declared here rather than through addPaginationOptions so the cap can be
    // stated; see the same note on `deployment list`.
    .option("--page <number>", "Page number (default 1)", parseInt)
    .option("--limit <number>", "Items per page — 1-100, default 20", parseInt)
    .addHelpText("after", LIST_NOTES)
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const { data, meta } = await client.conversations.list({
          ...getPaginationParams(opts),
          status: opts.status,
          ticketStatus: opts.ticketStatus,
          ticketStatusIn: splitCsv(opts.ticketStatusIn),
          ticketStatusNot: opts.ticketStatusNot,
          responseHandling: opts.responseHandling,
          deploymentId: opts.deploymentId,
          assignedTo: opts.assignedTo,
          search: opts.search,
          lastMessageBefore: opts.lastMessageBefore,
          lastMessageAfter: opts.lastMessageAfter,
          lastMessageTypeIn: splitCsv(opts.lastMessageTypeIn),
          commentContains: opts.commentContains,
          commentNotContains: opts.commentNotContains
        });

        printList(data, meta, [
          { key: "id", label: "ID", width: 36 },
          { key: "topic", label: "TOPIC", width: 30 },
          { key: "status", label: "STATUS", width: 10 },
          { key: "ticketStatus", label: "TICKET", width: 22 },
          { key: "responseHandling", label: "HANDLING", width: 14 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists.
  bindCommand(list, CONVERSATION_LIST_CONTRACT);
}
