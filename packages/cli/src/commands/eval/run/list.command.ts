import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand } from "../../../contract-binding";
import { handleError } from "../../../errors";
import { printEnvelope, printTable } from "../../../output";
import { firstNonBlankOr } from "../../../util/present-text";
import { PROMPT_EVAL_RUN_LIST_CONTRACT } from "../../eval.contract.generated";

const RUN_LIST_HELP = `
Examples:
  $ nexus eval run list
  $ nexus eval run list --agent-id 11111111-1111-4111-8111-111111111111 --json

Notes:
  Under --json the payload is a BARE ARRAY of runs.`;

/** `nexus eval run list` */
export function registerEvalRunListCommand(run: Command, program: Command): Command {
  const runList = run
    .command("list")
    .description("List eval runs, newest first")
    .option("--agent-id <id>", "Only this agent's runs")
    .addHelpText("after", RUN_LIST_HELP)
    .action(async (opts: { agentId?: string }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.promptEvalRuns.list({
          ...(opts.agentId !== undefined ? { agentId: opts.agentId } : {})
        });
        printEnvelope(result, () => {
          printTable(
            result.map((one) => ({
              name: firstNonBlankOr([one.name], "(unnamed)"),
              status: one.status,
              variants: one.candidates.map((c) => c.variantName).join(","),
              cost: `$${(one.cost.totalUsdTenThousandths / 10_000).toFixed(4)}`,
              id: one.id
            })),
            [
              { key: "name", label: "NAME", width: 22 },
              { key: "status", label: "STATUS", width: 10 },
              { key: "variants", label: "VARIANTS", width: 24 },
              { key: "cost", label: "COST", width: 10 },
              { key: "id", label: "ID", width: 36 }
            ]
          );
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  bindCommand(runList, PROMPT_EVAL_RUN_LIST_CONTRACT);
  return runList;
}
