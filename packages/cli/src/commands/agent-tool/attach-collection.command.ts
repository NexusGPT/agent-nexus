import type { AttachCollectionBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../../util/body";
import { TOOL_ATTACH_COLLECTION_CONTRACT } from "../agent-tool.contract.generated";

const ATTACH_COLLECTION_HELP = `
Examples:
  $ nexus agent-tool attach-collection 11111111-1111-4111-8111-111111111111 --collection-id 3c2b1a09-8f7e-4d6c-9b4a-39281706f5e4
  $ nexus agent-tool attach-collection 11111111-1111-4111-8111-111111111111 --collection-id 3c2b1a09-8f7e-4d6c-9b4a-39281706f5e4 --label "FAQ Search"
  $ nexus agent-tool attach-collection 11111111-1111-4111-8111-111111111111 --body '{"collectionId":"3c2b1a09-8f7e-4d6c-9b4a-39281706f5e4","instructions":"Search this before answering pricing questions."}'

Notes:
  THE SHORTCUT FOR --type COLLECTION. It writes the config, a single "query"
  parameter the agent fills itself, and the flat agentInputSchema — which is why
  it takes no --config and no schema.
  --collection-id must be a real UUID. A collection in another organization
  answers exactly as a nonexistent one: "Collection <id> not found".
  --label defaults to the collection's display name. A description has no flag —
  send it in --body — and defaults to the collection's own description.
  --instructions is the tool's usage instruction — the text that tells the agent
  WHEN to search this collection. Nothing supplies it for you.`;

/** `nexus agent-tool attach-collection` */
export function registerAgentToolAttachCollectionCommand(
  agentTool: Command,
  program: Command
): void {
  const attachCollection = agentTool
    .command("attach-collection")
    .description("Attach a knowledge collection to an agent")
    .argument("<agent-id>", "Agent ID")
    .requiredOption("--collection-id <id>", "Collection ID")
    .option("--label <label>", "Tool label")
    .option("--instructions <text>", "Usage instructions")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText("after", ATTACH_COLLECTION_HELP)
    .action(async (agentId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, {
          ...(opts.collectionId !== undefined && { collectionId: opts.collectionId }),
          ...(opts.label !== undefined && { label: opts.label }),
          ...(opts.instructions !== undefined && { instructions: opts.instructions })
        });

        const tool = await client.agents.tools.attachCollection(
          agentId,
          asRequestBody<AttachCollectionBody>(body)
        );
        printSuccess("Collection attached to agent.", {
          id: tool.id,
          label: tool.label
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists — see `bindCommand`.
  bindCommand(attachCollection, TOOL_ATTACH_COLLECTION_CONTRACT);
}
