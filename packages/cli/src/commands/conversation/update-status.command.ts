import type { UpdateConversationStatusesBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand, enumOption } from "../../contract-binding";
import { handleError } from "../../errors";
import { printRecord } from "../../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../../util/body";
import {
  CONVERSATION_UPDATE_STATUSES__BODY_RESPONSE_HANDLING,
  CONVERSATION_UPDATE_STATUSES__BODY_STATUS,
  CONVERSATION_UPDATE_STATUSES__BODY_TICKET_STATUS,
  CONVERSATION_UPDATE_STATUSES_CONTRACT
} from "../conversation.contract.generated";

/** `nexus conversation update-status` */
export function registerConversationUpdateStatusCommand(
  conversation: Command,
  program: Command
): void {
  const updateStatus = conversation
    .command("update-status")
    .description("Update conversation status, ticket status, or response handling")
    .argument("<id>", "Conversation ID")
    .addOption(
      enumOption("--status <status>", "New status", CONVERSATION_UPDATE_STATUSES__BODY_STATUS)
    )
    .addOption(
      enumOption(
        "--ticket-status <status>",
        "New ticket status",
        CONVERSATION_UPDATE_STATUSES__BODY_TICKET_STATUS
      )
    )
    .addOption(
      enumOption(
        "--response-handling <mode>",
        "New response handling",
        CONVERSATION_UPDATE_STATUSES__BODY_RESPONSE_HANDLING
      )
    )
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus conversation update-status 11111111-1111-4111-8111-111111111111 --status ARCHIVED
  $ nexus conversation update-status 11111111-1111-4111-8111-111111111111 --ticket-status RESOLVED
  $ nexus conversation update-status 11111111-1111-4111-8111-111111111111 --response-handling MANUAL

Notes:
  --response-handling DECIDES WHETHER THE AGENT STILL ANSWERS THIS CUSTOMER.
  AUTO replies on its own; ON_APPROVAL drafts and waits for a human; MANUAL
  stops it replying at all. Set MANUAL while a human takes over, and set it
  back, or the conversation stays silent with nothing reporting why.
  --status ARCHIVED does not stop the agent — only --response-handling does.
  --status takes OPEN, RUNNING or ARCHIVED. DELETED is refused here; closing
  is "conversation close".
  Each flag is independent and omitted ones are untouched. Sending none is
  accepted and changes nothing.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, {
          ...(opts.status !== undefined && { status: opts.status }),
          ...(opts.ticketStatus !== undefined && { ticketStatus: opts.ticketStatus }),
          ...(opts.responseHandling !== undefined && { responseHandling: opts.responseHandling })
        });

        const conv = await client.conversations.updateStatuses(
          id,
          asRequestBody<UpdateConversationStatusesBody>(body)
        );
        printRecord(conv, [
          { key: "id", label: "ID" },
          { key: "status", label: "Status" },
          { key: "ticketStatus", label: "Ticket Status" },
          { key: "responseHandling", label: "Response Handling" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists.
  bindCommand(updateStatus, CONVERSATION_UPDATE_STATUSES_CONTRACT);
}
