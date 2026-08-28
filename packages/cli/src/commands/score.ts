import { type Command, Option } from "commander";

import { createClient } from "../client";
import { bindCommand, enumOption } from "../contract-binding";
import { handleError } from "../errors";
import { color, printEnvelope, printTable } from "../output";
import { booleanFlag } from "../util/boolean-flag";
import {
  SCORE_LIST__PARAMS_SCORABLE_TYPE,
  SCORE_LIST_CONTRACT,
  SCORE_RECORD__BODY_SCORABLE_TYPE,
  SCORE_RECORD_CONTRACT
} from "./score.contract.generated";
import { parseMetadata, renderScoreValue, resolveScoreValue } from "./score-value";

/**
 * `nexus score` — attach a measured value to a scorable entity, and read one
 * entity's scores.
 *
 * ## Two verbs, and the missing ones are missing on purpose
 *
 * `record` and `list`. There is no `update`, no `delete` and no
 * organization-wide scan, because the public contract declares no such route:
 * the store is append-only from out here. A wrong score is superseded by a later
 * one rather than edited, and `list` returns both with the newer first.
 *
 * ## 🔴 `--value-type` DECIDES WHICH VALUE FLAG IS LEGAL
 *
 * A score carries exactly one value shape. `NUMERIC` takes `--numeric-value`,
 * `CATEGORICAL` takes `--categorical-value`, `BOOLEAN` takes `--boolean-value`,
 * and any other pairing is refused HERE rather than sent. That mirrors the
 * database's own `Score_value_matches_type_chk` constraint, so the CLI cannot
 * put a row on the wire the column would reject.
 *
 * The refusal is local and deliberate: sending a mismatched pair would answer
 * 400 with a Zod path, which is a worse message than naming the flag the caller
 * should have used.
 *
 * ## 🔴 YOU CANNOT SET THE EMITTER TYPE
 *
 * Every score recorded through the public API is stamped `CUSTOM_KPI`
 * server-side, so there is no `--emitter-type` flag to look for. An external
 * caller cannot forge an `EVAL_JUDGE` or `CSAT` score and have analytics count
 * it as one. Reads DO report `emitterType`, so provenance stays visible.
 *
 * ## An empty list is not proof the entity exists
 *
 * `list` is anchored on the API key's organization, so an entity in another
 * organization matches no rows and answers `[]` — the same answer a real entity
 * with no scores gives. The two are deliberately indistinguishable and the
 * Notes below say so, because reading `[]` as "this entity is unscored" is the
 * one mistake this surface invites.
 */
export function registerScoreCommands(program: Command): void {
  const score = program.command("score").description("Record and read scores on scorable entities");

  const record = score
    .command("record")
    .description("Record one score against a scorable entity")
    .requiredOption("--name <name>", 'Metric key, e.g. "helpfulness"')
    .addOption(
      enumOption(
        "--scorable-type <type>",
        "The kind of entity being scored",
        SCORE_RECORD__BODY_SCORABLE_TYPE
      ).makeOptionMandatory()
    )
    .requiredOption("--scorable-id <uuid>", "UUID of the entity being scored")
    .addOption(
      new Option("--value-type <type>", "Which value shape this score carries")
        .choices(["NUMERIC", "CATEGORICAL", "BOOLEAN"])
        .makeOptionMandatory()
    )
    .option("--numeric-value <number>", "Value when --value-type is NUMERIC")
    .option("--categorical-value <string>", "Value when --value-type is CATEGORICAL")
    // `booleanFlag` REFUSES rather than coercing: without it every unrecognised
    // value reads as false, so `--boolean-value TRUE` would silently record the
    // opposite of what was typed, under a success envelope.
    .addOption(
      new Option("--boolean-value <bool>", "Value when --value-type is BOOLEAN").argParser(
        booleanFlag
      )
    )
    .option("--emitter-id <uuid>", "Id of the emitter, when it is an entity")
    .option("--emitter-name <name>", "Human label for the emitter")
    .option("--reasoning <text>", "Rationale for the score")
    .option("--metadata <json>", "Free-form JSON kept alongside the score")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus score record --name helpfulness --scorable-type CHAT \\
      --scorable-id 3f1b… --value-type NUMERIC --numeric-value 0.82
  $ nexus score record --name resolved --scorable-type CHAT \\
      --scorable-id 3f1b… --value-type BOOLEAN --boolean-value true
  $ nexus score list --scorable-type CHAT --scorable-id 3f1b… --json

Notes:
  --value-type DECIDES WHICH VALUE FLAG IS LEGAL, and a mismatch is refused
  here rather than sent. NUMERIC needs --numeric-value, CATEGORICAL needs
  --categorical-value, BOOLEAN needs --boolean-value. Passing the wrong one,
  or more than one, is an error naming the flag you should have used.
  THERE IS NO --emitter-type FLAG AND THAT IS DELIBERATE. Every score recorded
  through the public API is stamped CUSTOM_KPI server-side so an external
  caller cannot forge a judge or CSAT score. Reads still report emitterType.
  RECORDING IS AN APPEND, NEVER AN UPSERT. Recording the same metric on the
  same entity twice leaves two rows. There is no update and no delete — a
  wrong score is superseded by a later one, and "list" shows the newest first.
  THE ORGANIZATION IS THE API KEY'S. It is not a flag on either verb.
  To verify what the server actually returned, untouched:
    nexus api GET /scores --query scorableType=CHAT --query scorableId=<uuid>`
    )
    .action(async (opts: Record<string, string | undefined>) => {
      try {
        const value = resolveScoreValue(opts);
        const client = createClient(program.optsWithGlobals());
        const result = await client.scores.record({
          name: String(opts.name),
          scorableType: opts.scorableType as never,
          scorableId: String(opts.scorableId),
          ...(opts.emitterId === undefined ? {} : { emitterId: opts.emitterId }),
          ...(opts.emitterName === undefined ? {} : { emitterName: opts.emitterName }),
          ...(opts.reasoning === undefined ? {} : { reasoning: opts.reasoning }),
          ...(opts.metadata === undefined ? {} : { metadata: parseMetadata(opts.metadata) }),
          ...value
        });

        printEnvelope(result, () => {
          console.log(`Recorded score ${color.bold(result.scoreId)}.`);
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

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
    .addHelpText(
      "after",
      `
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
  BOTH FLAGS ARE REQUIRED. There is no "list every score" form.`
    )
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

  // Bound LAST, after the hand-written prose, so the generated reference lands
  // below the Notes — the ordering `known-issues` established.
  bindCommand(record, SCORE_RECORD_CONTRACT);
  bindCommand(list, SCORE_LIST_CONTRACT);
}
