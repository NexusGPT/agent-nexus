import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand } from "../../../contract-binding";
import { handleError } from "../../../errors";
import { color, printEnvelope } from "../../../output";
import { GOLDEN_CONVERSATION_CREATE_CONTRACT } from "../../eval.contract.generated";

/** `nexus eval conv create` */
export function registerEvalConvCreateCommand(conv: Command, program: Command): Command {
  const leaf = conv
    .command("create")
    .description("Create a golden conversation (DRAFT, no turns)")
    .requiredOption("--agent-id <id>", "Agent ID")
    .requiredOption("--deployment-id <id>", "Deployment ID (must belong to the agent)")
    .requiredOption("--title <title>", "Conversation title")
    .option("--description <text>", "Optional description")
    .option("--variant <ref>", 'Author on this prompt variant (name, id, or "main")')
    .addHelpText(
      "after",
      `
Examples:
  $ nexus eval conv create --agent-id 11111111-1111-4111-8111-111111111111 \\
      --deployment-id 22222222-2222-4222-8222-222222222222 --title "refund flow"
  $ nexus eval conv create --agent-id 11111111-1111-4111-8111-111111111111 \\
      --deployment-id 22222222-2222-4222-8222-222222222222 \\
      --variant "French" --title "fr check" --json

Notes:
  THE DEPLOYMENT MUST BELONG TO THE AGENT — the pair is fixed for the
  conversation's life and eval runs inherit it (no retargeting).
  --variant RESOLVES AT CREATION: the variant's TIP version becomes the
  conversation's authoring version, and every generate runs under it. Saving
  to the variant afterwards does NOT move an existing conversation.
  Omitting --variant authors against the agent's LIVE prompt.`
    )
    .action(
      async (opts: {
        agentId: string;
        deploymentId: string;
        title: string;
        description?: string;
        variant?: string;
      }) => {
        try {
          const client = createClient(program.optsWithGlobals());
          const result = await client.goldenConversations.create({
            agentId: opts.agentId,
            deploymentId: opts.deploymentId,
            title: opts.title,
            ...(opts.description !== undefined ? { description: opts.description } : {}),
            ...(opts.variant !== undefined ? { variant: opts.variant } : {})
          });
          printEnvelope(result, () => {
            console.log(`Created golden conversation ${color.bold(result.id)} (${result.status})`);
            if (result.authoringVersionId !== null) {
              console.log(`Authoring version: ${result.authoringVersionId}`);
            }
          });
        } catch (err) {
          process.exitCode = handleError(err);
        }
      }
    );

  bindCommand(leaf, GOLDEN_CONVERSATION_CREATE_CONTRACT);
  return leaf;
}
