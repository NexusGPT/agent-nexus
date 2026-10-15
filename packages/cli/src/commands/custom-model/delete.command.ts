import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { confirmable, confirmDestructive } from "../../util/confirm";
import { CUSTOM_MODEL_DELETE_CONTRACT } from "../custom-model.contract.generated";

/**
 * `nexus custom-model delete`
 *
 * 🔴 `confirmable()` RUNS **AFTER** `bindCommand`, WHICH IS THE OPPOSITE ORDER
 * FROM EVERY OTHER DESTRUCTIVE VERB IN THIS WAVE, AND IT IS OBSERVABLE.
 * `bindCommand` appends `--print-contract` to the command, so binding first and
 * declaring `--yes` second puts `--print-contract` ABOVE `--yes` in this
 * command's `--help`; `user-group delete` and `html-template delete` wrap at
 * creation and list the two the other way round.
 *
 * The order is preserved here verbatim because this split changes no shipped
 * byte. It is reported as a divergence rather than normalised: swapping the two
 * lines would move the published help text of a destructive command.
 */
export function registerCustomModelDeleteCommand(customModel: Command, program: Command): void {
  const remove = customModel
    .command("delete")
    .description("Delete a custom model")
    .argument("<id>", "Custom model ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus custom-model delete 11111111-1111-4111-8111-111111111111
  $ nexus custom-model delete 11111111-1111-4111-8111-111111111111 --yes

Notes:
  IT PROMPTS, AND OFF A TERMINAL THAT PROMPT IS A REFUSAL. --yes is required in
  CI or in a pipe; without it and without a TTY the command declines rather than
  proceeding on a default.
  NOTHING HERE TELLS YOU WHAT IS USING THE ENDPOINT. An agent or an AI task
  selecting this model by --custom-model-id is not listed, and this command does
  not look. Check before deleting, not after.
  The argument is the row's own UUID from "custom-model list" — not the modelId
  and not the display name, neither of which selects a row.`
    )
    .action(async (id: string, opts) => {
      try {
        if (!(await confirmDestructive(`Delete custom model ${id}? This cannot be undone.`, opts)))
          return;

        const client = createClient(program.optsWithGlobals());
        await client.customModels.delete(id);
        printSuccess("Custom model deleted.", { id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  bindCommand(remove, CUSTOM_MODEL_DELETE_CONTRACT);
  confirmable(remove);
}
