import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { color, printEnvelope } from "../../output";
import { PROMPT_VARIANT_CREATE_CONTRACT } from "../prompt.contract.generated";

/** `nexus prompt variant create` */
export function registerPromptVariantCreateCommand(variant: Command, program: Command): void {
  const variantCreate = variant
    .command("create")
    .description("Fork a new variant (default source: the Main tip)")
    .requiredOption("--agent-id <id>", "Agent ID")
    .requiredOption("--name <name>", 'New variant name ("Main" is reserved)')
    .option("--from-version <versionId>", "Fork from this version instead of the Main tip")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus prompt variant create --agent-id 11111111-1111-4111-8111-111111111111 --name "Concise"
  $ nexus prompt variant create --agent-id 11111111-1111-4111-8111-111111111111 \\
      --name "FromV1" --from-version 22222222-2222-4222-8222-222222222222

Notes:
  THE FORK COPIES CONTENT, IT NEVER SHARES IT. The new variant's first version
  is a copy of the source version — compare against the source right after and
  the diff is empty. Later saves on either side never touch the other.
  "MAIN" IS RESERVED in any casing, and a duplicate name (compared
  case-insensitively) is refused with a conflict.
  WITHOUT --from-version the source is the Main tip; a fresh agent that has
  never saved falls back to its current draft prompt.
  An unknown --from-version answers "not found" — including a version that
  belongs to another agent, deliberately indistinguishable from a miss.`
    )
    .action(async (opts: { agentId: string; name: string; fromVersion?: string }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.promptVariants.create(opts.agentId, {
          name: opts.name,
          ...(opts.fromVersion !== undefined ? { fromVersionId: opts.fromVersion } : {})
        });
        printEnvelope(result, () => {
          console.log(`Created variant ${color.bold(result.name)} (${result.id}).`);
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option and the hand-written prose.
  bindCommand(variantCreate, PROMPT_VARIANT_CREATE_CONTRACT);
}
