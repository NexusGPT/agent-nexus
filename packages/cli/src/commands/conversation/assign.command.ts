import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { ASSIGN_NOTES } from "./copy/assign-notes";

/** `nexus conversation assign` */
export function registerConversationAssignCommand(conversation: Command, program: Command): void {
  conversation
    .command("assign")
    .description("Set assigned users on a conversation (replaces existing)")
    .argument("<id>", "Conversation ID")
    .option("--user-ids <ids...>", "User IDs to assign (space-separated)")
    .option("--clear", "Remove every assignee, leaving the conversation unassigned")
    .addHelpText("after", ASSIGN_NOTES)
    .action(async (id: string, opts) => {
      try {
        const rawIds = opts.userIds as string[] | undefined;
        const clear = opts.clear === true;

        if (clear && rawIds !== undefined) {
          throw new Error("Pass either --user-ids or --clear, not both");
        }
        if (!clear && rawIds === undefined) {
          throw new Error(
            "Provide --user-ids to set the assignees, or --clear to remove them all. " +
              "This replaces the whole list, so it will not default to empty."
          );
        }

        const userIds = clear ? [] : (rawIds ?? []);
        // A blank arrives from an unset shell variable, not from a person. The
        // server treats it as a malformed id and surfaces a persistence error,
        // so refusing here is both earlier and legible.
        const blanks = userIds.filter((u) => u.trim().length === 0).length;
        if (blanks > 0) {
          throw new Error(
            `--user-ids contains ${blanks} blank value(s). Use --clear to unassign everyone.`
          );
        }

        const client = createClient(program.optsWithGlobals());
        const conv = await client.conversations.setAssignedUsers(id, { userIds });
        printSuccess(clear ? "Assignees cleared." : "Users assigned.", {
          conversationId: id,
          assignedUserIds: conv.assignedUserIds
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
