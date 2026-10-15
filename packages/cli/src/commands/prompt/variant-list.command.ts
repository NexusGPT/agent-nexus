import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { printEnvelope, printTable } from "../../output";
import { PROMPT_VARIANT_LIST_CONTRACT } from "../prompt.contract.generated";

/** `nexus prompt variant list` */
export function registerPromptVariantListCommand(variant: Command, program: Command): void {
  const variantList = variant
    .command("list")
    .description("List the agent's variants, Main first")
    .requiredOption("--agent-id <id>", "Agent ID")
    .option("--all", "Include archived variants")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus prompt variant list --agent-id 11111111-1111-4111-8111-111111111111
  $ nexus prompt variant list --agent-id 11111111-1111-4111-8111-111111111111 --all --json

Notes:
  A FRESH AGENT ANSWERS EXACTLY ONE VARIANT, "Main" — it is created with the
  agent's lineage and cannot be renamed, archived, or created a second time.
  ARCHIVED VARIANTS ARE HIDDEN unless --all is passed. Archiving deletes
  nothing: the versions and graph edges of an archived variant survive.
  Under --json the payload is a BARE ARRAY of variants (no pagination — the
  set is small by construction).
  To verify what the server actually returned, untouched:
    nexus api GET /agents/<agentId>/prompt-variants --query includeArchived=true`
    )
    .action(async (opts: { agentId: string; all?: boolean }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.promptVariants.list(opts.agentId, {
          ...(opts.all ? { includeArchived: true } : {})
        });
        printEnvelope(result, () => {
          printTable(
            result.map((v) => ({
              name: v.isMain ? `${v.name} (main)` : v.name,
              status: v.status,
              versions: String(v.versionCount),
              tip: v.tipVersionId ?? "",
              id: v.id
            })),
            [
              { key: "name", label: "VARIANT", width: 24 },
              { key: "status", label: "STATUS", width: 10 },
              { key: "versions", label: "VERSIONS", width: 9 },
              { key: "tip", label: "TIP VERSION", width: 36 },
              { key: "id", label: "ID", width: 36 }
            ]
          );
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option and the hand-written prose, so the generated
  // reference lands below the Notes — the ordering the score namespace
  // established.
  bindCommand(variantList, PROMPT_VARIANT_LIST_CONTRACT, {
    // The wire field is the string enum "true"/"false" a query string can
    // carry; the CLI's spelling of it is the boolean --all flag above. Binding
    // the raw enum would put --include-archived <true|false> beside --all —
    // two flags for one bit.
    "Params.includeArchived": "exposed as the --all boolean; the enum is the query-string encoding"
  });
}
