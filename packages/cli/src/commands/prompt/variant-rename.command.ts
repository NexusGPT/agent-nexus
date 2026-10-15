import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { color, printEnvelope } from "../../output";
import { PROMPT_VARIANT_RENAME_CONTRACT } from "../prompt.contract.generated";

/** `nexus prompt variant rename` */
export function registerPromptVariantRenameCommand(variant: Command, program: Command): void {
  const variantRename = variant
    .command("rename")
    .description("Rename a variant (Main cannot be renamed)")
    .requiredOption("--agent-id <id>", "Agent ID")
    .requiredOption("--variant <ref>", 'Variant to rename: name, id — never "main"')
    .requiredOption("--name <name>", "The new name")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus prompt variant rename --agent-id 11111111-1111-4111-8111-111111111111 \\
      --variant "Concise" --name "Concise refunds"

Notes:
  MAIN CANNOT BE RENAMED and nothing can be renamed TO "Main" — the name is
  the anchor every other command's --variant main relies on.
  Renaming changes how the variant is ADDRESSED by name immediately; scripts
  holding the old name will start answering "not found". The id keeps working.
  A name colliding (case-insensitively) with another ACTIVE variant is refused;
  an archived variant has given its name up and does not collide.`
    )
    .action(async (opts: { agentId: string; variant: string; name: string }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.promptVariants.rename(opts.agentId, opts.variant, {
          name: opts.name
        });
        printEnvelope(result, () => {
          console.log(`Renamed variant to ${color.bold(result.name)}.`);
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option and the hand-written prose.
  bindCommand(variantRename, PROMPT_VARIANT_RENAME_CONTRACT);
}
