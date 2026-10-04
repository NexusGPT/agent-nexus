import type { Command } from "commander";

import { enumInCompositeOption, enumOption } from "../../contract-binding";
import {
  CONVERSATION_LIST__PARAMS_ASSIGNED_TO,
  CONVERSATION_LIST__PARAMS_LAST_MESSAGE_TYPE_IN_ITEM,
  CONVERSATION_LIST__PARAMS_RESPONSE_HANDLING,
  CONVERSATION_LIST__PARAMS_STATUS,
  CONVERSATION_LIST__PARAMS_TICKET_STATUS,
  CONVERSATION_LIST__PARAMS_TICKET_STATUS_IN_ITEM,
  CONVERSATION_LIST__PARAMS_TICKET_STATUS_NOT
} from "../conversation.contract.generated";

/**
 * The FILTER half of `nexus conversation list`. Pagination stays on the command
 * itself, where its own cap is stated.
 */
export function addConversationListFilterOptions(list: Command): Command {
  return (
    list
      .addOption(
        enumOption("--status <status>", "Filter by status", CONVERSATION_LIST__PARAMS_STATUS)
      )
      .addOption(
        enumOption(
          "--ticket-status <status>",
          "Filter by ticket status",
          CONVERSATION_LIST__PARAMS_TICKET_STATUS
        )
      )
      .addOption(
        enumOption(
          "--response-handling <mode>",
          "Filter by response handling",
          CONVERSATION_LIST__PARAMS_RESPONSE_HANDLING
        )
      )
      // COMMA-SEPARATED, so commander cannot validate it: `.choices()` compares
      // the whole token, and "SUBMITTED,RESOLVED" is no member of any enum. The
      // binding is recorded and the values are rendered into the description,
      // which is the honest half-measure — a bad item is still refused by the
      // server, not here.
      .addOption(
        enumInCompositeOption(
          "--ticket-status-in <a,b,c>",
          "Filter by ticket status, comma-separated",
          CONVERSATION_LIST__PARAMS_TICKET_STATUS_IN_ITEM,
          "each item"
        )
      )
      .addOption(
        enumOption(
          "--ticket-status-not <status>",
          "Exclude a ticket status",
          CONVERSATION_LIST__PARAMS_TICKET_STATUS_NOT
        )
      )
      .option("--deployment-id <id>", "Filter by deployment ID")
      .addOption(
        enumOption(
          "--assigned-to <filter>",
          "Filter by assignment",
          CONVERSATION_LIST__PARAMS_ASSIGNED_TO
        )
      )
      .option("--search <query>", "Search by topic or message content")
      .option(
        "--last-message-before <iso>",
        "Only conversations whose last message is older than this ISO date"
      )
      .option(
        "--last-message-after <iso>",
        "Only conversations whose last message is newer than this ISO date"
      )
      .addOption(
        enumInCompositeOption(
          "--last-message-type-in <a,b,c>",
          "Filter by last message role, comma-separated",
          CONVERSATION_LIST__PARAMS_LAST_MESSAGE_TYPE_IN_ITEM,
          "each item"
        )
      )
      .option(
        "--comment-contains <substring>",
        "Only conversations with a comment containing this substring (1–500 chars)"
      )
      .option(
        "--comment-not-contains <substring>",
        "Only conversations with no comment containing this substring (1–500 chars)"
      )
  );
}
