import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { printEnvelope, printTable } from "../../output";
import { PROMPT_VARIANT_VERSION_LIST_CONTRACT } from "../prompt.contract.generated";

/** `nexus prompt history` */
export function registerPromptHistoryCommand(prompt: Command, program: Command): void {
  const history = prompt
    .command("history")
    .description("A variant's versions, oldest first — the last row is the tip")
    .requiredOption("--agent-id <id>", "Agent ID")
    .option("--variant <ref>", 'Variant: name, id, or "main" (the default)', "main")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus prompt history --agent-id 11111111-1111-4111-8111-111111111111
  $ nexus prompt history --agent-id 11111111-1111-4111-8111-111111111111 --variant "Concise" --json

Notes:
  ASCENDING BY ORDINAL: under --json the payload is a bare array and [-1] is
  the tip. Ordinals are contiguous 1..n within a variant and never reused.
  WITHOUT --variant the history shown is Main's.
  A version created by a promote carries promotedFromVersionId — the variant
  tip it copied. isProduction marks the one version the agent serves live.
  History rows carry METADATA ONLY (no prompt body): read a version's content
  by diffing it against an empty ref or via the versions API.`
    )
    .action(async (opts: { agentId: string; variant: string }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.promptVariants.listVersions(opts.agentId, opts.variant);
        printEnvelope(result, () => {
          if (result.length === 0) {
            console.log("No versions on this variant yet.");
            return;
          }
          printTable(
            result.map((v) => ({
              ordinal: String(v.ordinal),
              type: v.type,
              name: v.name ?? "",
              production: v.isProduction ? "yes" : "",
              promotedFrom: v.promotedFromVersionId ?? "",
              id: v.id
            })),
            [
              { key: "ordinal", label: "#", width: 4 },
              { key: "type", label: "TYPE", width: 11 },
              { key: "name", label: "NAME", width: 16 },
              { key: "production", label: "LIVE", width: 5 },
              { key: "promotedFrom", label: "PROMOTED FROM", width: 36 },
              { key: "id", label: "ID", width: 36 }
            ]
          );
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option and the hand-written prose.
  bindCommand(history, PROMPT_VARIANT_VERSION_LIST_CONTRACT);
}
