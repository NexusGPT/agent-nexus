import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { printEnvelope } from "../../output";
import { PROMPT_GRAPH_CONTRACT } from "../prompt.contract.generated";
import { printVariantGraph } from "./_shared/print-variant-graph";

/** `nexus prompt graph` */
export function registerPromptGraphCommand(prompt: Command, program: Command): void {
  const graph = prompt
    .command("graph")
    .description("The version graph: every version, fork and promote edges")
    .requiredOption("--agent-id <id>", "Agent ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus prompt graph --agent-id 11111111-1111-4111-8111-111111111111
  $ nexus prompt graph --agent-id 11111111-1111-4111-8111-111111111111 --json

Notes:
  Under --json the payload is {nodes, edges}: nodes are versions with their
  variant lane and ordinal, edges carry kind "fork" (source version -> the new
  variant's first version) or "promote" (variant tip -> the new Main version).
  ARCHIVED VARIANTS STAY IN THE GRAPH — hiding a lane would orphan the promote
  edges that left it. Use "nexus prompt variant list" for the active set.
  The human view is variants as indented lists, edges last; it is a summary,
  not a drawing — the frontend graph (later phase) renders this same payload.`
    )
    .action(async (opts: { agentId: string }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.promptVariants.graph(opts.agentId);
        printEnvelope(result, () => {
          printVariantGraph(result);
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option and the hand-written prose.
  bindCommand(graph, PROMPT_GRAPH_CONTRACT);
}
