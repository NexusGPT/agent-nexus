import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand } from "../../../contract-binding";
import { handleError } from "../../../errors";
import { printEnvelope, printTable } from "../../../output";
import { GOLDEN_CONVERSATION_LIST_CONTRACT } from "../../eval.contract.generated";

/** `nexus eval conv list` */
export function registerEvalConvListCommand(conv: Command, program: Command): Command {
  const leaf = conv
    .command("list")
    .description("List golden conversations, newest first")
    .option("--agent-id <id>", "Only this agent's conversations")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus eval conv list
  $ nexus eval conv list --agent-id 11111111-1111-4111-8111-111111111111 --json

Notes:
  Under --json the payload is a BARE ARRAY of conversations.
  STATUS is DRAFT until "nexus eval conv ready" — only READY conversations
  are eligible for eval runs (phase 3).`
    )
    .action(async (opts: { agentId?: string }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.goldenConversations.list({
          ...(opts.agentId !== undefined ? { agentId: opts.agentId } : {})
        });
        printEnvelope(result, () => {
          printTable(
            result.map((c) => ({
              title: c.title,
              status: c.status,
              agent: c.agentId,
              id: c.id
            })),
            [
              { key: "title", label: "TITLE", width: 28 },
              { key: "status", label: "STATUS", width: 9 },
              { key: "agent", label: "AGENT", width: 36 },
              { key: "id", label: "ID", width: 36 }
            ]
          );
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  bindCommand(leaf, GOLDEN_CONVERSATION_LIST_CONTRACT);
  return leaf;
}
