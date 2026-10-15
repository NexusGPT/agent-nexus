import { type Command, Option } from "commander";

import { createClient } from "../../client";
import { bindCommand, enumOption } from "../../contract-binding";
import { handleError } from "../../errors";
import { color, printEnvelope } from "../../output";
import { booleanFlag } from "../../util/boolean-flag";
import {
  SCORE_RECORD__BODY_SCORABLE_TYPE,
  SCORE_RECORD_CONTRACT
} from "../score.contract.generated";
import { parseMetadata, resolveScoreValue } from "../score-value";

/**
 * Module-level, not inline in the registrar: this package's own pattern, so the
 * registrar below reads as wiring and the prose is editable without scrolling
 * through a command tree.
 */
const RECORD_HELP = `
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
    nexus api GET /scores --query scorableType=CHAT --query scorableId=<uuid>`;

/** `nexus score record` */
export function registerScoreRecordCommand(score: Command, program: Command): Command {
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
    .addHelpText("after", RECORD_HELP)
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

  // Bound LAST, after the hand-written prose, so the generated reference lands
  // below the Notes — the ordering `known-issues` established.
  bindCommand(record, SCORE_RECORD_CONTRACT);
  return record;
}
