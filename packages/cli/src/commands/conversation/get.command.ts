import type { SatisfactionMode } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand, enumOption } from "../../contract-binding";
import { handleError } from "../../errors";
import { printRecord } from "../../output";
import {
  CONVERSATION_GET__PARAMS_SATISFACTION,
  CONVERSATION_GET_CONTRACT
} from "../conversation.contract.generated";
import { SATISFACTION_MODES } from "./_shared/satisfaction-modes";

/** `nexus conversation get` */
export function registerConversationGetCommand(conversation: Command, program: Command): void {
  const get = conversation
    .command("get")
    .description("Get conversation details")
    .argument("<id>", "Conversation ID (UUID or nanoId)")
    // The MEANING of each mode stays here; commander prints the values from the
    // contract, so they are not spelled a second time.
    .addOption(
      enumOption(
        "--satisfaction <mode>",
        "Project satisfaction on the response: 'latest' is the most-recent score, " +
          "'all' the full history, 'summary' the latest plus totalCount",
        CONVERSATION_GET__PARAMS_SATISFACTION
      )
    )
    .addHelpText(
      "after",
      `
Examples:
  $ nexus conversation get 11111111-1111-4111-8111-111111111111
  $ nexus conversation get 11111111-1111-4111-8111-111111111111 --json
  $ nexus conversation get 11111111-1111-4111-8111-111111111111 --satisfaction latest --json
  $ nexus conversation get 11111111-1111-4111-8111-111111111111 --satisfaction summary --json

Notes:
  Carries no messages — "conversation messages <id>" is a separate read.
  A CLOSED CONVERSATION IS STILL READABLE HERE, unlike in "conversation list"
  where it never appears. Its status reads DELETED, which is a status a read
  reports and no write can set — "conversation update-status" refuses it.
  --satisfaction is off by default and costs an extra read: "latest" is the
  most recent score, "all" the full history, "summary" the latest plus a
  totalCount. Nothing is projected without it — an absent field means you did
  not ask, not that the customer gave no rating.
  A nanoId works here and is what a customer quoting their conversation gives
  you.`
    )
    .action(async (id: string, opts: { satisfaction?: string }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        // Client-side narrow: SDK accepts the union type only, and a typo
        // ("latests") would otherwise round-trip to the API and come back
        // as a Zod 400 — louder + cheaper to reject here.
        let satisfaction: SatisfactionMode | undefined;
        if (opts.satisfaction !== undefined) {
          if (!(SATISFACTION_MODES as readonly string[]).includes(opts.satisfaction)) {
            throw new Error(
              `--satisfaction must be one of: ${SATISFACTION_MODES.join(", ")} (got '${opts.satisfaction}')`
            );
          }
          satisfaction = opts.satisfaction as SatisfactionMode;
        }
        const conv = await client.conversations.get(
          id,
          satisfaction ? { satisfaction } : undefined
        );
        printRecord(conv, [
          { key: "id", label: "ID" },
          { key: "topic", label: "Topic" },
          { key: "status", label: "Status" },
          { key: "ticketStatus", label: "Ticket Status" },
          { key: "responseHandling", label: "Response Handling" },
          { key: "deploymentId", label: "Deployment ID" },
          { key: "deploymentName", label: "Deployment" },
          { key: "channelType", label: "Channel" },
          { key: "memberCount", label: "Members" },
          { key: "unread", label: "Unread" },
          { key: "assignedUserIds", label: "Assigned Users" },
          { key: "createdAt", label: "Created" },
          { key: "updatedAt", label: "Updated" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists.
  bindCommand(get, CONVERSATION_GET_CONTRACT);
}
