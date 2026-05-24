import { Command } from "commander";

import { createClient } from "../client";
import { handleError } from "../errors";
import { printRecord, printSuccess, printTable } from "../output";
import { mergeBodyWithFlags, resolveBody } from "../util/body";
import { resolveInputValue } from "../util/stdin";

/** Cue involves multiple LLM + tool resolution round-trips. Use a generous timeout. */
const CUE_TIMEOUT_MS = 3 * 60 * 1000;

export function registerCueCommands(program: Command): void {
  const cue = program.command("cue").description("Cue AI subsystem");

  // ── prompt-editor group ───────────────────────────────────────────────────
  const pe = cue.command("prompt-editor").description("Edit agent prompts with AI");

  // ── chat ──────────────────────────────────────────────────────────────────
  pe.command("chat")
    .description("Send a message to the Cue prompt editor")
    .option("--agent-id <id>", "Agent ID whose prompt to edit")
    .option("--message <text-or->", "Message text (or '-' for stdin)")
    .option("--conversation-id <id>", "Continue existing conversation")
    .option("--quote <text>", "Selected text for context")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus cue prompt-editor chat --agent-id abc --message "Make the tone more formal"
  $ nexus cue prompt-editor chat --agent-id abc --message "Add error handling" --conversation-id xyz
  $ echo "Improve greeting" | nexus cue prompt-editor chat --agent-id abc --message -
  $ nexus cue prompt-editor chat --body '{"agentId":"abc","message":"Help me"}'`
    )
    .action(async (opts) => {
      try {
        const client = createClient({ ...program.optsWithGlobals(), timeout: CUE_TIMEOUT_MS });
        const base = await resolveBody(opts.body);
        const flags: Record<string, unknown> = {};
        if (opts.agentId) flags.agentId = opts.agentId;
        if (opts.conversationId) flags.conversationId = opts.conversationId;
        if (opts.quote) flags.quote = opts.quote;
        if (opts.message) flags.message = await resolveInputValue(opts.message);
        const body = mergeBodyWithFlags(base, flags);

        if (!body.agentId) {
          console.error("Error: --agent-id is required (via flag or --body)");
          process.exitCode = 1;
          return;
        }
        if (!body.message) {
          console.error("Error: --message is required (via flag or --body)");
          process.exitCode = 1;
          return;
        }

        const result = await client.cue.promptEditor.chat(
          body as unknown as Parameters<typeof client.cue.promptEditor.chat>[0]
        );
        printRecord(result as unknown as Record<string, unknown>);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── conversations ─────────────────────────────────────────────────────────
  const convs = pe.command("conversations").description("Manage Cue conversations");

  convs
    .command("list")
    .description("List conversations for an agent")
    .requiredOption("--agent-id <id>", "Agent ID")
    .option("--limit <n>", "Max results", "20")
    .option("--offset <n>", "Skip results", "0")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus cue prompt-editor conversations list --agent-id abc
  $ nexus cue prompt-editor conversations list --agent-id abc --limit 5 --json`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.cue.promptEditor.listConversations(opts.agentId, {
          limit: parseInt(opts.limit),
          offset: parseInt(opts.offset)
        });
        printTable(result.conversations as unknown as Record<string, unknown>[], [
          { key: "id", label: "ID" },
          { key: "title", label: "Title" },
          { key: "createdAt", label: "Created" },
          { key: "updatedAt", label: "Updated" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  convs
    .command("get")
    .description("Get a conversation with messages")
    .argument("<conversation-id>", "Conversation ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus cue prompt-editor conversations get abc-123
  $ nexus cue prompt-editor conversations get abc-123 --json`
    )
    .action(async (conversationId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.cue.promptEditor.getConversation(conversationId);
        printRecord(result as unknown as Record<string, unknown>);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  convs
    .command("delete")
    .description("Delete a conversation")
    .argument("<conversation-id>", "Conversation ID")
    .option("--yes", "Skip confirmation")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus cue prompt-editor conversations delete abc-123
  $ nexus cue prompt-editor conversations delete abc-123 --yes`
    )
    .action(async (conversationId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        if (!opts.yes) {
          if (!process.stdin.isTTY) {
            console.error("Error: use --yes to confirm deletion in non-interactive mode");
            process.exitCode = 1;
            return;
          }
          const readline = await import("node:readline/promises");
          const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
          const answer = await rl.question(`Delete conversation ${conversationId}? [y/N] `);
          rl.close();
          if (answer.toLowerCase() !== "y") {
            console.log("Aborted.");
            return;
          }
        }

        await client.cue.promptEditor.deleteConversation(conversationId);
        printSuccess("Conversation deleted.", { conversationId });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── accept / reject ───────────────────────────────────────────────────────
  pe.command("accept")
    .description("Accept a suggestion")
    .argument("<conversation-id>", "Conversation ID")
    .argument("<suggestion-id>", "Suggestion ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus cue prompt-editor accept conv-123 sugg-456`
    )
    .action(async (conversationId: string, suggestionId: string) => {
      try {
        const client = createClient({ ...program.optsWithGlobals(), timeout: CUE_TIMEOUT_MS });
        await client.cue.promptEditor.updateSuggestionStatus(suggestionId, {
          status: "accepted",
          conversationId
        });
        printSuccess("Suggestion accepted.", { suggestionId });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  pe.command("reject")
    .description("Reject a suggestion")
    .argument("<conversation-id>", "Conversation ID")
    .argument("<suggestion-id>", "Suggestion ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus cue prompt-editor reject conv-123 sugg-456`
    )
    .action(async (conversationId: string, suggestionId: string) => {
      try {
        const client = createClient({ ...program.optsWithGlobals(), timeout: CUE_TIMEOUT_MS });
        await client.cue.promptEditor.updateSuggestionStatus(suggestionId, {
          status: "rejected",
          conversationId
        });
        printSuccess("Suggestion rejected.", { suggestionId });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
