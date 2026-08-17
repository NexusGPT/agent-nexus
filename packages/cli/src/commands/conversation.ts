import type {
  ConversationMessage,
  SatisfactionMode,
  SendWhatsappTemplateBody,
  UpdateConversationStatusesBody
} from "@agent-nexus/sdk";
import { Command } from "commander";

import { createClient } from "../client";
import { bindCommand, enumInCompositeOption, enumOption } from "../contract-binding";
import { handleError } from "../errors";
import { type Column, isJsonMode, printList, printRecord, printSuccess } from "../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody, resolveRequiredBody } from "../util/body";
import { getPaginationParams } from "../util/pagination";
import { resolveInputValue } from "../util/stdin";
import {
  CONVERSATION_GET__PARAMS_SATISFACTION,
  CONVERSATION_GET_CONTRACT,
  CONVERSATION_LIST__PARAMS_ASSIGNED_TO,
  CONVERSATION_LIST__PARAMS_LAST_MESSAGE_TYPE_IN_ITEM,
  CONVERSATION_LIST__PARAMS_RESPONSE_HANDLING,
  CONVERSATION_LIST__PARAMS_STATUS,
  CONVERSATION_LIST__PARAMS_TICKET_STATUS,
  CONVERSATION_LIST__PARAMS_TICKET_STATUS_IN_ITEM,
  CONVERSATION_LIST__PARAMS_TICKET_STATUS_NOT,
  CONVERSATION_LIST_CONTRACT,
  CONVERSATION_UPDATE_STATUSES__BODY_RESPONSE_HANDLING,
  CONVERSATION_UPDATE_STATUSES__BODY_STATUS,
  CONVERSATION_UPDATE_STATUSES__BODY_TICKET_STATUS,
  CONVERSATION_UPDATE_STATUSES_CONTRACT
} from "./conversation.contract.generated";

// `satisfies readonly SatisfactionMode[]` forces this runtime tuple to track
// the SDK type 1:1 — a future mode (e.g. "none") added to the SDK union without
// updating this array becomes a compile error instead of a silent CLI gap.
const SATISFACTION_MODES = [
  "latest",
  "all",
  "summary"
] as const satisfies readonly SatisfactionMode[];

/**
 * Split a CSV CLI value into an array of trimmed, non-empty items.
 * Only safe for values that can never contain a literal comma (e.g. enum
 * identifiers like `USER,AGENT,SYSTEM`). A free-form string would be
 * silently mangled by the split — same constraint as the server-side
 * `csvOrArray` schema in conversation.schemas.ts.
 */
function splitCsv<T extends string>(value: string | undefined): T[] | undefined {
  if (!value) return undefined;
  const items = value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0) as T[];
  return items.length > 0 ? items : undefined;
}

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

  conversation list      meta = {total, page, hasMore}
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

  // ── list ──────────────────────────────────────────────────────────────
  const list = conversation
    .command("list")
    .description("List conversations")
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
    // Declared here rather than through addPaginationOptions so the cap can be
    // stated; see the same note on `deployment list`.
    .option("--page <number>", "Page number (default 1)", parseInt)
    .option("--limit <number>", "Items per page — 1-100, default 20", parseInt)
    .addHelpText(
      "after",
      `
Examples:
  $ nexus conversation list
  $ nexus conversation list --status OPEN --assigned-to me
  $ nexus conversation list --ticket-status IN_PROGRESS --json
  $ nexus conversation list --search "payment issue"

  # 24h abandonment scan: customers who went silent and haven't been resolved
  # (replace the --last-message-before value with a 24h-ago ISO timestamp)
  $ nexus conversation list \\
      --status OPEN \\
      --last-message-before <iso-24h-ago> \\
      --last-message-type-in USER \\
      --ticket-status-not RESOLVED \\
      --comment-not-contains END_CONV_FIRED_AT:

Notes:
  CLOSED CONVERSATIONS ARE NEVER LISTED. "conversation close" sets a DELETED
  status that no filter here selects, so a conversation missing from every
  --status is closed, not lost.
  --status takes OPEN, RUNNING or ARCHIVED only. DELETED is refused: closing
  is "conversation close", not an update.

  Contradictory filters are REFUSED, not silently empty: --ticket-status with
  --ticket-status-in, a --ticket-status-not equal to --ticket-status or inside
  --ticket-status-in, and a --last-message-before at or earlier than
  --last-message-after are each a 400 naming the conflict.
  --assigned-to me MEANS THE USER WHO MINTED THE KEY, and on a key that
  identifies no user the filter is DROPPED rather than refused — you get every
  conversation back and nothing says the filter did not apply. Check the count
  against an unfiltered run before trusting it. --assigned-to none is exact.
  --last-message-before / --last-message-after are ISO-8601 instants.
  --limit above 100 is a 400, not a clamp. Page with meta.hasMore in --json.`
    )
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

  // ── get ───────────────────────────────────────────────────────────────
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

  // ── messages ──────────────────────────────────────────────────────────
  conversation
    .command("messages")
    .description("Get messages in a conversation")
    .argument("<id>", "Conversation ID (UUID or nanoId)")
    .option("--limit <n>", "Max messages to fetch (default: 50, max: 100)")
    .option(
      "--before <cursor>",
      "Page cursor — the previous page's nextBefore (a bare ISO date works, but can skip rows)"
    )
    .option(
      "--visible-only",
      "Only records the customer actually saw — hides tool results, tool-call turns and other agent-runtime rows"
    )
    .addHelpText(
      "after",
      `
Examples:
  $ nexus conversation messages 11111111-1111-4111-8111-111111111111
  $ nexus conversation messages 11111111-1111-4111-8111-111111111111 --visible-only
  $ nexus conversation messages 11111111-1111-4111-8111-111111111111 --limit 10 --json

Notes:
  ROUGHLY HALF THE AGENT ROWS WERE NEVER DELIVERED. A tool-using conversation
  stores the agent runtime's own working memory beside its real replies, and
  in the table they are six identical-looking AGENT rows. Read TYPE
  (USER_MESSAGE, REPLY, TOOL_CALL, TOOL_RESULT, SYSTEM, INTERNAL) and the
  customerVisible flag, or pass --visible-only and let the server decide.

  USE --visible-only WHENEVER THE QUESTION IS WHAT THE CUSTOMER SAW. Without
  it, quoting this output back to a customer quotes machinery at them. It
  filters before pagination, so --limit counts real messages either way.

  THE PAGE IS THE NEWEST MESSAGES; THE ROWS INSIDE IT READ OLDEST FIRST. Paging
  walks backwards in time while each page prints forwards, so concatenating
  pages in the order you fetch them produces a transcript in the wrong order —
  prepend each page, never append. --limit is capped at 100 (default 50); a long
  conversation needs paging, not a bigger limit.
  --before is the SERVER'S nextBefore, passed back verbatim. It is an opaque
  "<iso>_<id>" pair, not a date. A bare ISO timestamp still works and still
  means "older than this", but it cannot express a boundary inside a
  millisecond, so a cursor you build from the oldest row's createdAt SKIPS
  every message sharing that timestamp. Under --visible-only that matters
  more, because the page is filtered after it is read.
  AN EMPTY PAGE WITH hasMore: true IS NOT THE END. Rows are filtered after the
  window is read, so a page can legitimately return nothing while messages
  remain further back. Stop paging on hasMore: false, never on an empty page.
  In --json, hasMore and nextBefore ride in meta; in table mode they are
  printed as a trailer line.

  REACHING THIS COMMAND FROM A DEPLOYMENT YOU JUST TESTED. Nothing in an
  emulator or deployment response is named "conversationId", which is why the
  bridge is hard to find:
    from a deployment  nexus conversation list --deployment-id <deployment-id>
    from an emulator   nexus emulator session get <deployment-id> <session-id>
    session              --json | jq -r '.chatId'   ← THE CONVERSATION ID
                       That read prints the record BARE, with no "data" wrapper.
                       "emulator session list <deployment-id> --json" carries it
                       per session and IS wrapped: '.data[].chatId'. Neither
                       TABLE prints the column at all.
  chatId reads null until a chat exists for that session, and an emulator
  conversation has no nanoId — pass the UUID.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.conversations.getMessages(id, {
          limit: opts.limit ? Number(opts.limit) : undefined,
          before: opts.before,
          visibleOnly: opts.visibleOnly ? true : undefined
        });

        // Pagination state belongs in a JSON field, not a prose trailer.
        // In JSON mode embed `hasMore` in meta so the output stays a single
        // parseable document; in human mode keep the readable trailer (NEX-2176).
        const columns: Column<ConversationMessage>[] = [
          { key: "id", label: "ID", width: 36 },
          { key: "role", label: "ROLE", width: 8 },
          { key: "senderType", label: "SENDER", width: 12 },
          // TYPE is what separates a real reply from tool plumbing — without it
          // the human-mode table shows six identical-looking AGENT rows.
          { key: "type", label: "TYPE", width: 13 },
          { key: "content", label: "CONTENT", width: 60 },
          { key: "createdAt", label: "CREATED", width: 24 }
        ];
        const messages = result.messages;
        if (isJsonMode()) {
          // `nextBefore` travels with `hasMore`: under --visible-only a page is
          // filtered after it is read, so a script must page with the server's
          // cursor rather than the oldest row it can see. It is opaque — an
          // `<iso>_<id>` pair, not a date — and goes back out unmodified.
          printList(messages, { hasMore: result.hasMore, nextBefore: result.nextBefore }, columns);
        } else {
          printList(messages, undefined, columns);
          if (result.hasMore) {
            console.log(
              `\n(more messages available — use --before ${result.nextBefore ?? "<cursor>"} to paginate)`
            );
          }
        }
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── search ────────────────────────────────────────────────────────────
  conversation
    .command("search")
    .description("Search conversations by topic or message content")
    .requiredOption("--query <text>", "Search query")
    .option("--deployment-id <id>", "Limit to a specific deployment")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus conversation search --query "refund"
  $ nexus conversation search --query "login issue" --deployment-id 11111111-1111-4111-8111-111111111111 --json

Notes:
  CAPPED AT 50 RESULTS WITH NO WAY TO PAGE PAST THEM. There is no --limit and
  no cursor, and nothing marks the cut — 50 rows means "at least 50". Use
  "conversation list --search" instead when the count matters: same substring
  match, plus every filter and real pagination.

  SEARCHES A PHONE NUMBER TOO, which list does not. When the query looks like
  a phone number it also matches the customer's number and the channel thread
  id, so "conversation search --query +15551234567" finds a caller's
  conversations. That is the one thing this command does that list cannot.
  Substring and case-insensitive over the topic and message bodies — no
  stemming, no relevance ranking; results are newest-activity first.
  --query is 1-500 characters. Closed conversations are excluded.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const conversations = await client.conversations.search({
          query: opts.query,
          deploymentId: opts.deploymentId
        });

        printList(conversations, undefined, [
          { key: "id", label: "ID", width: 36 },
          { key: "topic", label: "TOPIC", width: 30 },
          { key: "status", label: "STATUS", width: 10 },
          { key: "lastMessagePreview", label: "LAST MESSAGE", width: 40 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── update-status ─────────────────────────────────────────────────────
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

  // ── update-topic ──────────────────────────────────────────────────────
  conversation
    .command("update-topic")
    .description("Set or replace a conversation's topic")
    .argument("<id>", "Conversation ID (UUID or nanoId)")
    .requiredOption("--topic <text>", "New topic (1-500 chars)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus conversation update-topic 11111111-1111-4111-8111-111111111111 --topic "Billing escalation"
  $ nexus conversation update-topic 4M7O9_BS76Q --topic "VIP renewal"

Notes:
  THIS FIRES THE 'conversation.tagged' PLATFORM EVENT. Any listener workflow
  subscribed to topic changes runs, so renaming a hundred conversations in a
  loop triggers a hundred workflow executions with whatever they do attached.
  Check "nexus workflow list" for listeners before scripting this.
  --topic is REQUIRED and 1-500 characters; there is no way to clear it.
  It REPLACES the topic outright. The previous one is not kept anywhere.
  <id> takes a UUID or a nanoId.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const conv = await client.conversations.updateTopic(id, { topic: opts.topic });
        printRecord(conv, [
          { key: "id", label: "ID" },
          { key: "nanoId", label: "NanoId" },
          { key: "topic", label: "Topic" },
          { key: "status", label: "Status" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── get-metadata ──────────────────────────────────────────────────────
  conversation
    .command("get-metadata")
    .description("Get the custom metadata stored on a conversation")
    .argument("<id>", "Conversation ID (UUID or nanoId)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus conversation get-metadata 11111111-1111-4111-8111-111111111111
  $ nexus conversation get-metadata 11111111-1111-4111-8111-111111111111 --json

Notes:
  Read this before "update-metadata": the merge is per key, so you need to
  know which keys already exist to avoid overwriting one.
  An empty object means no metadata has been attached; it is not an error.`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.conversations.getMetadata(id);
        printRecord(result.metadata);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── update-metadata ───────────────────────────────────────────────────
  conversation
    .command("update-metadata")
    .description("Shallow-merge custom metadata into a conversation")
    .argument("<id>", "Conversation ID (UUID or nanoId)")
    .option("--body <json>", "Metadata patch as JSON, .json file, or '-' for stdin")
    .option(
      "--set <key=value...>",
      "Set keys (value parsed as JSON when valid, else string). Repeatable."
    )
    .option("--unset <key...>", "Clear keys (sends null to delete them). Repeatable.")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus conversation update-metadata 11111111-1111-4111-8111-111111111111 --set priority=high externalId=CRM-123
  $ nexus conversation update-metadata 11111111-1111-4111-8111-111111111111 --set 'flags={"vip":true}'
  $ nexus conversation update-metadata 11111111-1111-4111-8111-111111111111 --unset legacyField
  $ nexus conversation update-metadata 11111111-1111-4111-8111-111111111111 --body '{"priority":"high","old":null}'

Notes:
  THE MERGE IS ONE LEVEL DEEP. A non-null value REPLACES that key outright, a
  null clears it, and keys you do not mention are untouched — so sending
  '{"flags":{"vip":true}}' discards every other key inside flags. Read
  "conversation get-metadata <id>" first and send the object back whole.

  --set PARSES ITS VALUE AS JSON WHEN IT CAN, so the type is decided by what
  you typed: priority=high stores the string "high", count=5 stores the NUMBER
  5, and ok=true stores a BOOLEAN. Quote to force a string: 'count="5"'.
  --set key=null DELETES THE KEY. It parses to a JSON null, and null is the
  clear signal — it does not store a null value. That is what --unset does,
  spelled less obviously.
  --set and --unset are repeatable and merge over --body; --unset is applied
  last, so it wins on a key both mention.
  At least one of --body, --set or --unset is required.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const metadata: Record<string, unknown> = { ...base };

        for (const pair of (opts.set as string[] | undefined) ?? []) {
          const eq = pair.indexOf("=");
          if (eq === -1) {
            throw new Error(`--set expects key=value (got '${pair}')`);
          }
          const key = pair.slice(0, eq);
          const rawValue = pair.slice(eq + 1);
          if (!key) throw new Error(`--set key must not be empty (got '${pair}')`);
          let parsed: unknown = rawValue;
          try {
            parsed = JSON.parse(rawValue);
          } catch {
            // Leave as a plain string when the value isn't valid JSON.
          }
          metadata[key] = parsed;
        }

        for (const key of (opts.unset as string[] | undefined) ?? []) {
          metadata[key] = null;
        }

        if (Object.keys(metadata).length === 0) {
          throw new Error("Provide a metadata patch via --body, --set, or --unset");
        }

        const conv = await client.conversations.updateMetadata(id, { metadata });
        printRecord(conv.metadata ?? {});
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── assign ────────────────────────────────────────────────────────────
  conversation
    .command("assign")
    .description("Set assigned users on a conversation (replaces existing)")
    .argument("<id>", "Conversation ID")
    .option("--user-ids <ids...>", "User IDs to assign (space-separated)")
    .option("--clear", "Remove every assignee, leaving the conversation unassigned")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus conversation assign 11111111-1111-4111-8111-111111111111 --user-ids user-1 user-2
  $ nexus conversation assign 11111111-1111-4111-8111-111111111111 --clear

Notes:
  THIS REPLACES THE ASSIGNEE LIST, IT DOES NOT ADD TO IT. Anyone already
  assigned and not named here loses the conversation, and nothing reports who
  was removed. Read "conversation assigned-users <id>" first and pass the full
  list back.
  --clear IS THE UNASSIGN PATH, and it is a separate flag on purpose. Passing
  --user-ids with no values is not the unassign path and never was: a variadic
  option demands at least one value, so that spelling is refused by the parser
  before this command runs.
  EXACTLY ONE OF --user-ids AND --clear. A bare "assign <id>" is refused rather
  than treated as an empty list — under replace-all semantics, defaulting to
  empty makes the no-flags form the most destructive one.
  WHERE THE IDS COME FROM, BECAUSE NOTHING IN THIS NAMESPACE LISTS THEM. These
  are Clerk user ids (user_…), a DIFFERENT ID SPACE from every UUID here. A
  conversation id or a user-group UUID is not a user, and nothing on this side
  checks the shape — the refusal comes from the server, at the write.
    your own      nexus api GET /me --json | jq -r '.data.userId'
                  "auth whoami" resolves the same identity and prints the org,
                  the email and the role — never the id.
    the current   nexus conversation assigned-users <id> --json
    assignees     Read them first: this command REPLACES the list.
    anyone else   nexus user-group list --json | jq -r '.data[].memberUserIds[]'
                  The TABLE prints a member COUNT and never the ids; only --json
                  carries memberUserIds. Needs the org:admin role — a non-admin
                  key gets a 403 here, not an empty list.
  THERE IS NO COMMAND THAT LISTS EVERY MEMBER OF THE ORGANIZATION, so a user in
  no group is reachable only from the dashboard. Source the id rather than
  guessing one — the write connects each id to a real user row, so a wrong one
  surfaces as a persistence error, the same way a blank one does below.

  A BLANK ID IS REFUSED, NOT SENT. --user-ids "$SOME_UNSET_VAR" hands over an
  empty string; it is a shell accident, never a user, and the server answers a
  blank id with a persistence error rather than a validation message.
  Up to 50 users. Assignment is filing, not permission: it does not grant
  anyone access they did not already have, and it does not stop the agent
  replying — --response-handling does that.`
    )
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

  // ── comment ───────────────────────────────────────────────────────────
  conversation
    .command("comment")
    .description("Add an internal comment to a conversation")
    .argument("<id>", "Conversation ID")
    .requiredOption("--body <text-or-->", "Comment text (or '-' for stdin)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus conversation comment 11111111-1111-4111-8111-111111111111 --body "Escalated to tier 2"
  $ echo "Detailed note" | nexus conversation comment 11111111-1111-4111-8111-111111111111 --body -

Notes:
  INTERNAL ONLY — the customer never sees this, and it is not sent anywhere.
  "conversation send-message" is the one that reaches them. Getting these two
  the wrong way round is how a private note reaches a customer.
  Comments are searchable from "conversation list --comment-contains", which
  is what makes them usable as workflow markers (e.g. END_CONV_FIRED_AT:).
  Append-only: there is no edit and no delete. Content must be non-empty.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const content = await resolveInputValue(opts.body);
        await client.conversations.addComment(id, { content });
        printSuccess("Comment added.", { conversationId: id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── comments ──────────────────────────────────────────────────────────
  conversation
    .command("comments")
    .description("List internal comments on a conversation")
    .argument("<id>", "Conversation ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus conversation comments 11111111-1111-4111-8111-111111111111
  $ nexus conversation comments 11111111-1111-4111-8111-111111111111 --json

Notes:
  Internal notes only — none of this was seen by the customer. The customer
  side is "conversation messages <id> --visible-only".
  Unpaginated, oldest first.
  THE AUTHOR COLUMN IS BLANK ON EVERY COMMENT THIS API WROTE. "conversation
  comment" stores the author's user id and no display name, so authorName reads
  null for those rows and only comments left in the dashboard carry one. Read
  authorId in --json and resolve the name yourself; a blank AUTHOR does not mean
  the comment is unattributed.
  A stored comment that does not match the current schema is SKIPPED rather
  than reported, so this list can be shorter than what is on the record.`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.conversations.getComments(id);
        const comments = result.comments ?? result;

        printList(comments, undefined, [
          { key: "id", label: "ID", width: 36 },
          { key: "content", label: "CONTENT", width: 50 },
          { key: "authorName", label: "AUTHOR", width: 20 },
          { key: "createdAt", label: "CREATED", width: 20 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── send-message ──────────────────────────────────────────────────────
  conversation
    .command("send-message")
    .description("Send a real message to the customer as the agent — it leaves immediately")
    .argument("<id>", "Conversation ID (UUID or nanoId)")
    .requiredOption("--body <text-or-->", "Message content (or '-' for stdin)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus conversation send-message 11111111-1111-4111-8111-111111111111 --body "Your issue has been resolved."
  $ echo "Long reply" | nexus conversation send-message 11111111-1111-4111-8111-111111111111 --body -

Notes:
  THE CUSTOMER RECEIVES THIS ON THEIR REAL CHANNEL — WhatsApp, email, the web
  widget, whatever the conversation is on. There is no draft, no confirmation
  and no recall. "conversation comment" is the internal one.
  It is recorded as coming from the AGENT, not from you by name, so the
  customer cannot tell a human took over. Your user id is kept internally for
  intervention reporting.
  Sending does NOT take the conversation off the agent. Set
  --response-handling MANUAL first or the agent may answer over you.
  Content must be non-empty, and it is plain text: a WhatsApp template message
  goes through "conversation send-template" instead.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const content = await resolveInputValue(opts.body);
        await client.conversations.sendAgentMessage(id, { content });
        printSuccess("Agent message sent.", { conversationId: id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── send-template ─────────────────────────────────────────────────────
  conversation
    .command("send-template")
    .description("Send a WhatsApp template to the customer — a real, billed message")
    .argument("<id>", "Conversation ID (UUID or nanoId)")
    .requiredOption("--body <json>", "Template JSON with { template, templateData }")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus conversation send-template 11111111-1111-4111-8111-111111111111 --body '{"template":{"id":"HX...","language":"en","types":{"twilio/text":{"body":"Hello {{1}}"}}},"templateData":{"1":"John"}}'

Notes:
  THIS DELIVERS TO THE REAL CUSTOMER AND BILLS. WhatsApp only; no draft, no
  recall. For a test send to a number you own, use
  "nexus channel whatsapp-template test-send".
  THE TEMPLATE MUST BE META-APPROVED. Check with
  "nexus channel whatsapp-template approvals" — an unapproved id is refused at
  send time, not by this command's validation.
  --body is required and carries the whole thing: template.id is the Twilio
  content SID (HX...), template.language its language code, template.types the
  content, and templateData fills the {{N}} placeholders by position.
  A missing position leaves the placeholder unfilled in what the customer
  receives.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const body = await resolveRequiredBody(opts.body);
        const result = await client.conversations.sendWhatsappTemplate(
          id,
          asRequestBody<SendWhatsappTemplateBody>(body)
        );
        printSuccess("WhatsApp template sent.", result);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── assigned-users ────────────────────────────────────────────────────
  conversation
    .command("assigned-users")
    .description("Get assigned users for a conversation")
    .argument("<id>", "Conversation ID (UUID or nanoId)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus conversation assigned-users 11111111-1111-4111-8111-111111111111
  $ nexus conversation assigned-users 11111111-1111-4111-8111-111111111111 --json

Notes:
  Read this before "conversation assign", which REPLACES the whole list rather
  than adding to it.
  An empty list means unassigned — it is not an error, and it is what
  "conversation list --assigned-to none" selects on.
  IT ALSO ANSWERS responseHandling, WHICH IS WHY ONE READ IS ENOUGH. The
  response is {userIds, responseHandling}, so the two facts a handover needs —
  who has it, and whether the agent is still replying — come back together.
  Assignment does NOT stop the agent; "conversation update-status <id>
  --response-handling MANUAL" does. Reading AUTO here is the signal to send it.`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.conversations.getAssignedUsers(id);
        printRecord(result);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── mark-as-read ──────────────────────────────────────────────────────
  conversation
    .command("mark-as-read")
    .description("Mark a conversation as read")
    .argument("<id>", "Conversation ID (UUID or nanoId)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus conversation mark-as-read 11111111-1111-4111-8111-111111111111

Notes:
  Clears the inbox unread flag on the conversation and nothing else — no
  status change, no read receipt to the customer, no effect on the agent.
  Organization-wide, not per user: the conversation is read for everybody.
  There is no mark-as-unread. A new inbound message sets it back.`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        await client.conversations.markAsRead(id);
        printSuccess("Conversation marked as read.", { id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── close ─────────────────────────────────────────────────────────────
  conversation
    .command("close")
    .description("Close a conversation — it disappears from every list, with no reopen")
    .argument("<id>", "Conversation ID (UUID or nanoId)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus conversation close 11111111-1111-4111-8111-111111111111

Notes:
  THERE IS NO REOPEN. This sets a DELETED status that "conversation
  update-status" cannot set back — it accepts only OPEN, RUNNING and ARCHIVED.
  If you want it out of the way but recoverable, use
  "conversation update-status <id> --status ARCHIVED" instead.

  IT VANISHES FROM "conversation list" AND "conversation search" AND STAYS
  READABLE BY ID. "conversation get", "conversation messages", "conversation
  comments" and "conversation get-metadata" all still answer afterwards, and
  "get" reports status DELETED — the one status a read reports and no write can
  set. The messages are not erased and the transcript stays reachable, so the
  disappearance from both lists is the whole of what a close hides.
  THE WRITE PATHS REFUSE A CLOSED CONVERSATION with a 404: "assign",
  "update-status", "comment", "mark-as-read", and a second "close".
  Runs with no prompt and no --yes, on one call.
  Needs conversations:delete, which conversations:write does not imply.`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        await client.conversations.close(id);
        printSuccess("Conversation closed.", { id, deleted: true });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists.
  bindCommand(list, CONVERSATION_LIST_CONTRACT);
  bindCommand(get, CONVERSATION_GET_CONTRACT);
  bindCommand(updateStatus, CONVERSATION_UPDATE_STATUSES_CONTRACT);
}
