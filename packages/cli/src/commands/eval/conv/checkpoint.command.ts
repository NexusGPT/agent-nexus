import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand } from "../../../contract-binding";
import { handleError, refuse } from "../../../errors";
import { printEnvelope } from "../../../output";
import { GOLDEN_CONVERSATION_SET_CHECKPOINT_CONTRACT } from "../../eval.contract.generated";
import { readFileArg } from "../_shared/read-file-arg";

/** `nexus eval conv checkpoint` */
export function registerEvalConvCheckpointCommand(conv: Command, program: Command): Command {
  const leaf = conv
    .command("checkpoint")
    .description("Toggle whether an agent turn is a test case; optionally attach criteria")
    .requiredOption("--conversation-id <id>", "Conversation ID")
    .requiredOption("--index <n>", "0-based turn index", parseInt)
    .option("--on", "Make this turn a checkpoint")
    .option("--off", "Stop testing this turn")
    .option("--criteria <file.json>", "JSON array of {name, rubric, weight?} judged per run")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus eval conv checkpoint --conversation-id 33333333-3333-4333-8333-333333333333 \\
      --index 3 --on --criteria criteria.json
  $ nexus eval conv checkpoint --conversation-id 33333333-3333-4333-8333-333333333333 \\
      --index 5 --off

Notes:
  EXACTLY ONE OF --on / --off is required.
  --criteria REPLACES the turn's criteria wholesale (there is no append).
  Toggling --off KEEPS stored criteria, so a later --on finds them intact.
  Criteria are judged IN ADDITION to the built-in golden_match — each entry
  gets its own judge call at run time (phase 3).`
    )
    .action(
      async (opts: {
        conversationId: string;
        index: number;
        on?: boolean;
        off?: boolean;
        criteria?: string;
      }) => {
        try {
          if (opts.on === undefined && opts.off === undefined) {
            refuse("Pass --on or --off.");
            return;
          }
          if (opts.on !== undefined && opts.off !== undefined) {
            refuse("Pass --on or --off, not both.");
            return;
          }
          let criteria: { name: string; rubric: string; weight?: number }[] | undefined;
          if (opts.criteria !== undefined) {
            const raw = readFileArg(opts.criteria);
            if (raw === undefined) return;
            try {
              criteria = JSON.parse(raw) as { name: string; rubric: string; weight?: number }[];
            } catch {
              refuse(`--criteria is not valid JSON: ${opts.criteria}`);
              return;
            }
          }
          const client = createClient(program.optsWithGlobals());
          const result = await client.goldenConversations.setCheckpoint(
            opts.conversationId,
            opts.index,
            {
              isCheckpoint: opts.on !== undefined,
              ...(criteria !== undefined ? { criteria } : {})
            }
          );
          printEnvelope(result, () => {
            const state = result.isCheckpoint ? "ON" : "OFF";
            const crit = result.criteria !== null ? ` with ${result.criteria.length} criteria` : "";
            console.log(`checkpoint ${state} for turn ${result.index}${crit}`);
          });
        } catch (err) {
          process.exitCode = handleError(err);
        }
      }
    );

  bindCommand(leaf, GOLDEN_CONVERSATION_SET_CHECKPOINT_CONTRACT, {
    "Body.isCheckpoint": "exposed as the --on / --off flag pair (exactly one is required)",
    "Body.criteria": "supplied via --criteria <file.json>; the CLI reads and parses the file"
  });
  return leaf;
}
