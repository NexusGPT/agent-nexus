import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { color, printEnvelope } from "../../output";
import { PROMPT_VARIANT_SAVE_VERSION_CONTRACT } from "../prompt.contract.generated";
import { readPromptInput } from "./_shared/read-prompt-input";

/** `nexus prompt save` */
export function registerPromptSaveCommand(prompt: Command, program: Command): void {
  const save = prompt
    .command("save")
    .description("Append a new version (markdown prompt) to a variant's tip")
    .requiredOption("--agent-id <id>", "Agent ID")
    .requiredOption("--variant <ref>", 'Variant to save to: name, id, or "main"')
    .option("--file <path>", "Read the prompt from this file")
    .option("--text <prompt>", "The prompt, inline")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus prompt save --agent-id 11111111-1111-4111-8111-111111111111 \\
      --variant "Concise" --text "Be extremely concise. Ask the order number first."
  $ nexus prompt save --agent-id 11111111-1111-4111-8111-111111111111 \\
      --variant main --file ./prompt.md

Notes:
  EXACTLY ONE OF --file / --text IS REQUIRED; passing both, or neither, is
  refused here rather than sent.
  A SAVE NEVER PUBLISHES. Even --variant main only appends to the lineage —
  the live prompt changes through "nexus prompt promote --publish" and through
  nothing in this command.
  An ARCHIVED variant refuses the save with a conflict naming the state.
  The prompt is markdown, the same dialect "nexus agent get --json | .prompt"
  returns — section directives included. Verify what landed with:
    nexus prompt history --agent-id <id> --variant <ref> --json`
    )
    .action(async (opts: { agentId: string; variant: string; file?: string; text?: string }) => {
      try {
        // `undefined` means `readPromptInput` already printed the refusal AND
        // set the invalid-input exit code — see its docblock. Returning here
        // adds nothing to stdout and leaves that status in place.
        const promptText = await readPromptInput(opts);
        if (promptText === undefined) return;
        const client = createClient(program.optsWithGlobals());
        const result = await client.promptVariants.saveVersion(opts.agentId, opts.variant, {
          prompt: promptText
        });
        printEnvelope(result, () => {
          console.log(
            `Saved version ${color.bold(String(result.ordinal))} on variant ${color.bold(result.variantName)} (${result.id}).`
          );
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option and the hand-written prose.
  bindCommand(save, PROMPT_VARIANT_SAVE_VERSION_CONTRACT);
}
