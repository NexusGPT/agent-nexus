import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand, enumOption } from "../../contract-binding";
import { handleError } from "../../errors";
import { color, printEnvelope, printTable } from "../../output";
import { SCORE_LIST__PARAMS_SCORABLE_TYPE, SCORE_LIST_CONTRACT } from "../score.contract.generated";
import { renderScoreValue } from "../score-value";

const LIST_HELP = `
Examples:
  $ nexus score list --scorable-type CHAT --scorable-id 3f1b7c22-0000-4000-8000-000000000000
  $ nexus score list --scorable-type TRACE --scorable-id 3f1b7c22-0000-4000-8000-000000000000 --json

Notes:
  AN EMPTY LIST IS TWO DIFFERENT ANSWERS AND THIS COMMAND CANNOT TELL THEM
  APART. The read is anchored on your API key's organization, so an entity in
  another organization matches no rows and answers exactly what a real entity
  with no scores answers. Never read [] as proof the entity exists.
  THIS IS NOT PAGINATED. It is a bounded read of one entity's scores; the
  contract declares no route that scans an organization's scores, so there is
  no --page or --limit to pass and no cursor to follow.
  BOTH FLAGS ARE REQUIRED. There is no "list every score" form.`;

/** `nexus score list` */
export function registerScoreListCommand(score: Command, program: Command): Command {
  const list = score
    .command("list")
    .description("List every score on one scorable entity, newest first")
    .addOption(
      enumOption(
        "--scorable-type <type>",
        "The kind of entity whose scores to read",
        SCORE_LIST__PARAMS_SCORABLE_TYPE
      ).makeOptionMandatory()
    )
    .requiredOption("--scorable-id <uuid>", "UUID of the entity whose scores to read")
    .addHelpText("after", LIST_HELP)
    .action(async (opts: Record<string, string | undefined>) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.scores.list({
          scorableType: opts.scorableType as never,
          scorableId: String(opts.scorableId)
        });

        printEnvelope(result, () => {
          if (result.length === 0) {
            console.log(`No scores on ${String(opts.scorableType)} ${String(opts.scorableId)}.`);
            console.log(
              color.dim(
                "An entity outside your organization answers identically — this is not proof it exists."
              )
            );
            return;
          }

          printTable(
            result.map((s) => ({
              name: s.name,
              value: renderScoreValue(s),
              emitterType: s.emitterType,
              emitterName: s.emitterName ?? "",
              createdAt: s.createdAt
            })),
            [
              { key: "name", label: "METRIC", width: 24 },
              { key: "value", label: "VALUE", width: 18 },
              { key: "emitterType", label: "EMITTER", width: 16 },
              { key: "emitterName", label: "LABEL", width: 20 },
              { key: "createdAt", label: "RECORDED", width: 26 }
            ]
          );
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  bindCommand(list, SCORE_LIST_CONTRACT);
  return list;
}
