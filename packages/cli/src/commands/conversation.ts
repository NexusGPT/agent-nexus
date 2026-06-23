import type { SatisfactionMode } from "@agent-nexus/sdk";
import { Command } from "commander";

import { createClient } from "../client";
import { handleError } from "../errors";
import { isJsonMode, printList, printRecord, printSuccess } from "../output";
import { mergeBodyWithFlags, resolveBody } from "../util/body";
import { addPaginationOptions, getPaginationParams } from "../util/pagination";
import { resolveInputValue } from "../util/stdin";

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

  // ── list ──────────────────────────────────────────────────────────────
  addPaginationOptions(
    conversation
      .command("list")
      .description("List conversations")
      .option("--status <status>", "Filter by status (OPEN, RUNNING, ARCHIVED)")
      .option(
        "--ticket-status <status>",
        "Filter by ticket status (SUBMITTED, IN_PROGRESS, WAITING_ON_CUSTOMER, RESOLVED)"
      )
      .option(
        "--response-handling <mode>",
        "Filter by response handling (AUTO, ON_APPROVAL, MANUAL)"
      )
      .option(
        "--ticket-status-in <a,b,c>",
        "Filter by ticket status (comma-separated: SUBMITTED,IN_PROGRESS,WAITING_ON_CUSTOMER,RESOLVED)"
      )
      .option(
        "--ticket-status-not <status>",
        "Exclude a ticket status (SUBMITTED, IN_PROGRESS, WAITING_ON_CUSTOMER, RESOLVED)"
      )
      .option("--deployment-id <id>", "Filter by deployment ID")
      .option("--assigned-to <filter>", "Filter by assignment (me, none)")
      .option("--search <query>", "Search by topic or message content")
      .option(
        "--last-message-before <iso>",
        "Only conversations whose last message is older than this ISO date"
      )
      .option(
        "--last-message-after <iso>",
        "Only conversations whose last message is newer than this ISO date"
      )
      .option(
        "--last-message-type-in <a,b,c>",
        "Filter by last message role (comma-separated: USER, AGENT, SYSTEM)"
      )
      .option(
        "--comment-contains <substring>",
        "Only conversations with a comment containing this substring (1–500 chars)"
      )
      .option(
        "--comment-not-contains <substring>",
        "Only conversations with no comment containing this substring (1–500 chars)"
      )
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
      --comment-not-contains END_CONV_FIRED_AT:`
      )
  ).action(async (opts) => {
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

      printList(
        data as unknown as Record<string, unknown>[],
        meta as unknown as Record<string, unknown>,
        [
          { key: "id", label: "ID", width: 36 },
          { key: "topic", label: "TOPIC", width: 30 },
          { key: "status", label: "STATUS", width: 10 },
          { key: "ticketStatus", label: "TICKET", width: 22 },
          { key: "responseHandling", label: "HANDLING", width: 14 }
        ]
      );
    } catch (err) {
      process.exitCode = handleError(err);
    }
  });

  // ── get ───────────────────────────────────────────────────────────────
  conversation
    .command("get")
    .description("Get conversation details")
    .argument("<id>", "Conversation ID")
    .option(
      "--satisfaction <mode>",
      "Project satisfaction on the response: 'latest' (most-recent score), 'all' (full history), or 'summary' (latest + totalCount)"
    )
    .addHelpText(
      "after",
      `
Examples:
  $ nexus conversation get <conversation-id>
  $ nexus conversation get <conversation-id> --json
  $ nexus conversation get <conversation-id> --satisfaction latest --json
  $ nexus conversation get <conversation-id> --satisfaction summary --json`
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
        printRecord(conv as unknown as Record<string, unknown>, [
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
    .argument("<id>", "Conversation ID")
    .option("--limit <n>", "Max messages to fetch (default: 50, max: 100)")
    .option("--before <date>", "Fetch messages before this ISO date (cursor pagination)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus conversation messages <conversation-id>
  $ nexus conversation messages <conversation-id> --limit 10 --json`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.conversations.getMessages(id, {
          limit: opts.limit ? Number(opts.limit) : undefined,
          before: opts.before
        });

        // Pagination state belongs in a JSON field, not a prose trailer.
        // In JSON mode embed `hasMore` in meta so the output stays a single
        // parseable document; in human mode keep the readable trailer (NEX-2176).
        const columns = [
          { key: "id", label: "ID", width: 36 },
          { key: "role", label: "ROLE", width: 8 },
          { key: "content", label: "CONTENT", width: 60 },
          { key: "createdAt", label: "CREATED", width: 24 }
        ];
        const messages = result.messages as unknown as Record<string, unknown>[];
        if (isJsonMode()) {
          printList(messages, { hasMore: result.hasMore }, columns);
        } else {
          printList(messages, undefined, columns);
          if (result.hasMore) {
            console.log("\n(more messages available — use --before to paginate)");
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
  $ nexus conversation search --query "login issue" --deployment-id <id> --json`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const conversations = await client.conversations.search({
          query: opts.query,
          deploymentId: opts.deploymentId
        });

        printList(conversations as unknown as Record<string, unknown>[], undefined, [
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
  conversation
    .command("update-status")
    .description("Update conversation status, ticket status, or response handling")
    .argument("<id>", "Conversation ID")
    .option("--status <status>", "New status (OPEN, RUNNING, ARCHIVED)")
    .option(
      "--ticket-status <status>",
      "New ticket status (SUBMITTED, IN_PROGRESS, WAITING_ON_CUSTOMER, RESOLVED)"
    )
    .option("--response-handling <mode>", "New response handling (AUTO, ON_APPROVAL, MANUAL)")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus conversation update-status <id> --status ARCHIVED
  $ nexus conversation update-status <id> --ticket-status RESOLVED
  $ nexus conversation update-status <id> --response-handling MANUAL`
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

        const conv = await client.conversations.updateStatuses(id, body as any);
        printRecord(conv as unknown as Record<string, unknown>, [
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
Emits the 'conversation.tagged' platform event, so listener workflows
subscribed to topic changes will fire.

Examples:
  $ nexus conversation update-topic <id> --topic "Billing escalation"
  $ nexus conversation update-topic 4M7O9_BS76Q --topic "VIP renewal"`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const conv = await client.conversations.updateTopic(id, { topic: opts.topic });
        printRecord(conv as unknown as Record<string, unknown>, [
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
  $ nexus conversation get-metadata <id>
  $ nexus conversation get-metadata <id> --json`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.conversations.getMetadata(id);
        printRecord(result.metadata as unknown as Record<string, unknown>);
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
Merge semantics: a non-null value overwrites that key, a null value clears it,
and keys you don't mention are left untouched.

Examples:
  $ nexus conversation update-metadata <id> --set priority=high externalId=CRM-123
  $ nexus conversation update-metadata <id> --set 'flags={"vip":true}'
  $ nexus conversation update-metadata <id> --unset legacyField
  $ nexus conversation update-metadata <id> --body '{"priority":"high","old":null}'`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = (await resolveBody(opts.body)) as Record<string, unknown>;
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
        printRecord((conv as any).metadata as Record<string, unknown>);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── assign ────────────────────────────────────────────────────────────
  conversation
    .command("assign")
    .description("Set assigned users on a conversation (replaces existing)")
    .argument("<id>", "Conversation ID")
    .requiredOption("--user-ids <ids...>", "User IDs to assign (space-separated)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus conversation assign <id> --user-ids user-1 user-2
  $ nexus conversation assign <id> --user-ids  # empty to unassign all`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const conv = await client.conversations.setAssignedUsers(id, {
          userIds: opts.userIds ?? []
        });
        printSuccess("Users assigned.", {
          conversationId: id,
          assignedUserIds: (conv as any).assignedUserIds
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
  $ nexus conversation comment <id> --body "Escalated to tier 2"
  $ echo "Detailed note" | nexus conversation comment <id> --body -`
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
  $ nexus conversation comments <id>
  $ nexus conversation comments <id> --json`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.conversations.getComments(id);
        const comments = (result as any).comments ?? result;

        printList(comments as unknown as Record<string, unknown>[], undefined, [
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
    .description("Send a message as the agent/support representative")
    .argument("<id>", "Conversation ID")
    .requiredOption("--body <text-or-->", "Message content (or '-' for stdin)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus conversation send-message <id> --body "Your issue has been resolved."
  $ echo "Long reply" | nexus conversation send-message <id> --body -`
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
    .description("Send a WhatsApp content template message")
    .argument("<id>", "Conversation ID")
    .requiredOption("--body <json>", "Template JSON with { template, templateData }")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus conversation send-template <id> --body '{"template":{"id":"HX...","language":"en","types":{"twilio/text":{"body":"Hello {{1}}"}}},"templateData":{"1":"John"}}'`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const body = await resolveBody(opts.body);
        const result = await client.conversations.sendWhatsappTemplate(id, body as any);
        printSuccess("WhatsApp template sent.", result as unknown as Record<string, unknown>);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── assigned-users ────────────────────────────────────────────────────
  conversation
    .command("assigned-users")
    .description("Get assigned users for a conversation")
    .argument("<id>", "Conversation ID")
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.conversations.getAssignedUsers(id);
        printRecord(result as unknown as Record<string, unknown>);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── mark-as-read ──────────────────────────────────────────────────────
  conversation
    .command("mark-as-read")
    .description("Mark a conversation as read")
    .argument("<id>", "Conversation ID")
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
    .description("Close (soft-delete) a conversation")
    .argument("<id>", "Conversation ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus conversation close <id>`
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
}
