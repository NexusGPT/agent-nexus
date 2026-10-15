import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { color, printEnvelope } from "../../output";
import { PROMPT_VARIANT_PROMOTE_CONTRACT } from "../prompt.contract.generated";

/** `nexus prompt promote` */
export function registerPromptPromoteCommand(prompt: Command, program: Command): void {
  const promote = prompt
    .command("promote")
    .description("Copy a variant's tip into a NEW version on Main")
    .requiredOption("--agent-id <id>", "Agent ID")
    .requiredOption("--variant <ref>", "Variant whose tip goes to Main: name or id")
    .option("--publish", "Also make the new Main version the live prompt")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus prompt promote --agent-id 11111111-1111-4111-8111-111111111111 --variant "Concise"
  $ nexus prompt promote --agent-id 11111111-1111-4111-8111-111111111111 --variant "Concise" --publish

Notes:
  PROMOTE APPENDS, NEVER MOVES. Main gains one new version whose content
  copies the variant's tip and whose promotedFromVersionId records the edge;
  the variant itself is untouched and its history is never rewritten. Running
  promote twice appends twice.
  WITHOUT --publish the live prompt does not change — the new Main version is
  lineage only. With it, the agent's production pointer AND its draft move to
  the promoted content (the existing publish semantics).
  Refused on Main itself, on archived variants, and on a variant with no
  versions. Verify with:
    nexus prompt history --agent-id <id> --variant main --json`
    )
    .action(async (opts: { agentId: string; variant: string; publish?: boolean }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.promptVariants.promote(opts.agentId, opts.variant, {
          ...(opts.publish ? { publish: true } : {})
        });
        printEnvelope(result, () => {
          console.log(
            `Promoted to Main as version ${color.bold(String(result.ordinal))} (${result.newMainVersionId})${
              result.published ? " and published" : ""
            }.`
          );
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option and the hand-written prose.
  bindCommand(promote, PROMPT_VARIANT_PROMOTE_CONTRACT);
}
