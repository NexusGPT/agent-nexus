import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { color, printEnvelope } from "../../output";
import { confirmable, confirmDestructive } from "../../util/confirm";
import { PROMPT_VARIANT_ARCHIVE_CONTRACT } from "../prompt.contract.generated";

/** `nexus prompt variant archive` */
export function registerPromptVariantArchiveCommand(variant: Command, program: Command): void {
  const variantArchive = confirmable(variant.command("archive"))
    .description("Archive a variant: hidden from lists, refuses writes — nothing is deleted")
    .requiredOption("--agent-id <id>", "Agent ID")
    .requiredOption("--variant <ref>", 'Variant to archive: name, id — never "main"')
    .addHelpText(
      "after",
      `
Examples:
  $ nexus prompt variant archive --agent-id 11111111-1111-4111-8111-111111111111 \\
      --variant "FromV1" --yes

Notes:
  NOTHING IS DELETED. The variant's versions and its fork/promote edges
  survive and stay visible in "nexus prompt graph"; only the default list and
  the write doors close. There is no unarchive in this phase — to keep
  iterating on its content, fork a new variant from one of its versions.
  Saves and promotes on an archived variant answer a conflict naming the
  archived state.
  ARCHIVING FREES THE NAME: a new variant may take it straight away, which
  keeps re-runnable scripts re-runnable. An archived variant stays reachable
  by its id.
  MAIN CANNOT BE ARCHIVED.`
    )
    .action(async (opts: { agentId: string; variant: string; yes?: boolean }) => {
      try {
        if (
          !(await confirmDestructive(
            `Archive variant "${opts.variant}"? It will stop accepting saves.`,
            opts
          ))
        )
          return;
        const client = createClient(program.optsWithGlobals());
        const result = await client.promptVariants.archive(opts.agentId, opts.variant);
        printEnvelope(result, () => {
          console.log(`Archived variant ${color.bold(result.name)}. Nothing was deleted.`);
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option and the hand-written prose.
  bindCommand(variantArchive, PROMPT_VARIANT_ARCHIVE_CONTRACT);
}
