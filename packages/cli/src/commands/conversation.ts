import { Command } from "commander";

import { registerConversationAssignCommand } from "./conversation/assign.command";
import { registerConversationAssignedUsersCommand } from "./conversation/assigned-users.command";
import { registerConversationCloseCommand } from "./conversation/close.command";
import { registerConversationCommentCommand } from "./conversation/comment.command";
import { registerConversationCommentsCommand } from "./conversation/comments.command";
import { registerConversationGetCommand } from "./conversation/get.command";
import { registerConversationGetMetadataCommand } from "./conversation/get-metadata.command";
import { registerConversationListCommand } from "./conversation/list.command";
import { registerConversationMarkAsReadCommand } from "./conversation/mark-as-read.command";
import { registerConversationMessagesCommand } from "./conversation/messages.command";
import { registerConversationSearchCommand } from "./conversation/search.command";
import { registerConversationSendMessageCommand } from "./conversation/send-message.command";
import { registerConversationSendTemplateCommand } from "./conversation/send-template.command";
import { registerConversationUpdateMetadataCommand } from "./conversation/update-metadata.command";
import { registerConversationUpdateStatusCommand } from "./conversation/update-status.command";
import { registerConversationUpdateTopicCommand } from "./conversation/update-topic.command";

export function registerConversationCommands(program: Command): void {
  const conversation = program
    .command("conversation")
    .description("Manage inbox conversations (list, search, reply, assign, close)");

  conversation.addHelpText(
    "after",
    `
EVERY <id> HERE TAKES EITHER FORM: the UUID or the short nanoId (XXXXX_XXXXX)
a customer sees. Anything else is a 400, and an id from another organization
is a 404 — the two are never distinguished.
NOT EVERY CONVERSATION HAS A nanoId. Only some creation paths mint one, and an
emulator conversation is created without, so its nanoId reads null in
"conversation get" and "conversation list". Where it is null the short form
simply does not exist — use the UUID. Never derive one from the id.

WHAT THE AGENT STORED IS NOT WHAT THE CUSTOMER SAW. A tool-using conversation
records the runtime's own working memory — tool calls, tool results, internal
turns — as AGENT rows alongside the real replies. Roughly half of them were
never delivered. Pass --visible-only to "conversation messages" whenever the
question is what the customer actually received.

"conversation send-message" posts as your organization to the real channel.
"conversation comment" is internal and the customer never sees it.

THREE COMMANDS IN THIS NAMESPACE PAGE, AND NO TWO OF THEM CARRY THE SAME meta.
Under --json every one answers {"data":[…]} and the difference is what sits
beside it, so a script written against one silently reads undefined on the next:

  conversation list      meta = {total, page, paging}
                         NO limit and NO totalPages — "deployment list" carries
                         all five, and this one does not.
  conversation messages  meta = {hasMore, nextBefore}
                         NO total and NO page; nextBefore is the opaque cursor.
  conversation search    NO meta KEY AT ALL. It does not page — see its own
                         notes for the cap that replaces paging.

Read hasMore where it exists and never derive "that was the last page" from a
row count. "conversation comments" is unpaginated and also carries no meta.

Reads need conversations:read, writes conversations:write, and "close" needs
conversations:delete.`
  );

  registerConversationListCommand(conversation, program);
  registerConversationGetCommand(conversation, program);
  registerConversationMessagesCommand(conversation, program);
  registerConversationSearchCommand(conversation, program);
  registerConversationUpdateStatusCommand(conversation, program);
  registerConversationUpdateTopicCommand(conversation, program);
  registerConversationGetMetadataCommand(conversation, program);
  registerConversationUpdateMetadataCommand(conversation, program);
  registerConversationAssignCommand(conversation, program);
  registerConversationCommentCommand(conversation, program);
  registerConversationCommentsCommand(conversation, program);
  registerConversationSendMessageCommand(conversation, program);
  registerConversationSendTemplateCommand(conversation, program);
  registerConversationAssignedUsersCommand(conversation, program);
  registerConversationMarkAsReadCommand(conversation, program);
  registerConversationCloseCommand(conversation, program);
}
